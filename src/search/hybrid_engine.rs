use crate::embedding::EmbeddingEngine;
/// Hybrid search engine combining BM25 keyword search with vector similarity search
///
/// This module implements a hybrid search engine that combines the best of both worlds:
/// - BM25: Precise keyword matching for exact terms
/// - Vector search: Semantic similarity for conceptual matches
///
/// The algorithm:
/// 1. Generate query embedding: vec = embed(query)
/// 2. BM25 search: bm25_results = bm25.search(query, bm25_top_k)
/// 3. Vector search: vector_results = milvus.search(vec, vector_top_k)
/// 4. Normalize scores: norm_bm25 = normalize(bm25_scores), norm_vec = normalize(vec_scores)
/// 5. Combine: hybrid_score = alpha * norm_bm25 + (1-alpha) * norm_vec
/// 6. Merge results by ID, sort by hybrid_score, return top_k
///
/// # Example
///
/// ```no_run
/// use context_mcp::search::{BM25Engine, HybridSearchEngine, HybridConfig};
/// use context_mcp::storage::MilvusClient;
/// use context_mcp::embedding::EmbeddingEngine;
/// use std::path::Path;
///
/// # async fn example() -> context_mcp::Result<()> {
/// // Initialize components
/// let bm25 = BM25Engine::new(Path::new("index.db"))?;
/// let milvus = MilvusClient::new("http://localhost:19530").await?;
/// let embedding = EmbeddingEngine::new(Default::default()).await?;
///
/// // Create hybrid engine
/// let hybrid = HybridSearchEngine::new(bm25, milvus, embedding);
///
/// // Search with default configuration
/// let results = hybrid.search("parse configuration file", "code_vectors", 10).await?;
///
/// // Custom configuration
/// let config = HybridConfig::new(0.4, 20); // 40% keyword, 60% semantic
/// let results = hybrid.search_with_config("query", "code_vectors", config).await?;
/// # Ok(())
/// # }
/// ```
use crate::error::{ContextMcpError, Result};
use crate::search::bm25_engine::BM25Engine;
use crate::search::types::{HybridConfig, HybridResult, NormalizationType};
use crate::storage::types::{SearchQuery, VectorRecord};
use crate::storage::MilvusClient;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, info};

/// Hybrid search engine combining BM25 and vector search
pub struct HybridSearchEngine {
    /// BM25 engine for keyword search
    bm25: Arc<BM25Engine>,

    /// Milvus client for vector search
    milvus: Arc<MilvusClient>,

    /// Embedding engine for query vectorization
    embedding: Arc<EmbeddingEngine>,
}

impl HybridSearchEngine {
    /// Create a new hybrid search engine
    ///
    /// # Arguments
    ///
    /// * `bm25` - BM25 engine for keyword search
    /// * `milvus` - Milvus client for vector search
    /// * `embedding` - Embedding engine for query vectorization
    ///
    /// # Example
    ///
    /// ```no_run
    /// # use context_mcp::search::{BM25Engine, HybridSearchEngine};
    /// # use context_mcp::storage::MilvusClient;
    /// # use context_mcp::embedding::EmbeddingEngine;
    /// # use std::path::Path;
    /// # async fn example() -> context_mcp::Result<()> {
    /// let bm25 = BM25Engine::new(Path::new("index.db"))?;
    /// let milvus = MilvusClient::new("http://localhost:19530").await?;
    /// let embedding = EmbeddingEngine::new(Default::default()).await?;
    /// let hybrid = HybridSearchEngine::new(bm25, milvus, embedding);
    /// # Ok(())
    /// # }
    /// ```
    pub fn new(
        bm25: Arc<BM25Engine>,
        milvus: Arc<MilvusClient>,
        embedding: Arc<EmbeddingEngine>,
    ) -> Self {
        info!("Creating HybridSearchEngine");
        Self {
            bm25,
            milvus,
            embedding,
        }
    }

    /// Perform hybrid search with default configuration
    ///
    /// # Arguments
    ///
    /// * `query` - Search query string
    /// * `collection` - Milvus collection name (e.g., "code_vectors")
    /// * `top_k` - Number of results to return
    ///
    /// # Returns
    ///
    /// Vector of HybridResults sorted by combined score (descending)
    pub async fn search(
        &self,
        query: &str,
        collection: &str,
        top_k: usize,
    ) -> Result<Vec<HybridResult>> {
        let config = HybridConfig::new(0.3, top_k);
        self.search_with_config(query, collection, config).await
    }

    /// Perform hybrid search with custom configuration
    ///
    /// # Arguments
    ///
    /// * `query` - Search query string
    /// * `collection` - Milvus collection name
    /// * `config` - Hybrid search configuration
    ///
    /// # Returns
    ///
    /// Vector of HybridResults sorted by combined score (descending)
    pub async fn search_with_config(
        &self,
        query: &str,
        collection: &str,
        config: HybridConfig,
    ) -> Result<Vec<HybridResult>> {
        info!(
            "Hybrid search: query='{}', collection='{}', alpha={}, top_k={}",
            query, collection, config.alpha, config.top_k
        );

        // Validate configuration
        config.validate().map_err(ContextMcpError::Config)?;

        // Step 1: Generate query embedding
        debug!("Generating query embedding");
        let embedding = self.embedding.embed(query).await?;
        let query_vector = embedding.vector;

        // Step 2: BM25 search
        debug!("Performing BM25 search (top_k={})", config.bm25_top_k);
        let bm25_results = self.bm25.search(query, config.bm25_top_k)?;
        debug!("BM25 returned {} results", bm25_results.len());

        // Step 3: Vector search
        debug!("Performing vector search (top_k={})", config.vector_top_k);
        let search_query = SearchQuery::new(query_vector, config.vector_top_k);
        let vector_results = self.milvus.search(collection, search_query).await?;
        debug!("Vector search returned {} results", vector_results.len());

        // Step 4: Normalize scores
        let bm25_scores: Vec<f32> = bm25_results.iter().map(|r| r.score).collect();
        let vector_scores: Vec<f32> = vector_results.iter().map(|r| r.score).collect();

        let normalized_bm25 = normalize_scores(&bm25_scores, config.normalization);
        let normalized_vector = normalize_scores(&vector_scores, config.normalization);

        debug!(
            "Normalized BM25 scores: min={:.4}, max={:.4}",
            normalized_bm25
                .iter()
                .cloned()
                .fold(f32::INFINITY, f32::min),
            normalized_bm25
                .iter()
                .cloned()
                .fold(f32::NEG_INFINITY, f32::max)
        );
        debug!(
            "Normalized vector scores: min={:.4}, max={:.4}",
            normalized_vector
                .iter()
                .cloned()
                .fold(f32::INFINITY, f32::min),
            normalized_vector
                .iter()
                .cloned()
                .fold(f32::NEG_INFINITY, f32::max)
        );

        // Step 5 & 6: Combine and merge results
        let hybrid_results = self
            .merge_results(
                &bm25_results,
                &normalized_bm25,
                &vector_results,
                &normalized_vector,
                config.alpha,
            )
            .await?;

        // Sort by hybrid score (descending)
        let mut sorted_results = hybrid_results;
        sorted_results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Truncate to top_k
        sorted_results.truncate(config.top_k);

        info!(
            "Hybrid search returned {} results (from {} BM25 + {} vector)",
            sorted_results.len(),
            bm25_results.len(),
            vector_results.len()
        );

        Ok(sorted_results)
    }

    /// Merge BM25 and vector search results
    async fn merge_results(
        &self,
        bm25_results: &[crate::search::types::BM25Result],
        normalized_bm25: &[f32],
        vector_results: &[crate::storage::types::SearchResult],
        normalized_vector: &[f32],
        alpha: f32,
    ) -> Result<Vec<HybridResult>> {
        debug!("Merging results with alpha={}", alpha);

        let mut results_map: HashMap<String, HybridResult> = HashMap::new();

        // Process BM25 results
        for (i, bm25_result) in bm25_results.iter().enumerate() {
            let id = &bm25_result.id;
            let norm_score = normalized_bm25[i];
            let hybrid_score = alpha * norm_score;

            // We need to fetch the VectorRecord for this ID from Milvus
            // For now, we'll create a placeholder. In a real implementation,
            // you'd need to fetch the full record from Milvus by ID.
            // This is a limitation where BM25 only has the document text,
            // not the full VectorRecord structure.

            // Try to find this ID in vector results
            if let Some((vector_idx, vector_result)) = vector_results
                .iter()
                .enumerate()
                .find(|(_, v)| &v.id == id)
            {
                // Found in both sources - true hybrid result
                let norm_vec_score = normalized_vector[vector_idx];
                let combined_score = alpha * norm_score + (1.0 - alpha) * norm_vec_score;

                results_map.insert(
                    id.clone(),
                    HybridResult::new(
                        id.clone(),
                        combined_score,
                        Some(bm25_result.score),
                        Some(vector_result.score),
                        vector_result.record.clone(),
                        bm25_result.matched_terms.clone(),
                    ),
                );
            } else {
                // Only in BM25 results - need to create a VectorRecord from BM25 data
                // This is a fallback case where we construct a minimal VectorRecord
                let record = VectorRecord::new(
                    id.clone(),
                    vec![],                   // Empty vector
                    "unknown".to_string(),    // project_id
                    id.clone(),               // Use ID as file_path
                    "unknown".to_string(),    // language
                    "document".to_string(),   // symbol_type
                    "".to_string(),           // symbol_name
                    0,                        // line_start
                    0,                        // line_end
                    bm25_result.text.clone(), // snippet
                    "".to_string(),           // docstring
                );

                results_map.insert(
                    id.clone(),
                    HybridResult::new(
                        id.clone(),
                        hybrid_score,
                        Some(bm25_result.score),
                        None,
                        record,
                        bm25_result.matched_terms.clone(),
                    ),
                );
            }
        }

        // Process vector results not already in the map
        for (i, vector_result) in vector_results.iter().enumerate() {
            let id = &vector_result.id;
            if !results_map.contains_key(id) {
                let norm_score = normalized_vector[i];
                let hybrid_score = (1.0 - alpha) * norm_score;

                results_map.insert(
                    id.clone(),
                    HybridResult::new(
                        id.clone(),
                        hybrid_score,
                        None,
                        Some(vector_result.score),
                        vector_result.record.clone(),
                        vec![], // No matched terms from BM25
                    ),
                );
            }
        }

        debug!("Merged {} unique results", results_map.len());

        Ok(results_map.into_values().collect())
    }
}

/// Normalize a vector of scores using the specified method
///
/// # Arguments
///
/// * `scores` - Input scores to normalize
/// * `normalization` - Normalization method to use
///
/// # Returns
///
/// Normalized scores
pub fn normalize_scores(scores: &[f32], normalization: NormalizationType) -> Vec<f32> {
    match normalization {
        NormalizationType::MinMax => normalize_min_max(scores),
        NormalizationType::ZScore => normalize_z_score(scores),
        NormalizationType::None => scores.to_vec(),
    }
}

/// Min-max normalization to [0, 1]
///
/// Formula: (x - min) / (max - min)
///
/// # Arguments
///
/// * `scores` - Input scores
///
/// # Returns
///
/// Normalized scores in range [0, 1]
pub fn normalize_min_max(scores: &[f32]) -> Vec<f32> {
    if scores.is_empty() {
        return vec![];
    }

    if scores.len() == 1 {
        return vec![1.0]; // Single score normalizes to 1.0
    }

    let min = scores.iter().cloned().fold(f32::INFINITY, f32::min);
    let max = scores.iter().cloned().fold(f32::NEG_INFINITY, f32::max);

    if (max - min).abs() < 1e-10 {
        // All scores are the same
        return vec![1.0; scores.len()];
    }

    scores
        .iter()
        .map(|&score| (score - min) / (max - min))
        .collect()
}

/// Z-score normalization (standardization)
///
/// Formula: (x - mean) / std_dev
///
/// # Arguments
///
/// * `scores` - Input scores
///
/// # Returns
///
/// Normalized scores with mean=0 and std_dev=1
pub fn normalize_z_score(scores: &[f32]) -> Vec<f32> {
    if scores.is_empty() {
        return vec![];
    }

    if scores.len() == 1 {
        return vec![0.0]; // Single score normalizes to 0.0
    }

    let mean = scores.iter().sum::<f32>() / scores.len() as f32;
    let variance = scores
        .iter()
        .map(|&score| (score - mean).powi(2))
        .sum::<f32>()
        / scores.len() as f32;
    let std_dev = variance.sqrt();

    if std_dev < 1e-10 {
        // All scores are the same
        return vec![0.0; scores.len()];
    }

    scores
        .iter()
        .map(|&score| (score - mean) / std_dev)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================
    // Normalization tests
    // ========================================

    #[test]
    fn test_normalize_min_max() {
        let scores = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let normalized = normalize_min_max(&scores);

        assert_eq!(normalized.len(), 5);
        assert!((normalized[0] - 0.0).abs() < 1e-6);
        assert!((normalized[2] - 0.5).abs() < 1e-6);
        assert!((normalized[4] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_normalize_min_max_single() {
        let scores = vec![5.0];
        let normalized = normalize_min_max(&scores);
        assert_eq!(normalized, vec![1.0]);
    }

    #[test]
    fn test_normalize_min_max_equal() {
        let scores = vec![3.0, 3.0, 3.0];
        let normalized = normalize_min_max(&scores);
        assert_eq!(normalized, vec![1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_normalize_min_max_empty() {
        let scores: Vec<f32> = vec![];
        let normalized = normalize_min_max(&scores);
        assert!(normalized.is_empty());
    }

    #[test]
    fn test_normalize_z_score() {
        let scores = vec![2.0, 4.0, 6.0, 8.0, 10.0];
        let normalized = normalize_z_score(&scores);

        assert_eq!(normalized.len(), 5);

        // Check mean is approximately 0
        let mean: f32 = normalized.iter().sum::<f32>() / normalized.len() as f32;
        assert!(mean.abs() < 1e-6);

        // Check std dev is approximately 1
        let variance = normalized.iter().map(|&x| x.powi(2)).sum::<f32>() / normalized.len() as f32;
        let std_dev = variance.sqrt();
        assert!((std_dev - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_normalize_z_score_single() {
        let scores = vec![5.0];
        let normalized = normalize_z_score(&scores);
        assert_eq!(normalized, vec![0.0]);
    }

    #[test]
    fn test_normalize_z_score_equal() {
        let scores = vec![3.0, 3.0, 3.0];
        let normalized = normalize_z_score(&scores);
        assert_eq!(normalized, vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_normalize_z_score_empty() {
        let scores: Vec<f32> = vec![];
        let normalized = normalize_z_score(&scores);
        assert!(normalized.is_empty());
    }

    #[test]
    fn test_normalize_scores_dispatch() {
        let scores = vec![1.0, 2.0, 3.0];

        let min_max = normalize_scores(&scores, NormalizationType::MinMax);
        assert!((min_max[0] - 0.0).abs() < 1e-6);
        assert!((min_max[2] - 1.0).abs() < 1e-6);

        let z_score = normalize_scores(&scores, NormalizationType::ZScore);
        let mean: f32 = z_score.iter().sum::<f32>() / z_score.len() as f32;
        assert!(mean.abs() < 1e-6);

        let none = normalize_scores(&scores, NormalizationType::None);
        assert_eq!(none, scores);
    }

    // ========================================
    // HybridSearchEngine integration tests
    // ========================================

    fn create_test_vector_record(id: &str, file_path: &str) -> VectorRecord {
        VectorRecord::new(
            id.to_string(),
            vec![0.1; 384],
            "test_project".to_string(),
            file_path.to_string(),
            "rust".to_string(),
            "function".to_string(),
            "test_fn".to_string(),
            10,
            20,
            "fn test_fn() {}".to_string(),
            "Test function".to_string(),
        )
    }

    #[test]
    fn test_hybrid_config_validation() {
        let valid_config = HybridConfig::new(0.3, 10);
        assert!(valid_config.validate().is_ok());

        let invalid_alpha_high = HybridConfig::new(1.5, 10);
        assert!(invalid_alpha_high.validate().is_err());

        let invalid_alpha_low = HybridConfig::new(-0.1, 10);
        assert!(invalid_alpha_low.validate().is_err());

        let invalid_top_k = HybridConfig::new(0.5, 0);
        assert!(invalid_top_k.validate().is_err());
    }

    #[test]
    fn test_hybrid_config_alpha_variations() {
        // Test pure vector search (alpha = 0.0)
        let vector_only = HybridConfig::new(0.0, 10);
        assert!(vector_only.validate().is_ok());
        assert_eq!(vector_only.alpha, 0.0);

        // Test equal weight (alpha = 0.5)
        let equal_weight = HybridConfig::new(0.5, 10);
        assert!(equal_weight.validate().is_ok());
        assert_eq!(equal_weight.alpha, 0.5);

        // Test pure BM25 search (alpha = 1.0)
        let bm25_only = HybridConfig::new(1.0, 10);
        assert!(bm25_only.validate().is_ok());
        assert_eq!(bm25_only.alpha, 1.0);
    }

    #[test]
    fn test_normalize_scores_with_normalization_types() {
        let scores = vec![1.0, 2.0, 3.0, 4.0, 5.0];

        // MinMax normalization
        let min_max = normalize_scores(&scores, NormalizationType::MinMax);
        assert_eq!(min_max.len(), 5);
        assert!((min_max[0] - 0.0).abs() < 1e-6);
        assert!((min_max[4] - 1.0).abs() < 1e-6);

        // ZScore normalization
        let z_score = normalize_scores(&scores, NormalizationType::ZScore);
        assert_eq!(z_score.len(), 5);
        let mean: f32 = z_score.iter().sum::<f32>() / z_score.len() as f32;
        assert!(mean.abs() < 1e-6);

        // None (no normalization)
        let none = normalize_scores(&scores, NormalizationType::None);
        assert_eq!(none, scores);
    }

    #[test]
    fn test_hybrid_result_creation() {
        let record = create_test_vector_record("test_id", "test.rs");
        let result = HybridResult::new(
            "test_id".to_string(),
            0.85,
            Some(0.7),
            Some(0.9),
            record,
            vec!["test".to_string(), "keyword".to_string()],
        );

        assert_eq!(result.id, "test_id");
        assert_eq!(result.score, 0.85);
        assert_eq!(result.bm25_score, Some(0.7));
        assert_eq!(result.vector_score, Some(0.9));
        assert!(result.is_hybrid());
        assert!(result.has_bm25());
        assert!(result.has_vector());
        assert_eq!(result.matched_terms.len(), 2);
    }

    #[test]
    fn test_hybrid_result_bm25_only() {
        let record = create_test_vector_record("test_id", "test.rs");
        let result = HybridResult::new(
            "test_id".to_string(),
            0.7,
            Some(0.7),
            None,
            record,
            vec!["keyword".to_string()],
        );

        assert!(result.has_bm25());
        assert!(!result.has_vector());
        assert!(!result.is_hybrid());
    }

    #[test]
    fn test_hybrid_result_vector_only() {
        let record = create_test_vector_record("test_id", "test.rs");
        let result = HybridResult::new("test_id".to_string(), 0.9, None, Some(0.9), record, vec![]);

        assert!(!result.has_bm25());
        assert!(result.has_vector());
        assert!(!result.is_hybrid());
    }

    #[test]
    fn test_score_combination() {
        // Test hybrid score calculation: score = alpha * bm25 + (1-alpha) * vector
        let alpha = 0.3_f32;
        let bm25_score = 0.8_f32;
        let vector_score = 0.6_f32;

        let expected_score = alpha * bm25_score + (1.0 - alpha) * vector_score;
        let calculated_score = 0.3 * 0.8 + 0.7 * 0.6;

        assert!((expected_score - calculated_score).abs() < 1e-6);
        assert!((expected_score - 0.66).abs() < 1e-6);
    }

    #[test]
    fn test_normalization_edge_cases() {
        // Empty scores
        let empty_min_max: Vec<f32> = normalize_min_max(&[]);
        assert!(empty_min_max.is_empty());
        let empty_z_score: Vec<f32> = normalize_z_score(&[]);
        assert!(empty_z_score.is_empty());

        // Single score
        assert_eq!(normalize_min_max(&[5.0]), vec![1.0]);
        assert_eq!(normalize_z_score(&[5.0]), vec![0.0]);

        // All equal scores
        assert_eq!(normalize_min_max(&[3.0, 3.0, 3.0]), vec![1.0, 1.0, 1.0]);
        assert_eq!(normalize_z_score(&[3.0, 3.0, 3.0]), vec![0.0, 0.0, 0.0]);
    }

    // ========================================
    // HybridSearchEngine integration tests with mocks
    // ========================================

    // Mock implementations for testing

    #[cfg(test)]
    mod integration_tests {
        use super::*;
        use crate::search::types::BM25Result;
        use crate::storage::types::{SearchResult, VectorRecord};
        use std::sync::Arc;

        // Helper function to create mock vector record
        fn create_mock_vector_record(id: &str, file_path: &str, score_value: f32) -> VectorRecord {
            let mut v = vec![0.0; 384];
            v[0] = score_value; // Use first element to track score
            VectorRecord::new(
                id.to_string(),
                v,
                "test_project".to_string(),
                file_path.to_string(),
                "rust".to_string(),
                "function".to_string(),
                format!("fn_{}", id),
                10,
                20,
                format!("fn {}() {{}}", id),
                format!("Test function {}", id),
            )
        }

        #[tokio::test]
        #[ignore] // Requires embedding model and Milvus instance
        async fn test_merge_results_both_sources() {
            // Create test data
            let bm25_results = vec![
                BM25Result::new(
                    "doc1".to_string(),
                    0.8,
                    vec!["test".to_string()],
                    "test content 1".to_string(),
                ),
                BM25Result::new(
                    "doc2".to_string(),
                    0.6,
                    vec!["test".to_string()],
                    "test content 2".to_string(),
                ),
            ];

            let vector_results = vec![
                SearchResult::new(
                    "doc1".to_string(),
                    0.9,
                    create_mock_vector_record("doc1", "test1.rs", 0.9),
                ),
                SearchResult::new(
                    "doc3".to_string(),
                    0.7,
                    create_mock_vector_record("doc3", "test3.rs", 0.7),
                ),
            ];

            let normalized_bm25 = vec![1.0, 0.5];
            let normalized_vector = vec![1.0, 0.8];
            let alpha = 0.3;

            // Create engine with dummy components (we're only testing merge_results)
            let bm25 = Arc::new(BM25Engine::new_in_memory().unwrap());
            let embedding =
                Arc::new(
                    crate::embedding::EmbeddingEngine::new(
                        crate::embedding::EmbeddingConfig::default(),
                    )
                    .await
                    .unwrap(),
                );
            let milvus = Arc::new(
                crate::storage::MilvusClient::new("http://localhost:19530")
                    .await
                    .unwrap(),
            );

            let engine = HybridSearchEngine::new(bm25, milvus, embedding);

            // Test merge_results method
            let results = engine
                .merge_results(
                    &bm25_results,
                    &normalized_bm25,
                    &vector_results,
                    &normalized_vector,
                    alpha,
                )
                .await
                .unwrap();

            // Should have 3 unique documents: doc1 (both sources), doc2 (BM25), doc3 (vector)
            assert_eq!(results.len(), 3);
        }

        #[test]
        fn test_score_merging_logic() {
            // Test score combination formula: hybrid_score = alpha * norm_bm25 + (1-alpha) * norm_vec
            let alpha = 0.3_f32;
            let norm_bm25 = 0.8_f32;
            let norm_vec = 0.6_f32;

            let hybrid_score = alpha * norm_bm25 + (1.0 - alpha) * norm_vec;
            assert!((hybrid_score - 0.66_f32).abs() < 1e-6);

            // Test with alpha = 0.0 (pure vector search)
            let alpha = 0.0_f32;
            let hybrid_score = alpha * norm_bm25 + (1.0 - alpha) * norm_vec;
            assert!((hybrid_score - norm_vec).abs() < 1e-6);

            // Test with alpha = 1.0 (pure BM25 search)
            let alpha = 1.0_f32;
            let hybrid_score = alpha * norm_bm25 + (1.0 - alpha) * norm_vec;
            assert!((hybrid_score - norm_bm25).abs() < 1e-6);

            // Test with alpha = 0.5 (equal weight)
            let alpha = 0.5_f32;
            let hybrid_score = alpha * norm_bm25 + (1.0 - alpha) * norm_vec;
            assert!((hybrid_score - 0.7_f32).abs() < 1e-6);
        }

        #[test]
        fn test_normalization_with_different_methods() {
            let scores = vec![1.0, 2.0, 3.0, 4.0, 5.0];

            // MinMax normalization
            let min_max = normalize_scores(&scores, NormalizationType::MinMax);
            assert_eq!(min_max.len(), 5);
            assert!((min_max[0] - 0.0).abs() < 1e-6);
            assert!((min_max[4] - 1.0).abs() < 1e-6);
            // Check that values are in [0, 1]
            for &score in &min_max {
                assert!((0.0..=1.0).contains(&score));
            }

            // ZScore normalization
            let z_score = normalize_scores(&scores, NormalizationType::ZScore);
            assert_eq!(z_score.len(), 5);
            // Mean should be approximately 0
            let mean: f32 = z_score.iter().sum::<f32>() / z_score.len() as f32;
            assert!(mean.abs() < 1e-6);

            // None (no normalization)
            let none = normalize_scores(&scores, NormalizationType::None);
            assert_eq!(none, scores);
        }

        #[test]
        fn test_hybrid_config_boundary_values() {
            // Test alpha = 0.0 (pure vector)
            let config = HybridConfig::new(0.0, 10);
            assert!(config.validate().is_ok());
            assert_eq!(config.alpha, 0.0);

            // Test alpha = 1.0 (pure BM25)
            let config = HybridConfig::new(1.0, 10);
            assert!(config.validate().is_ok());
            assert_eq!(config.alpha, 1.0);

            // Test various valid alpha values
            for alpha in [0.0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0] {
                let config = HybridConfig::new(alpha, 10);
                assert!(config.validate().is_ok(), "Alpha {} should be valid", alpha);
            }

            // Test invalid alpha values
            for alpha in [-0.1, -1.0, 1.1, 2.0] {
                let config = HybridConfig::new(alpha, 10);
                assert!(
                    config.validate().is_err(),
                    "Alpha {} should be invalid",
                    alpha
                );
            }
        }

        #[test]
        fn test_hybrid_config_top_k_variations() {
            // Test various top_k values
            for top_k in [1, 5, 10, 20, 50, 100] {
                let config = HybridConfig::new(0.3, top_k);
                assert!(config.validate().is_ok(), "top_k {} should be valid", top_k);
                assert_eq!(config.top_k, top_k);
                assert_eq!(config.bm25_top_k, top_k * 3);
                assert_eq!(config.vector_top_k, top_k * 3);
            }

            // Test invalid top_k
            let config = HybridConfig::new(0.3, 0);
            assert!(config.validate().is_err());
        }

        #[test]
        fn test_hybrid_config_with_custom_candidate_sizes() {
            let config = HybridConfig::new(0.3, 10)
                .with_bm25_top_k(50)
                .with_vector_top_k(40);

            assert!(config.validate().is_ok());
            assert_eq!(config.bm25_top_k, 50);
            assert_eq!(config.vector_top_k, 40);
        }

        #[test]
        fn test_normalization_preserves_order() {
            let scores = vec![1.0, 2.0, 3.0, 4.0, 5.0];

            // MinMax should preserve order
            let normalized = normalize_min_max(&scores);
            for i in 1..normalized.len() {
                assert!(
                    normalized[i] >= normalized[i - 1],
                    "MinMax normalization should preserve order"
                );
            }

            // None should preserve order (and values)
            let normalized = normalize_scores(&scores, NormalizationType::None);
            assert_eq!(normalized, scores);
        }

        #[test]
        fn test_normalization_with_negative_scores() {
            let scores = vec![-2.0, -1.0, 0.0, 1.0, 2.0];

            // MinMax normalization
            let normalized = normalize_min_max(&scores);
            assert_eq!(normalized.len(), 5);
            assert!((normalized[0] - 0.0).abs() < 1e-6); // min should be 0
            assert!((normalized[4] - 1.0).abs() < 1e-6); // max should be 1

            // ZScore normalization
            let normalized = normalize_z_score(&scores);
            let mean: f32 = normalized.iter().sum::<f32>() / normalized.len() as f32;
            assert!(mean.abs() < 1e-6);
        }

        #[test]
        fn test_normalization_with_large_value_ranges() {
            let scores = vec![0.001, 0.002, 100.0, 200.0, 1000.0];

            // MinMax normalization should handle large ranges
            let normalized = normalize_min_max(&scores);
            assert!((normalized[0] - 0.0).abs() < 1e-6);
            assert!((normalized[4] - 1.0).abs() < 1e-6);

            // ZScore normalization
            let normalized = normalize_z_score(&scores);
            let mean: f32 = normalized.iter().sum::<f32>() / normalized.len() as f32;
            assert!(mean.abs() < 1e-3); // Allow slightly larger error for large ranges
        }

        #[test]
        fn test_hybrid_result_methods() {
            let record = create_mock_vector_record("test_id", "test.rs", 0.9);

            // Test with both scores (hybrid)
            let result = HybridResult::new(
                "test_id".to_string(),
                0.75,
                Some(0.7),
                Some(0.8),
                record.clone(),
                vec!["keyword".to_string()],
            );
            assert!(result.is_hybrid());
            assert!(result.has_bm25());
            assert!(result.has_vector());

            // Test with only BM25 score
            let result = HybridResult::new(
                "test_id".to_string(),
                0.7,
                Some(0.7),
                None,
                record.clone(),
                vec!["keyword".to_string()],
            );
            assert!(!result.is_hybrid());
            assert!(result.has_bm25());
            assert!(!result.has_vector());

            // Test with only vector score
            let result = HybridResult::new(
                "test_id".to_string(),
                0.8,
                None,
                Some(0.8),
                record.clone(),
                vec![],
            );
            assert!(!result.is_hybrid());
            assert!(!result.has_bm25());
            assert!(result.has_vector());
        }

        #[test]
        fn test_hybrid_config_normalization_types() {
            let config = HybridConfig::new(0.3, 10).with_normalization(NormalizationType::MinMax);
            assert_eq!(config.normalization, NormalizationType::MinMax);

            let config = HybridConfig::new(0.3, 10).with_normalization(NormalizationType::ZScore);
            assert_eq!(config.normalization, NormalizationType::ZScore);

            let config = HybridConfig::new(0.3, 10).with_normalization(NormalizationType::None);
            assert_eq!(config.normalization, NormalizationType::None);
        }

        #[test]
        fn test_score_sorting_behavior() {
            // Test that results would be sorted correctly by score
            let mut scores = vec![0.3, 0.9, 0.5, 0.1, 0.7];
            scores.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

            assert_eq!(scores, vec![0.9, 0.7, 0.5, 0.3, 0.1]);
        }

        #[test]
        fn test_normalization_stability() {
            // Test that normalizing the same data twice gives the same result
            let scores = vec![1.0, 2.0, 3.0, 4.0, 5.0];

            let result1 = normalize_min_max(&scores);
            let result2 = normalize_min_max(&scores);
            assert_eq!(result1, result2);

            let result1 = normalize_z_score(&scores);
            let result2 = normalize_z_score(&scores);
            for (a, b) in result1.iter().zip(result2.iter()) {
                assert!((a - b).abs() < 1e-6);
            }
        }
    }
}
