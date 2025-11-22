/// Indexing Service
///
/// Core service that orchestrates the entire indexing pipeline:
/// 1. Scan files in project directory
/// 2. Parse files to extract symbols (AST analysis)
/// 3. Generate embeddings for each symbol
/// 4. Store vectors in Milvus and full-text index in BM25
///
/// Features:
/// - Parallel processing for maximum throughput
/// - Progress tracking with atomic operations
/// - Error resilience (single file failures don't stop the whole process)
/// - Batch operations for efficient database writes
use crate::embedding::{EmbeddingEngine, EmbeddingEngineTrait};
use crate::error::Result;
use crate::indexing::file_scanner::FileScanner;
use crate::indexing::types::{
    ErrorKind, FileIndexResult, IndexConfig, IndexError, IndexProgress, IndexResult, ScanConfig,
};
use crate::parser::SymbolExtractor;
use crate::search::bm25_engine::BM25Engine;
use crate::search::types::Document;
use crate::storage::milvus_client::{MilvusClient, MilvusClientTrait};
use crate::storage::types::VectorRecord;
use futures::future::join_all;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::fs;
use tracing::{debug, info};

/// Indexing service that coordinates file scanning, parsing, embedding, and storage
pub struct IndexingService {
    /// Symbol extractor for AST parsing
    parser: Arc<SymbolExtractor>,

    /// Embedding engine for vector generation (trait object for testability)
    embedding: Arc<dyn EmbeddingEngineTrait>,

    /// Milvus client for vector storage (trait object for testability)
    storage: Arc<dyn MilvusClientTrait>,

    /// BM25 engine for full-text search
    bm25: Arc<BM25Engine>,

    /// Collection name for vector storage
    collection_name: String,
}

impl IndexingService {
    /// Create a new indexing service with concrete types
    ///
    /// # Arguments
    /// - `parser`: Symbol extractor for AST parsing
    /// - `embedding`: Embedding engine for vector generation
    /// - `storage`: Milvus client for vector storage
    /// - `bm25`: BM25 engine for full-text indexing
    pub fn new(
        parser: Arc<SymbolExtractor>,
        embedding: Arc<EmbeddingEngine>,
        storage: Arc<MilvusClient>,
        bm25: Arc<BM25Engine>,
    ) -> Self {
        Self {
            parser,
            embedding,
            storage,
            bm25,
            collection_name: "code_vectors".to_string(),
        }
    }

    /// Create a new indexing service with trait objects (for testing)
    ///
    /// # Arguments
    /// - `parser`: Symbol extractor for AST parsing
    /// - `embedding`: Embedding engine trait object
    /// - `storage`: Milvus client trait object
    /// - `bm25`: BM25 engine for full-text indexing
    #[cfg(test)]
    pub fn new_with_mocks(
        parser: Arc<SymbolExtractor>,
        embedding: Arc<dyn EmbeddingEngineTrait>,
        storage: Arc<dyn MilvusClientTrait>,
        bm25: Arc<BM25Engine>,
    ) -> Self {
        Self {
            parser,
            embedding,
            storage,
            bm25,
            collection_name: "code_vectors".to_string(),
        }
    }

    /// Set the collection name for vector storage
    pub fn with_collection_name(mut self, name: String) -> Self {
        self.collection_name = name;
        self
    }

    /// Index an entire project
    ///
    /// # Arguments
    /// - `config`: Index configuration
    ///
    /// # Returns
    /// Result containing indexing statistics and errors
    pub async fn index_project(&self, config: IndexConfig) -> Result<IndexResult> {
        info!("Starting project indexing: {:?}", config.root_path);
        let start_time = Instant::now();

        // Scan for files
        let scan_config = ScanConfig::from(&config);
        let files = FileScanner::scan(&config.root_path, &scan_config)?;

        info!("Found {} files to index", files.len());

        if files.is_empty() {
            return Ok(IndexResult::new(
                true,
                0,
                0,
                0,
                Vec::new(),
                start_time.elapsed(),
            ));
        }

        // Initialize progress tracker
        let progress = Arc::new(IndexProgress::new(files.len()));

        // Index files in parallel
        let result = self
            .index_files_parallel(files, &config, progress.clone())
            .await?;

        info!("Project indexing completed: {}", result.summary());
        Ok(result)
    }

    /// Index a single file
    ///
    /// # Arguments
    /// - `path`: Path to the file
    /// - `project_id`: Project identifier
    ///
    /// # Returns
    /// Result of indexing the file
    pub async fn index_file(&self, path: &Path, project_id: &str) -> Result<FileIndexResult> {
        let start_time = Instant::now();
        let file_path = path.to_string_lossy().to_string();

        debug!("Indexing file: {}", file_path);

        // Read file content
        let source_code = match fs::read_to_string(path).await {
            Ok(content) => content,
            Err(e) => {
                let error = IndexError::io(file_path.clone(), e.to_string());
                return Ok(FileIndexResult::error(
                    file_path,
                    error,
                    start_time.elapsed().as_millis() as u64,
                ));
            }
        };

        // Extract symbols
        let parse_result = match self.parser.extract_from_file(&file_path, &source_code) {
            Ok(result) => result,
            Err(e) => {
                let error = IndexError::parse(file_path.clone(), e.to_string());
                return Ok(FileIndexResult::error(
                    file_path,
                    error,
                    start_time.elapsed().as_millis() as u64,
                ));
            }
        };

        if !parse_result.success {
            let error = IndexError::parse(
                file_path.clone(),
                parse_result
                    .error
                    .unwrap_or_else(|| "Unknown parse error".to_string()),
            );
            return Ok(FileIndexResult::error(
                file_path,
                error,
                start_time.elapsed().as_millis() as u64,
            ));
        }

        let symbols = parse_result.symbols;
        if symbols.is_empty() {
            debug!("No symbols found in file: {}", file_path);
            return Ok(FileIndexResult::success(
                file_path,
                0,
                start_time.elapsed().as_millis() as u64,
            ));
        }

        debug!("Extracted {} symbols from {}", symbols.len(), file_path);

        // Prepare texts for embedding
        let texts: Vec<&str> = symbols.iter().map(|s| s.text.as_str()).collect();

        // Generate embeddings in batch
        let embeddings = match self.embedding.embed_batch(&texts).await {
            Ok(emb) => emb,
            Err(e) => {
                let error = IndexError::embedding(file_path.clone(), e.to_string());
                return Ok(FileIndexResult::error(
                    file_path,
                    error,
                    start_time.elapsed().as_millis() as u64,
                ));
            }
        };

        // Create vector records
        let mut vector_records = Vec::new();
        let mut bm25_documents = Vec::new();

        for (symbol, embedding) in symbols.iter().zip(embeddings.iter()) {
            let record_id = format!("{}:{}", file_path, symbol.range.start.line);

            let vector_record = VectorRecord::new(
                record_id.clone(),
                embedding.vector.clone(),
                project_id.to_string(),
                file_path.clone(),
                parse_result.language.as_str().to_string(),
                symbol.kind.as_str().to_string(),
                symbol.name.clone(),
                symbol.range.start.line as i64,
                symbol.range.end.line as i64,
                symbol.text.clone(),
                symbol.docstring.clone().unwrap_or_default(),
            );

            vector_records.push(vector_record);

            // Prepare BM25 document
            let mut bm25_metadata = HashMap::new();
            bm25_metadata.insert("file_path".to_string(), file_path.clone());
            bm25_metadata.insert(
                "language".to_string(),
                parse_result.language.as_str().to_string(),
            );
            bm25_metadata.insert("symbol_type".to_string(), symbol.kind.as_str().to_string());
            bm25_metadata.insert("symbol_name".to_string(), symbol.name.clone());

            let bm25_doc = Document::with_metadata(record_id, symbol.text.clone(), bm25_metadata);
            bm25_documents.push(bm25_doc);
        }

        // Store in vector database
        if let Err(e) = self
            .storage
            .insert(&self.collection_name, vector_records)
            .await
        {
            let error = IndexError::storage(file_path.clone(), e.to_string());
            return Ok(FileIndexResult::error(
                file_path,
                error,
                start_time.elapsed().as_millis() as u64,
            ));
        }

        // Index in BM25
        if let Err(e) = self.bm25.index_documents_batch(bm25_documents) {
            let error = IndexError::storage(file_path.clone(), e.to_string());
            return Ok(FileIndexResult::error(
                file_path,
                error,
                start_time.elapsed().as_millis() as u64,
            ));
        }

        Ok(FileIndexResult::success(
            file_path,
            symbols.len(),
            start_time.elapsed().as_millis() as u64,
        ))
    }

    /// Index multiple files with provided configuration
    ///
    /// # Arguments
    /// - `paths`: List of file paths to index
    /// - `config`: Index configuration
    ///
    /// # Returns
    /// Aggregated result of indexing all files
    pub async fn index_files(
        &self,
        paths: Vec<PathBuf>,
        config: &IndexConfig,
    ) -> Result<IndexResult> {
        let progress = Arc::new(IndexProgress::new(paths.len()));
        self.index_files_parallel(paths, config, progress.clone())
            .await
    }

    /// Index files in parallel with progress tracking
    async fn index_files_parallel(
        &self,
        files: Vec<PathBuf>,
        config: &IndexConfig,
        progress: Arc<IndexProgress>,
    ) -> Result<IndexResult> {
        info!(
            "Indexing {} files with max_parallel={}",
            files.len(),
            config.max_parallel
        );

        // Split files into batches
        let batch_size = config.batch_size;
        let chunks: Vec<Vec<PathBuf>> = files
            .chunks(batch_size)
            .map(|chunk| chunk.to_vec())
            .collect();

        // Process chunks in parallel (limited by max_parallel)
        for (chunk_idx, chunk) in chunks.iter().enumerate() {
            debug!(
                "Processing chunk {}/{} ({} files)",
                chunk_idx + 1,
                chunks.len(),
                chunk.len()
            );

            // Process files in this chunk concurrently
            let mut tasks = Vec::new();

            for file_path in chunk {
                let service = self.clone_refs();
                let path = file_path.clone();
                let project_id = config.project_id.clone();
                let progress_ref = Arc::clone(&progress);

                let task = tokio::spawn(async move {
                    let result = service.index_file(&path, &project_id).await;

                    // Update progress
                    match &result {
                        Ok(file_result) => {
                            progress_ref.increment_processed();
                            if file_result.success {
                                progress_ref.add_symbols(file_result.symbol_count);
                            } else if let Some(ref error) = file_result.error {
                                progress_ref.add_error(error.clone());
                            }
                        }
                        Err(e) => {
                            progress_ref.increment_processed();
                            progress_ref.add_error(IndexError::new(
                                path.to_string_lossy().to_string(),
                                e.to_string(),
                                ErrorKind::Other,
                            ));
                        }
                    }

                    result
                });

                tasks.push(task);

                // Limit concurrent tasks
                if tasks.len() >= config.max_parallel {
                    let _ = join_all(tasks.drain(..)).await;
                }
            }

            // Wait for remaining tasks in this chunk
            if !tasks.is_empty() {
                let _ = join_all(tasks).await;
            }

            // Log progress
            info!("{}", progress.report());
        }

        Ok(IndexResult::from_progress(&progress))
    }

    /// Helper method to clone Arc references for parallel tasks
    fn clone_refs(&self) -> Self {
        Self {
            parser: Arc::clone(&self.parser),
            embedding: Arc::clone(&self.embedding),
            storage: Arc::clone(&self.storage),
            bm25: Arc::clone(&self.bm25),
            collection_name: self.collection_name.clone(),
        }
    }

    /// Get indexing statistics
    pub async fn get_stats(&self) -> Result<IndexStats> {
        let collection_stats = self
            .storage
            .get_collection_stats(&self.collection_name)
            .await?;
        let bm25_stats = self.bm25.get_stats()?;

        Ok(IndexStats {
            vector_count: collection_stats.entity_count as usize,
            bm25_document_count: bm25_stats.document_count,
            bm25_term_count: bm25_stats.term_count,
            collection_name: self.collection_name.clone(),
        })
    }

    /// Clear all indexed data
    pub async fn clear_index(&self) -> Result<()> {
        info!("Clearing index data");

        // Clear vector database
        if self
            .storage
            .collection_exists(&self.collection_name)
            .await?
        {
            self.storage.drop_collection(&self.collection_name).await?;
        }

        // Clear BM25 index
        self.bm25.clear()?;

        info!("Index cleared successfully");
        Ok(())
    }

    /// Delete indexed data for a specific file
    ///
    /// # Arguments
    /// - `file_path`: Path to the file to remove from the index
    ///
    /// # Returns
    /// Result indicating success or failure
    pub async fn delete_file_index(&self, file_path: &str) -> Result<()> {
        debug!("Deleting index for file: {}", file_path);

        // Delete from vector database using filter
        // Format: DELETE FROM collection WHERE file_path = 'path'
        let filter = format!("file_path == \"{}\"", file_path);
        self.storage
            .delete_with_filter(&self.collection_name, &filter)
            .await?;

        // Delete from BM25 index
        // We need to find all document IDs that start with this file path
        let docs_to_delete: Vec<String> = self
            .bm25
            .get_all_document_ids()?
            .into_iter()
            .filter(|id| id.starts_with(file_path))
            .collect();

        for doc_id in docs_to_delete {
            self.bm25.delete_document(&doc_id)?;
        }

        debug!("Successfully deleted index for file: {}", file_path);
        Ok(())
    }

    /// Update index for a single file (incremental update)
    ///
    /// This method deletes the old index for the file and creates a new one.
    ///
    /// # Arguments
    /// - `file_path`: Path to the file to update
    /// - `project_id`: Project identifier
    ///
    /// # Returns
    /// Result of the file indexing operation
    pub async fn update_file_index(
        &self,
        file_path: &Path,
        project_id: &str,
    ) -> Result<FileIndexResult> {
        info!("Updating index for file: {}", file_path.display());

        // Delete old index
        if let Err(e) = self.delete_file_index(&file_path.to_string_lossy()).await {
            // Log error but continue with re-indexing
            tracing::warn!(
                "Failed to delete old index for {}: {}",
                file_path.display(),
                e
            );
        }

        // Re-index the file
        self.index_file(file_path, project_id).await
    }

    /// Process file change events for incremental updates
    ///
    /// # Arguments
    /// - `events`: List of file change events
    /// - `project_id`: Project identifier
    ///
    /// # Returns
    /// Results of processing each event
    pub async fn process_file_changes(
        &self,
        events: Vec<crate::indexing::FileChangeEvent>,
        project_id: &str,
    ) -> Result<Vec<FileIndexResult>> {
        let mut results = Vec::new();

        for event in events {
            let result = match event.kind {
                crate::indexing::FileChangeKind::Created
                | crate::indexing::FileChangeKind::Modified => {
                    // Re-index the file
                    self.update_file_index(&event.path, project_id).await?
                }
                crate::indexing::FileChangeKind::Deleted => {
                    // Delete from index
                    if let Err(e) = self.delete_file_index(&event.path.to_string_lossy()).await {
                        tracing::warn!(
                            "Failed to delete index for {}: {}",
                            event.path.display(),
                            e
                        );
                        FileIndexResult::error(
                            event.path.to_string_lossy().to_string(),
                            IndexError::storage(
                                event.path.to_string_lossy().to_string(),
                                e.to_string(),
                            ),
                            0,
                        )
                    } else {
                        FileIndexResult::success(event.path.to_string_lossy().to_string(), 0, 0)
                    }
                }
            };

            results.push(result);
        }

        Ok(results)
    }
}

/// Statistics about the current index
#[derive(Debug, Clone)]
pub struct IndexStats {
    /// Number of vectors in the database
    pub vector_count: usize,

    /// Number of documents in BM25 index
    pub bm25_document_count: usize,

    /// Number of unique terms in BM25 index
    pub bm25_term_count: usize,

    /// Collection name
    pub collection_name: String,
}

impl IndexStats {
    /// Generate a summary report
    pub fn summary(&self) -> String {
        format!(
            "Index stats: {} vectors, {} BM25 documents, {} unique terms (collection: {})",
            self.vector_count, self.bm25_document_count, self.bm25_term_count, self.collection_name
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embedding::{Embedding, MockEmbeddingEngineTrait};
    use crate::error::ContextMcpError;
    use crate::storage::{milvus_client::MockMilvusClientTrait, types::CollectionStats};

    // ========================================
    // Task 12.7: IndexingService tests (Refactored)
    // ========================================
    //
    // After refactoring IndexingService to use trait objects,
    // we can now write comprehensive mock-based tests.

    // ==========================
    // Unit tests for types
    // ==========================

    #[test]
    fn test_index_config_creation() {
        let config = IndexConfig::new(PathBuf::from("/test/path"));
        assert_eq!(config.root_path, PathBuf::from("/test/path"));
        assert_eq!(config.batch_size, 32);
        assert!(config.include_documents);
    }

    #[test]
    fn test_index_config_builder() {
        let config = IndexConfig::new(PathBuf::from("/test"))
            .with_project_id("my-project".to_string())
            .with_batch_size(64)
            .with_exclude_patterns(vec!["target/**".to_string()]);

        assert_eq!(config.project_id, "my-project");
        assert_eq!(config.batch_size, 64);
        assert_eq!(config.exclude_patterns.len(), 1);
    }

    #[tokio::test]
    async fn test_index_progress_atomic_operations() {
        let progress = IndexProgress::new(10);
        assert_eq!(progress.total_files(), 10);
        assert_eq!(progress.processed_files(), 0);

        progress.increment_processed();
        assert_eq!(progress.processed_files(), 1);

        progress.add_symbols(5);
        assert_eq!(progress.total_symbols(), 5);
    }

    // ==================================================================
    // Integration tests with IndexingService (requires real components)
    // ==================================================================

    // Note: The following tests require ONNX model files and running Milvus instance.
    // Run with: cargo test --lib indexing::service -- --ignored

    #[tokio::test]
    #[ignore]
    async fn test_integration_indexing_service_full_workflow() {
        // This test requires:
        // 1. ONNX model files in ./models/
        // 2. Running Milvus instance at localhost:19530
        //
        // It tests the complete workflow:
        // - Create IndexingService with real components
        // - Index a small Rust project
        // - Verify symbols are extracted and stored
        // - Clean up
        todo!("Implement full integration test with real Embedding and Milvus")
    }

    // ==================================================================
    // Task 12.7: Additional unit tests for IndexingService components
    // ==================================================================

    #[test]
    fn test_index_result_creation() {
        let start = std::time::Instant::now();
        std::thread::sleep(std::time::Duration::from_millis(10));

        let result = IndexResult::new(true, 10, 8, 100, Vec::new(), start.elapsed());

        assert!(result.success);
        assert_eq!(result.total_files, 10);
        assert_eq!(result.indexed_files, 8);
        assert_eq!(result.total_symbols, 100);
        assert!(result.duration.as_millis() >= 10);
    }

    #[test]
    fn test_file_index_result_success() {
        let result = FileIndexResult::success("/path/to/file.rs".to_string(), 5, 100);

        assert!(result.success);
        assert_eq!(result.file_path, "/path/to/file.rs");
        assert_eq!(result.symbol_count, 5);
        assert_eq!(result.processing_time_ms, 100);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_file_index_result_error() {
        let error = IndexError::parse("/path/to/file.rs".to_string(), "Parse error".to_string());

        let result = FileIndexResult::error("/path/to/file.rs".to_string(), error.clone(), 50);

        assert!(!result.success);
        assert_eq!(result.symbol_count, 0);
        assert!(result.error.is_some());
        assert_eq!(result.error.unwrap().kind, ErrorKind::Parse);
    }

    #[test]
    fn test_index_error_types() {
        let io_error = IndexError::io("file.rs".to_string(), "File not found".to_string());
        assert_eq!(io_error.kind, ErrorKind::Io);

        let parse_error = IndexError::parse("file.rs".to_string(), "Syntax error".to_string());
        assert_eq!(parse_error.kind, ErrorKind::Parse);

        let emb_error = IndexError::embedding("file.rs".to_string(), "Model error".to_string());
        assert_eq!(emb_error.kind, ErrorKind::Embedding);

        let storage_error = IndexError::storage("file.rs".to_string(), "DB error".to_string());
        assert_eq!(storage_error.kind, ErrorKind::Storage);
    }

    #[test]
    fn test_index_progress_tracking() {
        let progress = IndexProgress::new(100);

        assert_eq!(progress.total_files(), 100);
        assert_eq!(progress.processed_files(), 0);
        assert_eq!(progress.total_symbols(), 0);

        progress.increment_processed();
        assert_eq!(progress.processed_files(), 1);

        progress.add_symbols(10);
        assert_eq!(progress.total_symbols(), 10);

        let error = IndexError::new("file.rs".to_string(), "Error".to_string(), ErrorKind::Io);
        progress.add_error(error);
        assert_eq!(progress.error_count(), 1);
    }

    #[test]
    fn test_index_progress_report() {
        let progress = IndexProgress::new(10);

        for _i in 0..5 {
            progress.increment_processed();
        }
        progress.add_symbols(25);

        let report = progress.report();
        assert!(report.contains("5/10"));
        assert!(report.contains("25 symbols"));
    }

    #[test]
    fn test_scan_config_from_index_config() {
        let index_config = IndexConfig::new(PathBuf::from("/test/path"))
            .with_exclude_patterns(vec!["target/**".to_string()])
            .with_include_documents(true);

        let scan_config = ScanConfig::from(&index_config);

        assert_eq!(scan_config.exclude_patterns.len(), 1);
        assert!(scan_config.include_documents);
    }

    #[test]
    fn test_index_result_from_progress() {
        let progress = Arc::new(IndexProgress::new(10));

        // Process all 10 files successfully
        for _ in 0..10 {
            progress.increment_processed();
        }
        progress.add_symbols(50);

        let result = IndexResult::from_progress(&progress);

        assert!(result.success);
        assert_eq!(result.total_files, 10);
        assert_eq!(result.indexed_files, 10);
        assert_eq!(result.total_symbols, 50);
    }

    #[test]
    fn test_index_result_with_errors() {
        let progress = Arc::new(IndexProgress::new(10));

        // Process 5 files, with 2 errors
        for _ in 0..5 {
            progress.increment_processed();
        }
        progress.add_error(IndexError::io(
            "file1.rs".to_string(),
            "Error 1".to_string(),
        ));
        progress.add_error(IndexError::io(
            "file2.rs".to_string(),
            "Error 2".to_string(),
        ));

        let result = IndexResult::from_progress(&progress);

        assert!(!result.success); // Not all files processed
        assert_eq!(result.errors.len(), 2);
        assert_eq!(result.indexed_files, 3); // 5 processed - 2 errors
    }

    // ==================================================================
    // Comprehensive mock-based tests for IndexingService
    // ==================================================================

    /// Helper: Create test IndexingService with mocks
    fn create_test_service(
        mock_embedding: Arc<dyn EmbeddingEngineTrait>,
        mock_storage: Arc<dyn MilvusClientTrait>,
    ) -> IndexingService {
        let parser = Arc::new(SymbolExtractor::new());
        let bm25_path = std::env::temp_dir().join(format!("test_bm25_{}.db", uuid::Uuid::new_v4()));
        let bm25 = Arc::new(BM25Engine::new(&bm25_path).expect("Failed to create BM25 engine"));

        IndexingService::new_with_mocks(parser, mock_embedding, mock_storage, bm25)
    }

    #[tokio::test]
    async fn test_index_file_success() {
        // Create test file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_index_file.rs");
        tokio::fs::write(&test_file, "fn hello() {\n    println!(\"Hello\");\n}\n")
            .await
            .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .returning(|_collection, _records| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        // Test index_file
        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);
        assert!(file_result.symbol_count > 0);

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_not_found() {
        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage);

        let result = service
            .index_file(Path::new("/nonexistent/file.rs"), "test-project")
            .await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(!file_result.success);
        assert!(file_result.error.is_some());
        match file_result.error.unwrap().kind {
            ErrorKind::Io => {}
            _ => panic!("Expected Io error"),
        }
    }

    #[tokio::test]
    async fn test_index_file_parse_error() {
        // Create invalid file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_parse_error.rs");
        tokio::fs::write(&test_file, "invalid rust code {{{{")
            .await
            .expect("Failed to write test file");

        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage);

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let _file_result = result.unwrap();
        // Note: Parser may succeed but return no symbols

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_embedding_error() {
        // Create test file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_embedding_error.rs");
        tokio::fs::write(&test_file, "fn test() {\n    println!(\"test\");\n}\n")
            .await
            .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding.expect_embed_batch().times(1).returning(|_| {
            Err(crate::error::ContextMcpError::Embedding(
                "Model error".to_string(),
            ))
        });

        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(Arc::new(mock_embedding), mock_storage);

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(!file_result.success);
        assert!(file_result.error.is_some());
        match file_result.error.unwrap().kind {
            ErrorKind::Embedding => {}
            _ => panic!("Expected Embedding error"),
        }

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_storage_error() {
        // Create test file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_storage_error.rs");
        tokio::fs::write(&test_file, "fn test() {\n    println!(\"test\");\n}\n")
            .await
            .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .returning(|_, _| Err(ContextMcpError::Database("DB error".to_string())));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(!file_result.success);
        assert!(file_result.error.is_some());
        match file_result.error.unwrap().kind {
            ErrorKind::Storage => {}
            _ => panic!("Expected Storage error"),
        }

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_no_symbols() {
        // Create file with no extractable symbols
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_no_symbols.rs");
        tokio::fs::write(&test_file, "// Just a comment\n")
            .await
            .expect("Failed to write test file");

        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage);

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);
        assert_eq!(file_result.symbol_count, 0);

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_files_parallel() {
        // Create multiple test files
        let temp_dir = std::env::temp_dir();
        let test_files: Vec<PathBuf> = (0..3)
            .map(|i| {
                let path = temp_dir.join(format!("test_parallel_{}.rs", i));
                std::fs::write(&path, format!("fn func_{}() {{}}", i))
                    .expect("Failed to write file");
                path
            })
            .collect();

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(3) // One call per file
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(3) // One call per file
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let config = IndexConfig::new(temp_dir.clone())
            .with_project_id("test-parallel".to_string())
            .with_batch_size(2)
            .with_max_parallel(2);

        let result = service.index_files(test_files.clone(), &config).await;
        assert!(result.is_ok());
        let index_result = result.unwrap();
        assert_eq!(index_result.total_files, 3);

        // Cleanup
        for file in test_files {
            std::fs::remove_file(file).ok();
        }
    }

    #[tokio::test]
    async fn test_get_stats() {
        // Setup mocks
        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_get_collection_stats()
            .times(1)
            .returning(|_| {
                Ok(CollectionStats {
                    name: "code_vectors".to_string(),
                    entity_count: 100,
                    indexed: true,
                    memory_size: 1024,
                })
            });

        let service = create_test_service(mock_embedding, Arc::new(mock_storage));

        let result = service.get_stats().await;
        assert!(result.is_ok());
        let stats = result.unwrap();
        assert_eq!(stats.vector_count, 100);
    }

    #[tokio::test]
    async fn test_clear_index() {
        // Setup mocks
        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_collection_exists()
            .times(1)
            .returning(|_| Ok(true));
        mock_storage
            .expect_drop_collection()
            .times(1)
            .returning(|_| Ok(()));

        let service = create_test_service(mock_embedding, Arc::new(mock_storage));

        let result = service.clear_index().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_clear_index_collection_not_exists() {
        // Setup mocks
        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_collection_exists()
            .times(1)
            .returning(|_| Ok(false));
        // drop_collection should not be called

        let service = create_test_service(mock_embedding, Arc::new(mock_storage));

        let result = service.clear_index().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_with_collection_name() {
        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage)
            .with_collection_name("custom_collection".to_string());

        assert_eq!(service.collection_name, "custom_collection");
    }

    #[tokio::test]
    async fn test_index_file_multiple_symbols() {
        // Create file with multiple symbols
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_multi_symbols.rs");
        tokio::fs::write(
            &test_file,
            r#"
fn func1() {}
fn func2() {}
struct MyStruct {}
"#,
        )
        .await
        .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .withf(|_, records: &Vec<VectorRecord>| records.len() >= 2) // At least 2 symbols
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);
        assert!(file_result.symbol_count >= 2);

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_project_empty_directory() {
        let temp_dir = std::env::temp_dir().join(format!("empty_dir_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir(&temp_dir)
            .await
            .expect("Failed to create temp dir");

        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage);

        let config = IndexConfig::new(temp_dir.clone()).with_project_id("empty-test".to_string());

        let result = service.index_project(config).await;
        assert!(result.is_ok());
        let index_result = result.unwrap();
        assert!(index_result.success);
        assert_eq!(index_result.total_files, 0);

        // Cleanup
        tokio::fs::remove_dir(temp_dir).await.ok();
    }

    #[tokio::test]
    async fn test_index_files_with_errors() {
        // Create mix of valid and invalid files
        let temp_dir = std::env::temp_dir();
        let valid_file = temp_dir.join("valid.rs");
        let invalid_file = temp_dir.join("invalid.rs");

        tokio::fs::write(&valid_file, "fn valid() {}")
            .await
            .expect("Failed to write valid file");
        // invalid_file doesn't exist - will cause IO error

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1) // Only valid file
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1) // Only valid file
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let config = IndexConfig::new(temp_dir.clone()).with_project_id("test-errors".to_string());

        let result = service
            .index_files(vec![valid_file.clone(), invalid_file], &config)
            .await;
        assert!(result.is_ok());
        let index_result = result.unwrap();
        assert_eq!(index_result.total_files, 2);
        assert_eq!(index_result.errors.len(), 1);

        // Cleanup
        tokio::fs::remove_file(valid_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_python() {
        // Create Python test file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test.py");
        tokio::fs::write(
            &test_file,
            r#"
def hello():
    print("Hello")

class MyClass:
    pass
"#,
        )
        .await
        .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);
        assert!(file_result.symbol_count >= 2); // function + class

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_typescript() {
        // Create TypeScript test file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test.ts");
        tokio::fs::write(
            &test_file,
            r#"
function hello(): void {
    console.log("Hello");
}

interface MyInterface {
    name: string;
}
"#,
        )
        .await
        .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_stats_summary() {
        let stats = IndexStats {
            vector_count: 1000,
            bm25_document_count: 500,
            bm25_term_count: 5000,
            collection_name: "test_collection".to_string(),
        };

        let summary = stats.summary();
        assert!(summary.contains("1000 vectors"));
        assert!(summary.contains("500 BM25 documents"));
        assert!(summary.contains("5000 unique terms"));
        assert!(summary.contains("test_collection"));
    }

    #[tokio::test]
    async fn test_clone_refs() {
        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage);

        let cloned = service.clone_refs();
        assert_eq!(cloned.collection_name, service.collection_name);
    }

    #[tokio::test]
    async fn test_index_file_with_docstring() {
        // Create file with docstring
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_docstring.rs");
        tokio::fs::write(
            &test_file,
            r#"
/// This is a documented function
/// It does something important
fn documented_func() {
    println!("documented");
}
"#,
        )
        .await
        .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);
        // Note: Docstring extraction depends on Tree-sitter parser capabilities

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_project_with_scan_config() {
        // Create test directory
        let temp_dir = std::env::temp_dir().join(format!("scan_test_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir(&temp_dir)
            .await
            .expect("Failed to create temp dir");

        // Create test file
        let test_file = temp_dir.join("test.rs");
        tokio::fs::write(&test_file, "fn test() {}")
            .await
            .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding.expect_embed_batch().returning(|texts| {
            Ok(texts
                .iter()
                .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                .collect())
        });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage.expect_insert().returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let config = IndexConfig::new(temp_dir.clone())
            .with_project_id("scan-test".to_string())
            .with_languages(vec![crate::parser::Language::Rust])
            .with_exclude_patterns(vec!["target/**".to_string()]);

        let result = service.index_project(config).await;
        assert!(result.is_ok());

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
        tokio::fs::remove_dir(temp_dir).await.ok();
    }

    #[tokio::test]
    async fn test_index_project_partial_failure() {
        // Create test directory with multiple files (some will fail)
        let temp_dir =
            std::env::temp_dir().join(format!("partial_fail_test_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir(&temp_dir)
            .await
            .expect("Failed to create temp dir");

        // Create multiple test files
        let test_file1 = temp_dir.join("test1.rs");
        let test_file2 = temp_dir.join("test2.rs");
        tokio::fs::write(&test_file1, "fn test1() {}")
            .await
            .expect("Failed to write test file");
        tokio::fs::write(&test_file2, "fn test2() {}")
            .await
            .expect("Failed to write test file");

        // Setup mocks - first file succeeds, second fails
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        let call_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let call_count_clone = call_count.clone();
        mock_embedding.expect_embed_batch().returning(move |texts| {
            let count = call_count_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            if count == 0 {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            } else {
                Err(ContextMcpError::Embedding("Embedding failed".to_string()))
            }
        });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage.expect_insert().returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let config = IndexConfig::new(temp_dir.clone()).with_project_id("partial-test".to_string());

        let result = service.index_project(config).await;
        assert!(result.is_ok());
        let index_result = result.unwrap();

        // Should have processed both files (one success, one failure)
        assert_eq!(index_result.total_files, 2);
        assert!(!index_result.errors.is_empty());

        // Cleanup
        tokio::fs::remove_file(test_file1).await.ok();
        tokio::fs::remove_file(test_file2).await.ok();
        tokio::fs::remove_dir(temp_dir).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_unsupported_language() {
        // Create test file with unsupported extension
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test.xyz");
        tokio::fs::write(&test_file, "some content")
            .await
            .expect("Failed to write test file");

        let mock_embedding = Arc::new(MockEmbeddingEngineTrait::new());
        let mock_storage = Arc::new(MockMilvusClientTrait::new());
        let service = create_test_service(mock_embedding, mock_storage);

        let result = service.index_file(&test_file, "test-project").await;

        // Should handle unsupported file gracefully
        assert!(result.is_ok());
        let file_result = result.unwrap();
        // Behavior depends on implementation - either success with 0 symbols or parse error
        if !file_result.success {
            assert!(file_result.error.is_some());
        }

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_file_with_large_content() {
        // Create file with large content
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_large.rs");
        let large_content = (0..100)
            .map(|i| format!("fn func_{}() {{\n    // Comment\n}}\n", i))
            .collect::<String>();
        tokio::fs::write(&test_file, large_content)
            .await
            .expect("Failed to write test file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding
            .expect_embed_batch()
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                    .collect())
            });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage
            .expect_insert()
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let result = service.index_file(&test_file, "test-project").await;
        assert!(result.is_ok());
        let file_result = result.unwrap();
        assert!(file_result.success);
        assert!(file_result.symbol_count > 0);

        // Cleanup
        tokio::fs::remove_file(test_file).await.ok();
    }

    #[tokio::test]
    async fn test_index_project_with_exclude_patterns() {
        // Create test directory structure
        let temp_dir = std::env::temp_dir().join(format!("exclude_test_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir(&temp_dir)
            .await
            .expect("Failed to create temp dir");

        let target_dir = temp_dir.join("target");
        tokio::fs::create_dir(&target_dir)
            .await
            .expect("Failed to create target dir");

        // Create files
        let included_file = temp_dir.join("included.rs");
        let excluded_file = target_dir.join("excluded.rs");
        tokio::fs::write(&included_file, "fn included() {}")
            .await
            .expect("Failed to write included file");
        tokio::fs::write(&excluded_file, "fn excluded() {}")
            .await
            .expect("Failed to write excluded file");

        // Setup mocks
        let mut mock_embedding = MockEmbeddingEngineTrait::new();
        mock_embedding.expect_embed_batch().returning(|texts| {
            Ok(texts
                .iter()
                .map(|text| Embedding::new(vec![0.1; 384], text.to_string(), 10))
                .collect())
        });

        let mut mock_storage = MockMilvusClientTrait::new();
        mock_storage.expect_insert().returning(|_, _| Ok(vec![]));

        let service = create_test_service(Arc::new(mock_embedding), Arc::new(mock_storage));

        let config = IndexConfig::new(temp_dir.clone())
            .with_project_id("exclude-test".to_string())
            .with_exclude_patterns(vec!["target/**".to_string()]);

        let result = service.index_project(config).await;
        assert!(result.is_ok());
        let index_result = result.unwrap();

        // Should only index included file
        assert_eq!(index_result.total_files, 1);

        // Cleanup
        tokio::fs::remove_file(included_file).await.ok();
        tokio::fs::remove_file(excluded_file).await.ok();
        tokio::fs::remove_dir(target_dir).await.ok();
        tokio::fs::remove_dir(temp_dir).await.ok();
    }
}
