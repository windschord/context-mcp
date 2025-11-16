/// Full-text search module using BM25 algorithm
///
/// This module provides a BM25-based search engine for keyword-based code search.
/// It features:
/// - SQLite-backed inverted index for persistence
/// - Code-aware tokenization (camelCase, snake_case splitting)
/// - Configurable BM25 parameters
/// - Batch indexing support
/// - Metadata support for documents
///
/// # Example
/// ```no_run
/// use context_mcp::search::{BM25Engine, Tokenizer};
/// use std::path::Path;
///
/// # fn main() -> context_mcp::Result<()> {
/// // Create a new BM25 engine
/// let mut engine = BM25Engine::new(Path::new("index.db"))?;
///
/// // Index some documents
/// engine.index_document("file1.rs", "pub fn parse_config() {}")?;
/// engine.index_document("file2.rs", "struct Config { /* fields */ }")?;
///
/// // Search
/// let results = engine.search("parse config", 10)?;
/// for result in results {
///     println!("{}: {:.4}", result.id, result.score);
/// }
/// # Ok(())
/// # }
/// ```

pub mod bm25_engine;
pub mod hybrid_engine;
pub mod tokenizer;
pub mod types;

pub use bm25_engine::BM25Engine;
pub use hybrid_engine::{HybridSearchEngine, normalize_min_max, normalize_scores, normalize_z_score};
pub use tokenizer::Tokenizer;
pub use types::{
    BM25Config, BM25Result, Document, HybridConfig, HybridResult, IndexStats,
    NormalizationType, SearchOptions,
};
