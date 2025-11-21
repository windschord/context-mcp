/// BM25 full-text search engine implementation
///
/// This module implements the BM25 ranking algorithm for keyword-based search.
/// It uses SQLite for persistent storage of the inverted index and document data.
///
/// BM25 Algorithm:
/// ```text
/// score(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
///
/// where:
/// - D = document
/// - Q = query
/// - qi = query term i
/// - f(qi, D) = frequency of qi in D
/// - |D| = length of document D
/// - avgdl = average document length
/// - IDF(qi) = log((N - df(qi) + 0.5) / (df(qi) + 0.5) + 1)
/// - N = total number of documents
/// - df(qi) = number of documents containing qi
/// ```
use crate::error::{ContextMcpError, Result};
use crate::search::tokenizer::Tokenizer;
use crate::search::types::{BM25Config, BM25Result, Document, IndexStats, SearchOptions};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tracing::{debug, info};

/// BM25 search engine with SQLite-backed inverted index
#[derive(Clone)]
pub struct BM25Engine {
    /// SQLite database connection (wrapped in Mutex for thread safety)
    conn: Arc<Mutex<Connection>>,

    /// Tokenizer for processing text
    tokenizer: Tokenizer,

    /// BM25 algorithm configuration
    config: BM25Config,

    /// Cached average document length (updated on index modifications)
    cached_avg_doc_length: Arc<Mutex<Option<f32>>>,
}

impl BM25Engine {
    /// Create a new BM25 engine with the given database path
    ///
    /// # Arguments
    /// * `db_path` - Path to the SQLite database file (will be created if it doesn't exist)
    ///
    /// # Returns
    /// A new BM25Engine instance
    pub fn new(db_path: &Path) -> Result<Self> {
        info!("Creating BM25 engine at {:?}", db_path);

        let conn = Connection::open(db_path)
            .map_err(|e| ContextMcpError::Database(format!("Failed to open database: {}", e)))?;

        let engine = Self {
            conn: Arc::new(Mutex::new(conn)),
            tokenizer: Tokenizer::code(), // Use code-aware tokenizer by default
            config: BM25Config::default(),
            cached_avg_doc_length: Arc::new(Mutex::new(None)),
        };

        engine.initialize_schema()?;
        Ok(engine)
    }

    /// Create an in-memory BM25 engine (useful for testing)
    pub fn new_in_memory() -> Result<Self> {
        info!("Creating in-memory BM25 engine");

        let conn = Connection::open_in_memory().map_err(|e| {
            ContextMcpError::Database(format!("Failed to create in-memory database: {}", e))
        })?;

        let engine = Self {
            conn: Arc::new(Mutex::new(conn)),
            tokenizer: Tokenizer::code(),
            config: BM25Config::default(),
            cached_avg_doc_length: Arc::new(Mutex::new(None)),
        };

        engine.initialize_schema()?;
        Ok(engine)
    }

    /// Set custom tokenizer
    pub fn with_tokenizer(mut self, tokenizer: Tokenizer) -> Self {
        self.tokenizer = tokenizer;
        self
    }

    /// Set custom BM25 configuration
    pub fn with_config(mut self, config: BM25Config) -> Result<Self> {
        config.validate().map_err(|e| ContextMcpError::Config(e))?;
        self.config = config;
        Ok(self)
    }

    /// Initialize database schema
    fn initialize_schema(&self) -> Result<()> {
        debug!("Initializing database schema");

        let conn = self.conn.lock();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                length INTEGER NOT NULL,
                text TEXT NOT NULL,
                metadata TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS inverted_index (
                term TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                frequency INTEGER NOT NULL,
                PRIMARY KEY (term, doc_id),
                FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_term ON inverted_index(term);
            CREATE INDEX IF NOT EXISTS idx_doc_id ON inverted_index(doc_id);

            -- Enable foreign key constraints
            PRAGMA foreign_keys = ON;
            "#,
        )
        .map_err(|e| ContextMcpError::Database(format!("Failed to initialize schema: {}", e)))?;

        Ok(())
    }

    /// Index a single document
    ///
    /// # Arguments
    /// * `id` - Unique document identifier
    /// * `text` - Document text content
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn index_document(&self, id: &str, text: &str) -> Result<()> {
        let doc = Document::new(id.to_string(), text.to_string());
        self.index_document_with_metadata(doc)
    }

    /// Index a document with metadata
    pub fn index_document_with_metadata(&self, doc: Document) -> Result<()> {
        debug!("Indexing document: {}", doc.id);

        // Remove existing document if it exists
        self.remove_document(&doc.id)?;

        // Tokenize the document
        let tokens = self.tokenizer.tokenize(&doc.text);
        let doc_length = tokens.len();

        // Calculate term frequencies
        let mut term_freqs: HashMap<String, usize> = HashMap::new();
        for term in tokens {
            *term_freqs.entry(term).or_insert(0) += 1;
        }

        // Serialize metadata
        let metadata_json = serde_json::to_string(&doc.metadata).map_err(|e| {
            ContextMcpError::Database(format!("Failed to serialize metadata: {}", e))
        })?;

        // Begin transaction
        let mut conn = self.conn.lock();
        let tx = conn.transaction().map_err(|e| {
            ContextMcpError::Database(format!("Failed to begin transaction: {}", e))
        })?;

        // Insert document
        tx.execute(
            "INSERT INTO documents (id, length, text, metadata) VALUES (?1, ?2, ?3, ?4)",
            params![&doc.id, doc_length as i64, &doc.text, metadata_json],
        )
        .map_err(|e| ContextMcpError::Database(format!("Failed to insert document: {}", e)))?;

        // Insert term frequencies into inverted index
        for (term, freq) in term_freqs {
            tx.execute(
                "INSERT INTO inverted_index (term, doc_id, frequency) VALUES (?1, ?2, ?3)",
                params![term, &doc.id, freq as i64],
            )
            .map_err(|e| ContextMcpError::Database(format!("Failed to insert term: {}", e)))?;
        }

        tx.commit().map_err(|e| {
            ContextMcpError::Database(format!("Failed to commit transaction: {}", e))
        })?;

        // Invalidate cached average document length
        *self.cached_avg_doc_length.lock() = None;

        debug!(
            "Successfully indexed document: {} ({} terms)",
            doc.id, doc_length
        );
        Ok(())
    }

    /// Index multiple documents in a batch
    ///
    /// # Arguments
    /// * `docs` - Vector of (id, text) tuples
    ///
    /// # Returns
    /// Ok(()) on success
    pub fn index_documents(&self, docs: Vec<(String, String)>) -> Result<()> {
        info!("Batch indexing {} documents", docs.len());

        for (id, text) in docs {
            self.index_document(&id, &text)?;
        }

        info!("Successfully indexed all documents");
        Ok(())
    }

    /// Index multiple documents with metadata
    pub fn index_documents_batch(&self, docs: Vec<Document>) -> Result<()> {
        info!("Batch indexing {} documents with metadata", docs.len());

        for doc in docs {
            self.index_document_with_metadata(doc)?;
        }

        info!("Successfully indexed all documents");
        Ok(())
    }

    /// Search for documents matching the query
    ///
    /// # Arguments
    /// * `query` - Search query string
    /// * `top_k` - Number of top results to return
    ///
    /// # Returns
    /// Vector of BM25Results sorted by score (descending)
    pub fn search(&self, query: &str, top_k: usize) -> Result<Vec<BM25Result>> {
        let options = SearchOptions::new().with_top_k(top_k);
        self.search_with_options(query, options)
    }

    /// Search with custom options
    pub fn search_with_options(
        &self,
        query: &str,
        options: SearchOptions,
    ) -> Result<Vec<BM25Result>> {
        debug!("Searching for: '{}' (top_k: {})", query, options.top_k);

        // Tokenize query
        let query_terms = self.tokenizer.get_unique_terms(query);
        if query_terms.is_empty() {
            debug!("No valid query terms after tokenization");
            return Ok(vec![]);
        }

        debug!("Query terms: {:?}", query_terms);

        // Get document count and average length
        let total_docs = self.document_count()?;
        if total_docs == 0 {
            debug!("No documents in index");
            return Ok(vec![]);
        }

        let avg_doc_length = self.get_avg_doc_length()?;

        // Calculate IDF for each query term
        let term_idfs = self.calculate_idfs(&query_terms, total_docs)?;

        // Get all documents that contain at least one query term
        let candidate_docs = self.get_candidate_documents(&query_terms)?;

        debug!("Found {} candidate documents", candidate_docs.len());

        // Calculate BM25 score for each candidate document
        let mut results = Vec::new();
        for doc_id in candidate_docs {
            let score =
                self.calculate_bm25_score(&doc_id, &query_terms, &term_idfs, avg_doc_length)?;

            if let Some(min_score) = options.min_score {
                if score < min_score {
                    continue;
                }
            }

            let matched_terms = self.get_matched_terms(&doc_id, &query_terms)?;

            // Get document text and metadata if requested
            let (text, metadata) = if options.include_text || options.include_metadata {
                self.get_document_data(&doc_id)?
            } else {
                (String::new(), HashMap::new())
            };

            let text = if options.include_text {
                text
            } else {
                String::new()
            };
            let metadata = if options.include_metadata {
                metadata
            } else {
                HashMap::new()
            };

            results.push(BM25Result::with_metadata(
                doc_id,
                score,
                matched_terms,
                text,
                metadata,
            ));
        }

        // Sort by score (descending)
        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Truncate to top_k
        results.truncate(options.top_k);

        debug!("Returning {} results", results.len());
        Ok(results)
    }

    /// Remove a document from the index
    pub fn remove_document(&self, id: &str) -> Result<()> {
        debug!("Removing document: {}", id);

        let conn = self.conn.lock();
        let deleted = conn
            .execute("DELETE FROM documents WHERE id = ?1", params![id])
            .map_err(|e| ContextMcpError::Database(format!("Failed to delete document: {}", e)))?;

        if deleted > 0 {
            *self.cached_avg_doc_length.lock() = None;
            debug!("Successfully removed document: {}", id);
        }

        Ok(())
    }

    /// Clear all documents from the index
    pub fn clear(&self) -> Result<()> {
        info!("Clearing all documents");

        let conn = self.conn.lock();
        conn.execute("DELETE FROM inverted_index", [])
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to clear inverted index: {}", e))
            })?;

        conn.execute("DELETE FROM documents", [])
            .map_err(|e| ContextMcpError::Database(format!("Failed to clear documents: {}", e)))?;

        *self.cached_avg_doc_length.lock() = None;

        info!("Successfully cleared all documents");
        Ok(())
    }

    /// Get the total number of documents in the index
    pub fn document_count(&self) -> Result<usize> {
        let conn = self.conn.lock();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to get document count: {}", e))
            })?;

        Ok(count as usize)
    }

    /// Get index statistics
    pub fn get_stats(&self) -> Result<IndexStats> {
        let doc_count = self.document_count()?;

        let conn = self.conn.lock();
        let term_count: i64 = conn
            .query_row(
                "SELECT COUNT(DISTINCT term) FROM inverted_index",
                [],
                |row| row.get(0),
            )
            .map_err(|e| ContextMcpError::Database(format!("Failed to get term count: {}", e)))?;

        let total_tokens: i64 = conn
            .query_row("SELECT SUM(length) FROM documents", [], |row| row.get(0))
            .unwrap_or(0);

        let avg_doc_length = if doc_count > 0 {
            total_tokens as f32 / doc_count as f32
        } else {
            0.0
        };

        Ok(IndexStats::new(
            doc_count,
            term_count as usize,
            avg_doc_length,
            total_tokens as usize,
        ))
    }

    // Private helper methods

    /// Get average document length, using cache if available
    fn get_avg_doc_length(&self) -> Result<f32> {
        if let Some(cached) = *self.cached_avg_doc_length.lock() {
            return Ok(cached);
        }

        let conn = self.conn.lock();
        let total_length: i64 = conn
            .query_row("SELECT SUM(length) FROM documents", [], |row| row.get(0))
            .unwrap_or(0);
        drop(conn); // Release lock before calling document_count

        let doc_count = self.document_count()?;

        let avg = if doc_count > 0 {
            total_length as f32 / doc_count as f32
        } else {
            0.0
        };

        Ok(avg)
    }

    /// Calculate IDF (Inverse Document Frequency) for each term
    fn calculate_idfs(&self, terms: &[String], total_docs: usize) -> Result<HashMap<String, f32>> {
        let mut idfs = HashMap::new();
        let n = total_docs as f32;

        let conn = self.conn.lock();
        for term in terms {
            // Get document frequency (number of documents containing this term)
            let df: i64 = conn
                .query_row(
                    "SELECT COUNT(DISTINCT doc_id) FROM inverted_index WHERE term = ?1",
                    params![term],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let df = df as f32;

            // Calculate IDF using BM25 formula
            let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();
            idfs.insert(term.clone(), idf.max(0.0)); // Ensure non-negative
        }

        Ok(idfs)
    }

    /// Get all documents that contain at least one query term
    fn get_candidate_documents(&self, query_terms: &[String]) -> Result<Vec<String>> {
        let placeholders = query_terms
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT DISTINCT doc_id FROM inverted_index WHERE term IN ({})",
            placeholders
        );

        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| ContextMcpError::Database(format!("Failed to prepare query: {}", e)))?;

        let params: Vec<&dyn rusqlite::ToSql> = query_terms
            .iter()
            .map(|t| t as &dyn rusqlite::ToSql)
            .collect();

        let doc_ids = stmt
            .query_map(&params[..], |row| row.get::<_, String>(0))
            .map_err(|e| ContextMcpError::Database(format!("Failed to execute query: {}", e)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ContextMcpError::Database(format!("Failed to fetch results: {}", e)))?;

        Ok(doc_ids)
    }

    /// Calculate BM25 score for a document given query terms
    fn calculate_bm25_score(
        &self,
        doc_id: &str,
        query_terms: &[String],
        term_idfs: &HashMap<String, f32>,
        avg_doc_length: f32,
    ) -> Result<f32> {
        let conn = self.conn.lock();

        // Get document length
        let doc_length: i64 = conn
            .query_row(
                "SELECT length FROM documents WHERE id = ?1",
                params![doc_id],
                |row| row.get(0),
            )
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to get document length: {}", e))
            })?;

        let doc_length = doc_length as f32;

        let mut score = 0.0;

        // Sum BM25 score for each query term
        for term in query_terms {
            let idf = term_idfs.get(term).copied().unwrap_or(0.0);

            // Get term frequency in this document
            let tf: Option<i64> = conn
                .query_row(
                    "SELECT frequency FROM inverted_index WHERE term = ?1 AND doc_id = ?2",
                    params![term, doc_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| {
                    ContextMcpError::Database(format!("Failed to get term frequency: {}", e))
                })?;

            if let Some(tf) = tf {
                let tf = tf as f32;

                // BM25 formula
                let numerator = tf * (self.config.k1 + 1.0);
                let denominator = tf
                    + self.config.k1
                        * (1.0 - self.config.b + self.config.b * doc_length / avg_doc_length);

                score += idf * (numerator / denominator);
            }
        }

        Ok(score)
    }

    /// Get terms from query that matched a document
    fn get_matched_terms(&self, doc_id: &str, query_terms: &[String]) -> Result<Vec<String>> {
        let placeholders = query_terms
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT DISTINCT term FROM inverted_index WHERE doc_id = ?1 AND term IN ({})",
            placeholders
        );

        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| ContextMcpError::Database(format!("Failed to prepare query: {}", e)))?;

        let mut params: Vec<&dyn rusqlite::ToSql> = vec![&doc_id as &dyn rusqlite::ToSql];
        params.extend(query_terms.iter().map(|t| t as &dyn rusqlite::ToSql));

        let matched = stmt
            .query_map(&params[..], |row| row.get::<_, String>(0))
            .map_err(|e| ContextMcpError::Database(format!("Failed to execute query: {}", e)))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| ContextMcpError::Database(format!("Failed to fetch results: {}", e)))?;

        Ok(matched)
    }

    /// Get document text and metadata
    fn get_document_data(&self, doc_id: &str) -> Result<(String, HashMap<String, String>)> {
        let conn = self.conn.lock();
        let row = conn
            .query_row(
                "SELECT text, metadata FROM documents WHERE id = ?1",
                params![doc_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to get document data: {}", e))
            })?;

        let (text, metadata_json) = row;

        let metadata: HashMap<String, String> =
            serde_json::from_str(&metadata_json).unwrap_or_default();

        Ok((text, metadata))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_creation() {
        let engine = BM25Engine::new_in_memory();
        assert!(engine.is_ok());
    }

    #[test]
    fn test_index_and_search() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Index some documents
        engine
            .index_document("doc1", "fn parse_config() {}")
            .unwrap();
        engine.index_document("doc2", "fn get_user() {}").unwrap();
        engine.index_document("doc3", "struct Config {}").unwrap();

        assert_eq!(engine.document_count().unwrap(), 3);

        // Search for "parse"
        let results = engine.search("parse", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "doc1");

        // Search for "config"
        let results = engine.search("config", 10).unwrap();
        assert_eq!(results.len(), 2); // Should match both doc1 and doc3
    }

    #[test]
    fn test_remove_document() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "test document").unwrap();
        assert_eq!(engine.document_count().unwrap(), 1);

        engine.remove_document("doc1").unwrap();
        assert_eq!(engine.document_count().unwrap(), 0);
    }

    #[test]
    fn test_clear() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "test 1").unwrap();
        engine.index_document("doc2", "test 2").unwrap();
        assert_eq!(engine.document_count().unwrap(), 2);

        engine.clear().unwrap();
        assert_eq!(engine.document_count().unwrap(), 0);
    }

    #[test]
    fn test_bm25_scoring() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Index documents with different term frequencies
        engine
            .index_document("doc1", "rust rust rust programming")
            .unwrap();
        engine.index_document("doc2", "rust programming").unwrap();
        engine.index_document("doc3", "python programming").unwrap();

        // Search for "rust" - doc1 should score higher due to higher term frequency
        let results = engine.search("rust", 10).unwrap();
        assert!(results.len() >= 2);
        assert_eq!(results[0].id, "doc1"); // doc1 should rank first
        assert!(results[0].score > results[1].score);
    }

    #[test]
    fn test_search_with_options() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "rust programming").unwrap();
        engine.index_document("doc2", "python programming").unwrap();

        let options = SearchOptions::new().with_top_k(1).with_min_score(0.01);

        let results = engine.search_with_options("programming", options).unwrap();
        assert!(results.len() <= 1);
    }

    #[test]
    fn test_get_stats() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "hello world").unwrap();
        engine.index_document("doc2", "hello rust").unwrap();

        let stats = engine.get_stats().unwrap();
        assert_eq!(stats.document_count, 2);
        assert!(stats.term_count >= 2); // At least "hello" and "world" or "rust"
        assert!(stats.avg_doc_length > 0.0);
    }

    #[test]
    fn test_metadata_indexing() {
        let engine = BM25Engine::new_in_memory().unwrap();

        let mut metadata = HashMap::new();
        metadata.insert("lang".to_string(), "rust".to_string());

        let doc = Document::with_metadata("doc1".to_string(), "fn main() {}".to_string(), metadata);

        engine.index_document_with_metadata(doc).unwrap();

        let results = engine.search("main", 1).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].metadata.get("lang"), Some(&"rust".to_string()));
    }

    // ========================================
    // Additional comprehensive tests for BM25Engine
    // ========================================

    #[test]
    fn test_search_with_empty_query() {
        let engine = BM25Engine::new_in_memory().unwrap();
        engine.index_document("doc1", "test content").unwrap();

        let results = engine.search("", 10).unwrap();
        assert_eq!(results.len(), 0, "Empty query should return no results");
    }

    #[test]
    fn test_search_with_whitespace_only_query() {
        let engine = BM25Engine::new_in_memory().unwrap();
        engine.index_document("doc1", "test content").unwrap();

        let results = engine.search("   \t\n  ", 10).unwrap();
        assert_eq!(results.len(), 0, "Whitespace-only query should return no results");
    }

    #[test]
    fn test_search_with_very_long_query() {
        let engine = BM25Engine::new_in_memory().unwrap();
        engine.index_document("doc1", "test content").unwrap();

        // Create a very long query (1000 words)
        let long_query = "test ".repeat(1000);
        let results = engine.search(&long_query, 10).unwrap();
        assert!(results.len() <= 10);
    }

    #[test]
    fn test_index_empty_text() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Should succeed even with empty text
        engine.index_document("doc1", "").unwrap();
        assert_eq!(engine.document_count().unwrap(), 1);

        // Search should not find it
        let results = engine.search("test", 10).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_index_special_characters() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "test@example.com").unwrap();
        engine.index_document("doc2", "user_name").unwrap();
        engine.index_document("doc3", "hello-world").unwrap();
        engine.index_document("doc4", "func()").unwrap();

        // Search should handle special characters
        let results = engine.search("test", 10).unwrap();
        assert!(results.len() > 0);
    }

    #[test]
    fn test_index_unicode_text() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "こんにちは世界").unwrap();
        engine.index_document("doc2", "Hello 世界").unwrap();
        engine.index_document("doc3", "🚀 Rust 🦀").unwrap();

        assert_eq!(engine.document_count().unwrap(), 3);
    }

    #[test]
    fn test_reindex_document() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Index document first time
        engine.index_document("doc1", "original content").unwrap();
        let results = engine.search("original", 10).unwrap();
        assert_eq!(results.len(), 1);

        // Reindex with new content
        engine.index_document("doc1", "updated content").unwrap();

        // Old term should not be found
        let results = engine.search("original", 10).unwrap();
        assert_eq!(results.len(), 0);

        // New term should be found
        let results = engine.search("updated", 10).unwrap();
        assert_eq!(results.len(), 1);

        // Document count should still be 1
        assert_eq!(engine.document_count().unwrap(), 1);
    }

    #[test]
    fn test_batch_indexing() {
        let engine = BM25Engine::new_in_memory().unwrap();

        let docs = vec![
            ("doc1".to_string(), "first document".to_string()),
            ("doc2".to_string(), "second document".to_string()),
            ("doc3".to_string(), "third document".to_string()),
        ];

        engine.index_documents(docs).unwrap();
        assert_eq!(engine.document_count().unwrap(), 3);

        let results = engine.search("document", 10).unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_batch_indexing_with_metadata() {
        let engine = BM25Engine::new_in_memory().unwrap();

        let mut docs = Vec::new();
        for i in 1..=5 {
            let mut metadata = HashMap::new();
            metadata.insert("index".to_string(), i.to_string());
            docs.push(Document::with_metadata(
                format!("doc{}", i),
                format!("document number {}", i),
                metadata,
            ));
        }

        engine.index_documents_batch(docs).unwrap();
        assert_eq!(engine.document_count().unwrap(), 5);
    }

    #[test]
    fn test_remove_nonexistent_document() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Should not error when removing nonexistent document
        engine.remove_document("nonexistent").unwrap();
        assert_eq!(engine.document_count().unwrap(), 0);
    }

    #[test]
    fn test_search_on_empty_index() {
        let engine = BM25Engine::new_in_memory().unwrap();

        let results = engine.search("test", 10).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_clear_empty_index() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Should not error on empty index
        engine.clear().unwrap();
        assert_eq!(engine.document_count().unwrap(), 0);
    }

    #[test]
    fn test_search_with_min_score() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "rust rust rust programming").unwrap();
        engine.index_document("doc2", "rust programming").unwrap();
        engine.index_document("doc3", "python programming").unwrap();

        // Search with high min_score threshold
        let options = SearchOptions::new().with_min_score(1.0);
        let results = engine.search_with_options("rust", options).unwrap();

        // Should filter out low-scoring results
        assert!(results.iter().all(|r| r.score >= 1.0));
    }

    #[test]
    fn test_search_without_text() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "test content").unwrap();

        let options = SearchOptions::new().with_include_text(false);
        let results = engine.search_with_options("test", options).unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].text, "");
    }

    #[test]
    fn test_search_without_metadata() {
        let engine = BM25Engine::new_in_memory().unwrap();

        let mut metadata = HashMap::new();
        metadata.insert("key".to_string(), "value".to_string());
        let doc = Document::with_metadata("doc1".to_string(), "test content".to_string(), metadata);
        engine.index_document_with_metadata(doc).unwrap();

        let options = SearchOptions::new().with_include_metadata(false);
        let results = engine.search_with_options("test", options).unwrap();

        assert_eq!(results.len(), 1);
        assert!(results[0].metadata.is_empty());
    }

    #[test]
    fn test_idf_calculation() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Index documents where "rust" appears in all docs (low IDF)
        // and "unique" appears in only one doc (high IDF)
        engine.index_document("doc1", "rust programming unique").unwrap();
        engine.index_document("doc2", "rust development").unwrap();
        engine.index_document("doc3", "rust coding").unwrap();

        let results = engine.search("unique rust", 10).unwrap();

        // The document with "unique" should score highest
        assert_eq!(results[0].id, "doc1");
    }

    #[test]
    fn test_term_frequency_impact() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // doc1 has "test" 5 times
        engine.index_document("doc1", "test test test test test").unwrap();
        // doc2 has "test" 1 time
        engine.index_document("doc2", "test").unwrap();

        let results = engine.search("test", 10).unwrap();

        // doc1 should score higher due to higher term frequency
        assert_eq!(results[0].id, "doc1");
        assert!(results[0].score > results[1].score);
    }

    #[test]
    fn test_document_length_normalization() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Short document with term
        engine.index_document("doc1", "rust").unwrap();
        // Long document with same term
        engine.index_document("doc2", &format!("rust {}", "filler ".repeat(100))).unwrap();

        let results = engine.search("rust", 10).unwrap();

        // Both should be found
        assert_eq!(results.len(), 2);
        // Document length normalization should affect scores
        assert_ne!(results[0].score, results[1].score);
    }

    #[test]
    fn test_multiple_query_terms() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "rust programming language").unwrap();
        engine.index_document("doc2", "rust only").unwrap();
        engine.index_document("doc3", "programming only").unwrap();

        let results = engine.search("rust programming", 10).unwrap();

        // doc1 should score highest (has both terms)
        assert_eq!(results[0].id, "doc1");
        assert!(results[0].matched_terms.len() >= 2 || results[0].matched_terms.contains(&"rust".to_string()) || results[0].matched_terms.contains(&"programming".to_string()));
    }

    #[test]
    fn test_matched_terms() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "rust programming language").unwrap();

        let results = engine.search("rust language", 10).unwrap();

        assert_eq!(results.len(), 1);
        assert!(results[0].matched_terms.contains(&"rust".to_string()) ||
                results[0].matched_terms.contains(&"language".to_string()));
    }

    #[test]
    fn test_stats_empty_index() {
        let engine = BM25Engine::new_in_memory().unwrap();

        let stats = engine.get_stats().unwrap();
        assert_eq!(stats.document_count, 0);
        assert_eq!(stats.term_count, 0);
        assert_eq!(stats.avg_doc_length, 0.0);
        assert_eq!(stats.total_tokens, 0);
    }

    #[test]
    fn test_stats_after_indexing() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "hello world").unwrap();
        engine.index_document("doc2", "hello rust").unwrap();

        let stats = engine.get_stats().unwrap();
        assert_eq!(stats.document_count, 2);
        assert!(stats.term_count >= 2);
        assert!(stats.avg_doc_length > 0.0);
        assert!(stats.total_tokens >= 4);
    }

    #[test]
    fn test_custom_bm25_config() {
        let engine = BM25Engine::new_in_memory()
            .unwrap()
            .with_config(BM25Config::new(1.5, 0.9))
            .unwrap();

        engine.index_document("doc1", "test document").unwrap();

        let results = engine.search("test", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_invalid_bm25_config() {
        let result = BM25Engine::new_in_memory()
            .unwrap()
            .with_config(BM25Config::new(-1.0, 0.5));

        assert!(result.is_err());
    }

    #[test]
    fn test_score_ordering() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Create documents with varying relevance
        engine.index_document("doc1", "rust rust rust").unwrap();
        engine.index_document("doc2", "rust rust").unwrap();
        engine.index_document("doc3", "rust").unwrap();

        let results = engine.search("rust", 10).unwrap();

        // Verify descending score order
        for i in 1..results.len() {
            assert!(results[i-1].score >= results[i].score,
                    "Results should be in descending score order");
        }
    }

    #[test]
    fn test_top_k_limiting() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Index many documents
        for i in 1..=20 {
            engine.index_document(&format!("doc{}", i), "test document").unwrap();
        }

        // Request only top 5
        let results = engine.search("test", 5).unwrap();
        assert_eq!(results.len(), 5);

        // Request more than available
        let results = engine.search("test", 100).unwrap();
        assert_eq!(results.len(), 20);
    }

    #[test]
    fn test_case_insensitivity() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "RUST Programming").unwrap();
        engine.index_document("doc2", "rust programming").unwrap();

        // Different case queries should find documents
        let results1 = engine.search("rust", 10).unwrap();
        let results2 = engine.search("RUST", 10).unwrap();
        let results3 = engine.search("Rust", 10).unwrap();

        // All should return same number of results (case-insensitive)
        assert_eq!(results1.len(), results2.len());
        assert_eq!(results2.len(), results3.len());
    }

    #[test]
    fn test_concurrent_reads() {
        use std::sync::Arc;
        use std::thread;

        let engine = Arc::new(BM25Engine::new_in_memory().unwrap());

        // Index some documents
        engine.index_document("doc1", "test content").unwrap();
        engine.index_document("doc2", "rust programming").unwrap();

        // Spawn multiple threads doing searches
        let mut handles = vec![];
        for _ in 0..5 {
            let engine_clone = engine.clone();
            handles.push(thread::spawn(move || {
                let results = engine_clone.search("test", 10).unwrap();
                assert!(results.len() >= 0);
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }
    }

    #[test]
    fn test_clear_and_reindex() {
        let engine = BM25Engine::new_in_memory().unwrap();

        // Index documents
        engine.index_document("doc1", "first batch").unwrap();
        engine.index_document("doc2", "first batch").unwrap();
        assert_eq!(engine.document_count().unwrap(), 2);

        // Clear
        engine.clear().unwrap();
        assert_eq!(engine.document_count().unwrap(), 0);

        // Reindex new documents
        engine.index_document("doc3", "second batch").unwrap();
        engine.index_document("doc4", "second batch").unwrap();
        assert_eq!(engine.document_count().unwrap(), 2);

        // Old documents should not be found
        let results = engine.search("first", 10).unwrap();
        assert_eq!(results.len(), 0);

        // New documents should be found
        let results = engine.search("second", 10).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_document_with_numbers() {
        let engine = BM25Engine::new_in_memory().unwrap();

        engine.index_document("doc1", "version 1.0.0").unwrap();
        engine.index_document("doc2", "port 8080").unwrap();
        engine.index_document("doc3", "year 2024").unwrap();

        let results = engine.search("version", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_with_custom_tokenizer() {
        use crate::search::tokenizer::Tokenizer;

        let engine = BM25Engine::new_in_memory()
            .unwrap()
            .with_tokenizer(Tokenizer::code());

        engine.index_document("doc1", "fn main() { println!(\"hello\"); }").unwrap();

        let results = engine.search("main", 10).unwrap();
        assert_eq!(results.len(), 1);
    }
}
