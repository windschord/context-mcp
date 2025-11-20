use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Configuration for the embedding engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingConfig {
    /// Path to the ONNX model file
    pub model_path: PathBuf,

    /// Path to the tokenizer JSON file
    pub tokenizer_path: PathBuf,

    /// Maximum sequence length for tokenization (default: 256)
    #[serde(default = "default_max_length")]
    pub max_length: usize,

    /// Batch size for processing multiple texts (default: 32)
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,
}

fn default_max_length() -> usize {
    256
}

fn default_batch_size() -> usize {
    32
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
            tokenizer_path: PathBuf::from("./models/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        }
    }
}

/// Information about the loaded embedding model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    /// Model name
    pub name: String,

    /// Model version
    pub version: String,

    /// Embedding dimension (e.g., 384 for all-MiniLM-L6-v2)
    pub dimension: usize,

    /// Maximum sequence length
    pub max_length: usize,

    /// Model file path
    pub model_path: PathBuf,

    /// Tokenizer type
    pub tokenizer_type: String,
}

impl ModelInfo {
    /// Create default model info for all-MiniLM-L6-v2
    pub fn all_mini_lm_l6_v2(model_path: PathBuf, max_length: usize) -> Self {
        Self {
            name: "all-MiniLM-L6-v2".to_string(),
            version: "1.0.0".to_string(),
            dimension: 384,
            max_length,
            model_path,
            tokenizer_type: "BertTokenizer".to_string(),
        }
    }
}

/// Embedding result containing the vector and metadata
#[derive(Debug, Clone)]
pub struct Embedding {
    /// The embedding vector (normalized L2 norm = 1)
    pub vector: Vec<f32>,

    /// Original text that was embedded
    pub text: String,

    /// Number of tokens in the text
    pub token_count: usize,
}

impl Embedding {
    /// Create a new embedding
    pub fn new(vector: Vec<f32>, text: String, token_count: usize) -> Self {
        Self {
            vector,
            text,
            token_count,
        }
    }

    /// Get the dimension of the embedding vector
    pub fn dimension(&self) -> usize {
        self.vector.len()
    }

    /// Check if the vector is normalized (L2 norm ≈ 1)
    pub fn is_normalized(&self) -> bool {
        let norm: f32 = self.vector.iter().map(|x| x * x).sum::<f32>().sqrt();
        (norm - 1.0).abs() < 1e-5
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_config_default() {
        let config = EmbeddingConfig::default();
        assert_eq!(config.max_length, 256);
        assert_eq!(config.batch_size, 32);
    }

    #[test]
    fn test_model_info_creation() {
        let info = ModelInfo::all_mini_lm_l6_v2(PathBuf::from("test.onnx"), 256);
        assert_eq!(info.name, "all-MiniLM-L6-v2");
        assert_eq!(info.dimension, 384);
    }

    #[test]
    fn test_embedding_normalization_check() {
        // Normalized vector
        let normalized = Embedding::new(vec![0.6, 0.8], "test".to_string(), 2);
        assert!(normalized.is_normalized());

        // Non-normalized vector
        let non_normalized = Embedding::new(vec![1.0, 1.0], "test".to_string(), 2);
        assert!(!non_normalized.is_normalized());
    }
}
