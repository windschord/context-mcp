/// Type definitions for BM25 full-text search engine and hybrid search
///
/// This module defines the core types used in the BM25 search implementation,
/// including configuration, document representation, and search results.
/// It also includes types for hybrid search that combines BM25 with vector search.

use crate::storage::types::VectorRecord;
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

/// Normalization method for combining BM25 and vector scores
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum NormalizationType {
    /// Min-max normalization to [0, 1]
    MinMax,
    /// Z-score normalization (standardization)
    ZScore,
    /// No normalization (use raw scores)
    None,
}

impl Default for NormalizationType {
    fn default() -> Self {
        Self::MinMax
    }
}

/// Configuration for hybrid search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridConfig {
    /// Weight for BM25 score (default: 0.3), vector score gets (1 - alpha)
    /// - alpha = 0.0: pure vector search
    /// - alpha = 0.5: equal weight
    /// - alpha = 1.0: pure BM25 search
    pub alpha: f32,

    /// Number of final results to return
    pub top_k: usize,

    /// Number of BM25 results to fetch (default: top_k * 3)
    /// Fetching more candidates improves recall
    pub bm25_top_k: usize,

    /// Number of vector results to fetch (default: top_k * 3)
    /// Fetching more candidates improves recall
    pub vector_top_k: usize,

    /// Score normalization method
    pub normalization: NormalizationType,
}

impl Default for HybridConfig {
    fn default() -> Self {
        Self {
            alpha: 0.3,
            top_k: 10,
            bm25_top_k: 30,
            vector_top_k: 30,
            normalization: NormalizationType::MinMax,
        }
    }
}

impl HybridConfig {
    /// Create a new hybrid configuration
    pub fn new(alpha: f32, top_k: usize) -> Self {
        Self {
            alpha,
            top_k,
            bm25_top_k: top_k * 3,
            vector_top_k: top_k * 3,
            normalization: NormalizationType::MinMax,
        }
    }

    /// Set alpha (BM25 weight)
    pub fn with_alpha(mut self, alpha: f32) -> Self {
        self.alpha = alpha;
        self
    }

    /// Set top_k
    pub fn with_top_k(mut self, top_k: usize) -> Self {
        self.top_k = top_k;
        self
    }

    /// Set BM25 top_k
    pub fn with_bm25_top_k(mut self, bm25_top_k: usize) -> Self {
        self.bm25_top_k = bm25_top_k;
        self
    }

    /// Set vector top_k
    pub fn with_vector_top_k(mut self, vector_top_k: usize) -> Self {
        self.vector_top_k = vector_top_k;
        self
    }

    /// Set normalization method
    pub fn with_normalization(mut self, normalization: NormalizationType) -> Self {
        self.normalization = normalization;
        self
    }

    /// Validate configuration
    pub fn validate(&self) -> Result<(), String> {
        if self.alpha < 0.0 || self.alpha > 1.0 {
            return Err(format!("alpha must be between 0.0 and 1.0, got {}", self.alpha));
        }
        if self.top_k == 0 {
            return Err("top_k must be greater than 0".to_string());
        }
        if self.bm25_top_k == 0 {
            return Err("bm25_top_k must be greater than 0".to_string());
        }
        if self.vector_top_k == 0 {
            return Err("vector_top_k must be greater than 0".to_string());
        }
        Ok(())
    }
}

/// Hybrid search result combining BM25 and vector search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridResult {
    /// Document/record ID
    pub id: String,

    /// Combined hybrid score (higher is better)
    pub score: f32,

    /// BM25 component score (if document was found by BM25)
    pub bm25_score: Option<f32>,

    /// Vector component score (if document was found by vector search)
    pub vector_score: Option<f32>,

    /// Full vector record data
    pub record: VectorRecord,

    /// Terms matched by BM25 search
    pub matched_terms: Vec<String>,
}

impl HybridResult {
    /// Create a new hybrid result
    pub fn new(
        id: String,
        score: f32,
        bm25_score: Option<f32>,
        vector_score: Option<f32>,
        record: VectorRecord,
        matched_terms: Vec<String>,
    ) -> Self {
        Self {
            id,
            score,
            bm25_score,
            vector_score,
            record,
            matched_terms,
        }
    }

    /// Check if this result came from BM25 search
    pub fn has_bm25(&self) -> bool {
        self.bm25_score.is_some()
    }

    /// Check if this result came from vector search
    pub fn has_vector(&self) -> bool {
        self.vector_score.is_some()
    }

    /// Check if this result came from both sources
    pub fn is_hybrid(&self) -> bool {
        self.has_bm25() && self.has_vector()
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

    #[test]
    fn test_hybrid_config_default() {
        let config = HybridConfig::default();
        assert_eq!(config.alpha, 0.3);
        assert_eq!(config.top_k, 10);
        assert_eq!(config.bm25_top_k, 30);
        assert_eq!(config.vector_top_k, 30);
        assert_eq!(config.normalization, NormalizationType::MinMax);
    }

    #[test]
    fn test_hybrid_config_validation() {
        let valid = HybridConfig::new(0.5, 20);
        assert!(valid.validate().is_ok());

        let invalid_alpha_low = HybridConfig::new(-0.1, 10);
        assert!(invalid_alpha_low.validate().is_err());

        let invalid_alpha_high = HybridConfig::new(1.5, 10);
        assert!(invalid_alpha_high.validate().is_err());

        let invalid_top_k = HybridConfig::new(0.5, 0);
        assert!(invalid_top_k.validate().is_err());
    }

    #[test]
    fn test_hybrid_config_builder() {
        let config = HybridConfig::new(0.4, 20)
            .with_bm25_top_k(100)
            .with_vector_top_k(80)
            .with_normalization(NormalizationType::ZScore);

        assert_eq!(config.alpha, 0.4);
        assert_eq!(config.top_k, 20);
        assert_eq!(config.bm25_top_k, 100);
        assert_eq!(config.vector_top_k, 80);
        assert_eq!(config.normalization, NormalizationType::ZScore);
    }

    #[test]
    fn test_normalization_type() {
        assert_eq!(NormalizationType::default(), NormalizationType::MinMax);
    }
}
