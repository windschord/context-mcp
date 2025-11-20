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
use crate::embedding::EmbeddingEngine;
use crate::error::Result;
use crate::indexing::file_scanner::FileScanner;
use crate::indexing::types::{
    ErrorKind, FileIndexResult, IndexConfig, IndexError, IndexProgress, IndexResult, ScanConfig,
};
use crate::parser::SymbolExtractor;
use crate::search::bm25_engine::BM25Engine;
use crate::search::types::Document;
use crate::storage::milvus_client::MilvusClient;
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

    /// Embedding engine for vector generation
    embedding: Arc<EmbeddingEngine>,

    /// Milvus client for vector storage
    storage: Arc<MilvusClient>,

    /// BM25 engine for full-text search
    bm25: Arc<BM25Engine>,

    /// Collection name for vector storage
    collection_name: String,
}

impl IndexingService {
    /// Create a new indexing service
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

    // ========================================
    // Task 12.7: IndexingService tests
    // ========================================
    //
    // Note: IndexingService currently requires concrete types (EmbeddingEngine, MilvusClient).
    // Full mock-based testing would require refactoring to accept trait objects:
    //   Arc<dyn EmbeddingEngineTrait>, Arc<dyn MilvusClientTrait>
    //
    // The tests below focus on testable units (config, progress, stats).
    // Integration tests with real components are marked as #[ignore].

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

    #[test]
    fn test_index_stats_summary() {
        let stats = IndexStats {
            vector_count: 100,
            bm25_document_count: 50,
            bm25_term_count: 200,
            collection_name: "test_collection".to_string(),
        };

        let summary = stats.summary();
        assert!(summary.contains("100 vectors"));
        assert!(summary.contains("50 BM25 documents"));
        assert!(summary.contains("200 unique terms"));
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
}
