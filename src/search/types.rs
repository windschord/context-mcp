/// Type definitions for BM25 full-text search engine
///
/// This module defines the core types used in the BM25 search implementation,
/// including configuration, document representation, and search results.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Document to be indexed by the BM25 engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// Unique document identifier
    pub id: String,

    /// Full text content of the document
    pub text: String,

    /// Optional metadata associated with the document
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

impl Document {
    /// Create a new document with the given ID and text
    pub fn new(id: String, text: String) -> Self {
        Self {
            id,
            text,
            metadata: HashMap::new(),
        }
    }

    /// Create a new document with metadata
    pub fn with_metadata(id: String, text: String, metadata: HashMap<String, String>) -> Self {
        Self {
            id,
            text,
            metadata,
        }
    }

    /// Add or update a metadata field
    pub fn add_metadata(&mut self, key: String, value: String) -> &mut Self {
        self.metadata.insert(key, value);
        self
    }
}

/// BM25 search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BM25Result {
    /// Document ID
    pub id: String,

    /// BM25 score (higher is better)
    pub score: f32,

    /// Terms from the query that matched this document
    pub matched_terms: Vec<String>,

    /// Document text (for snippet extraction)
    pub text: String,

    /// Document metadata
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

impl BM25Result {
    /// Create a new BM25 result
    pub fn new(id: String, score: f32, matched_terms: Vec<String>, text: String) -> Self {
        Self {
            id,
            score,
            matched_terms,
            text,
            metadata: HashMap::new(),
        }
    }

    /// Create a new BM25 result with metadata
    pub fn with_metadata(
        id: String,
        score: f32,
        matched_terms: Vec<String>,
        text: String,
        metadata: HashMap<String, String>,
    ) -> Self {
        Self {
            id,
            score,
            matched_terms,
            text,
            metadata,
        }
    }
}

/// Configuration for BM25 algorithm parameters
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BM25Config {
    /// Term frequency saturation parameter (default: 1.2)
    /// Higher values give more weight to term frequency
    pub k1: f32,

    /// Length normalization parameter (default: 0.75)
    /// Controls how much document length affects scoring (0.0 = no effect, 1.0 = full effect)
    pub b: f32,
}

impl Default for BM25Config {
    fn default() -> Self {
        Self {
            k1: 1.2,
            b: 0.75,
        }
    }
}

impl BM25Config {
    /// Create a new BM25 configuration with custom parameters
    pub fn new(k1: f32, b: f32) -> Self {
        Self { k1, b }
    }

    /// Validate configuration parameters
    pub fn validate(&self) -> Result<(), String> {
        if self.k1 < 0.0 {
            return Err(format!("k1 must be non-negative, got {}", self.k1));
        }
        if self.b < 0.0 || self.b > 1.0 {
            return Err(format!("b must be between 0.0 and 1.0, got {}", self.b));
        }
        Ok(())
    }
}

/// Statistics about a term in the corpus
#[derive(Debug, Clone)]
pub(crate) struct TermStats {
    /// Document frequency: number of documents containing this term
    pub doc_freq: usize,

    /// Inverse document frequency (IDF) score
    pub idf: f32,
}

/// Document statistics
#[derive(Debug, Clone)]
pub(crate) struct DocStats {
    /// Document length (number of terms)
    pub length: usize,

    /// Term frequencies within this document
    pub term_freqs: HashMap<String, usize>,
}

/// Search options for BM25 queries
#[derive(Debug, Clone)]
pub struct SearchOptions {
    /// Maximum number of results to return
    pub top_k: usize,

    /// Minimum score threshold (results below this score are filtered out)
    pub min_score: Option<f32>,

    /// Whether to include document text in results (default: true)
    pub include_text: bool,

    /// Whether to include metadata in results (default: true)
    pub include_metadata: bool,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            top_k: 10,
            min_score: None,
            include_text: true,
            include_metadata: true,
        }
    }
}

impl SearchOptions {
    /// Create new search options with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the maximum number of results
    pub fn with_top_k(mut self, top_k: usize) -> Self {
        self.top_k = top_k;
        self
    }

    /// Set the minimum score threshold
    pub fn with_min_score(mut self, min_score: f32) -> Self {
        self.min_score = Some(min_score);
        self
    }

    /// Set whether to include document text in results
    pub fn with_include_text(mut self, include_text: bool) -> Self {
        self.include_text = include_text;
        self
    }

    /// Set whether to include metadata in results
    pub fn with_include_metadata(mut self, include_metadata: bool) -> Self {
        self.include_metadata = include_metadata;
        self
    }
}

/// Index statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStats {
    /// Total number of documents in the index
    pub document_count: usize,

    /// Total number of unique terms in the index
    pub term_count: usize,

    /// Average document length
    pub avg_doc_length: f32,

    /// Total number of tokens across all documents
    pub total_tokens: usize,
}

impl IndexStats {
    /// Create new index statistics
    pub fn new(
        document_count: usize,
        term_count: usize,
        avg_doc_length: f32,
        total_tokens: usize,
    ) -> Self {
        Self {
            document_count,
            term_count,
            avg_doc_length,
            total_tokens,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_creation() {
        let doc = Document::new("doc1".to_string(), "Hello world".to_string());
        assert_eq!(doc.id, "doc1");
        assert_eq!(doc.text, "Hello world");
        assert!(doc.metadata.is_empty());
    }

    #[test]
    fn test_document_with_metadata() {
        let mut metadata = HashMap::new();
        metadata.insert("lang".to_string(), "rust".to_string());

        let doc = Document::with_metadata(
            "doc1".to_string(),
            "fn main() {}".to_string(),
            metadata,
        );

        assert_eq!(doc.metadata.get("lang"), Some(&"rust".to_string()));
    }

    #[test]
    fn test_bm25_config_default() {
        let config = BM25Config::default();
        assert_eq!(config.k1, 1.2);
        assert_eq!(config.b, 0.75);
    }

    #[test]
    fn test_bm25_config_validation() {
        let valid_config = BM25Config::new(1.5, 0.8);
        assert!(valid_config.validate().is_ok());

        let invalid_k1 = BM25Config::new(-1.0, 0.5);
        assert!(invalid_k1.validate().is_err());

        let invalid_b_low = BM25Config::new(1.0, -0.1);
        assert!(invalid_b_low.validate().is_err());

        let invalid_b_high = BM25Config::new(1.0, 1.5);
        assert!(invalid_b_high.validate().is_err());
    }

    #[test]
    fn test_search_options_builder() {
        let options = SearchOptions::new()
            .with_top_k(20)
            .with_min_score(0.5)
            .with_include_text(false);

        assert_eq!(options.top_k, 20);
        assert_eq!(options.min_score, Some(0.5));
        assert!(!options.include_text);
        assert!(options.include_metadata);
    }
}
