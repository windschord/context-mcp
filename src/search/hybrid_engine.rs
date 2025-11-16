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
use crate::embedding::EmbeddingEngine;
use crate::search::bm25_engine::BM25Engine;
use crate::search::types::{HybridConfig, HybridResult, NormalizationType};
use crate::storage::types::{SearchQuery, VectorRecord};
use crate::storage::MilvusClient;
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// Hybrid search engine combining BM25 and vector search
pub struct HybridSearchEngine {
    /// BM25 engine for keyword search
    bm25: BM25Engine,

    /// Milvus client for vector search
    milvus: MilvusClient,

    /// Embedding engine for query vectorization
    embedding: EmbeddingEngine,
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
    pub fn new(bm25: BM25Engine, milvus: MilvusClient, embedding: EmbeddingEngine) -> Self {
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
        config
            .validate()
            .map_err(|e| ContextMcpError::Config(e))?;

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
            normalized_bm25.iter().cloned().fold(f32::INFINITY, f32::min),
            normalized_bm25.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
        );
        debug!(
            "Normalized vector scores: min={:.4}, max={:.4}",
            normalized_vector.iter().cloned().fold(f32::INFINITY, f32::min),
            normalized_vector.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
        );

        // Step 5 & 6: Combine and merge results
        let hybrid_results = self.merge_results(
            &bm25_results,
            &normalized_bm25,
            &vector_results,
            &normalized_vector,
            config.alpha,
        ).await?;

        // Sort by hybrid score (descending)
        let mut sorted_results = hybrid_results;
        sorted_results.sort_by(|a, b| {
            b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
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
            if let Some(vector_result) = vector_results.iter().find(|v| &v.id == id) {
                // Found in both sources - true hybrid result
                let vector_idx = vector_results.iter().position(|v| &v.id == id).unwrap();
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
                    vec![], // Empty vector
                    "unknown".to_string(), // project_id
                    id.clone(), // Use ID as file_path
                    "unknown".to_string(), // language
                    "document".to_string(), // symbol_type
                    "".to_string(), // symbol_name
                    0, // line_start
                    0, // line_end
                    bm25_result.text.clone(), // snippet
                    "".to_string(), // docstring
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
        let variance = normalized
            .iter()
            .map(|&x| x.powi(2))
            .sum::<f32>()
            / normalized.len() as f32;
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
}
