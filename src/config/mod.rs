/// Configuration management for Context-MCP server
///
/// This module handles loading, parsing, and validating configuration from:
/// - .context-mcp.json files
/// - Environment variables
/// - Default values
///
/// # Configuration File Format
///
/// ```json
/// {
///   "milvus": {
///     "address": "localhost:19530",
///     "token": null
///   },
///   "embedding": {
///     "modelPath": "./models/all-MiniLM-L6-v2.onnx",
///     "tokenizerPath": "./models/tokenizer.json",
///     "maxLength": 256,
///     "batchSize": 32
///   },
///   "bm25": {
///     "dbPath": "./data/bm25_index.db",
///     "k1": 1.5,
///     "b": 0.75
///   },
///   "indexing": {
///     "batchSize": 32,
///     "maxParallel": 8,
///     "collectionName": "code_vectors"
///   },
///   "hybrid": {
///     "alpha": 0.3,
///     "normalization": "MinMax",
///     "bm25TopK": 20,
///     "vectorTopK": 20
///   }
/// }
/// ```
use crate::error::{ContextMcpError, Result};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

/// Complete server configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    /// Milvus vector database configuration
    #[serde(default)]
    pub milvus: MilvusConfig,

    /// Embedding model configuration
    #[serde(default)]
    pub embedding: EmbeddingConfig,

    /// BM25 search engine configuration
    #[serde(default)]
    pub bm25: BM25Config,

    /// Indexing service configuration
    #[serde(default)]
    pub indexing: IndexingConfig,

    /// Hybrid search configuration
    #[serde(default)]
    pub hybrid: HybridConfig,
}

/// Milvus configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilvusConfig {
    /// Milvus server address (e.g., "localhost:19530")
    #[serde(default = "default_milvus_address")]
    pub address: String,

    /// Authentication token (optional, for Zilliz Cloud)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,

    /// Collection shard number (default: 2)
    #[serde(default = "default_shard_num")]
    pub shard_num: i32,
}

/// Embedding model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingConfig {
    /// Path to ONNX model file
    #[serde(default = "default_model_path")]
    pub model_path: PathBuf,

    /// Path to tokenizer file
    #[serde(default = "default_tokenizer_path")]
    pub tokenizer_path: PathBuf,

    /// Maximum sequence length (default: 256)
    #[serde(default = "default_max_length")]
    pub max_length: usize,

    /// Batch size for embedding generation (default: 32)
    #[serde(default = "default_embedding_batch_size")]
    pub batch_size: usize,
}

/// BM25 configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BM25Config {
    /// Path to SQLite database file
    #[serde(default = "default_bm25_db_path")]
    pub db_path: PathBuf,

    /// BM25 k1 parameter (default: 1.5)
    #[serde(default = "default_bm25_k1")]
    pub k1: f32,

    /// BM25 b parameter (default: 0.75)
    #[serde(default = "default_bm25_b")]
    pub b: f32,
}

/// Indexing service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingConfig {
    /// Batch size for file processing (default: 32)
    #[serde(default = "default_indexing_batch_size")]
    pub batch_size: usize,

    /// Maximum parallel tasks (default: 8)
    #[serde(default = "default_max_parallel")]
    pub max_parallel: usize,

    /// Collection name for vectors (default: "code_vectors")
    #[serde(default = "default_collection_name")]
    pub collection_name: String,

    /// Vector dimension (default: 384 for all-MiniLM-L6-v2)
    #[serde(default = "default_dimension")]
    pub dimension: usize,
}

/// Hybrid search configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridConfig {
    /// Hybrid search alpha parameter (weight for BM25, default: 0.3)
    /// Formula: score = alpha * bm25 + (1-alpha) * vector
    #[serde(default = "default_alpha")]
    pub alpha: f32,

    /// Normalization method (MinMax, ZScore, or None)
    #[serde(default = "default_normalization")]
    pub normalization: String,

    /// Top-K for BM25 search (default: 20)
    #[serde(default = "default_bm25_top_k")]
    pub bm25_top_k: usize,

    /// Top-K for vector search (default: 20)
    #[serde(default = "default_vector_top_k")]
    pub vector_top_k: usize,
}

// Default value functions
fn default_milvus_address() -> String {
    env::var("MILVUS_ADDRESS").unwrap_or_else(|_| "localhost:19530".to_string())
}

fn default_shard_num() -> i32 {
    2
}

fn default_model_path() -> PathBuf {
    env::var("MODEL_PATH")
        .unwrap_or_else(|_| "./models/all-MiniLM-L6-v2.onnx".to_string())
        .into()
}

fn default_tokenizer_path() -> PathBuf {
    env::var("TOKENIZER_PATH")
        .unwrap_or_else(|_| "./models/tokenizer.json".to_string())
        .into()
}

fn default_max_length() -> usize {
    256
}

fn default_embedding_batch_size() -> usize {
    32
}

fn default_bm25_db_path() -> PathBuf {
    env::var("BM25_DB_PATH")
        .unwrap_or_else(|_| "./data/bm25_index.db".to_string())
        .into()
}

fn default_bm25_k1() -> f32 {
    1.5
}

fn default_bm25_b() -> f32 {
    0.75
}

fn default_indexing_batch_size() -> usize {
    32
}

fn default_max_parallel() -> usize {
    8
}

fn default_collection_name() -> String {
    "code_vectors".to_string()
}

fn default_dimension() -> usize {
    384 // all-MiniLM-L6-v2 dimension
}

fn default_alpha() -> f32 {
    0.3
}

fn default_normalization() -> String {
    "MinMax".to_string()
}

fn default_bm25_top_k() -> usize {
    20
}

fn default_vector_top_k() -> usize {
    20
}

// Default implementations
impl Default for MilvusConfig {
    fn default() -> Self {
        Self {
            address: default_milvus_address(),
            token: None,
            shard_num: default_shard_num(),
        }
    }
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            model_path: default_model_path(),
            tokenizer_path: default_tokenizer_path(),
            max_length: default_max_length(),
            batch_size: default_embedding_batch_size(),
        }
    }
}

impl Default for BM25Config {
    fn default() -> Self {
        Self {
            db_path: default_bm25_db_path(),
            k1: default_bm25_k1(),
            b: default_bm25_b(),
        }
    }
}

impl Default for IndexingConfig {
    fn default() -> Self {
        Self {
            batch_size: default_indexing_batch_size(),
            max_parallel: default_max_parallel(),
            collection_name: default_collection_name(),
            dimension: default_dimension(),
        }
    }
}

impl Default for HybridConfig {
    fn default() -> Self {
        Self {
            alpha: default_alpha(),
            normalization: default_normalization(),
            bm25_top_k: default_bm25_top_k(),
            vector_top_k: default_vector_top_k(),
        }
    }
}

impl ServerConfig {
    /// Load configuration from a JSON file
    ///
    /// # Arguments
    /// * `path` - Path to the configuration file
    ///
    /// # Returns
    /// Loaded and validated configuration
    pub fn from_file(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        info!("Loading configuration from {:?}", path);

        if !path.exists() {
            warn!("Configuration file not found, using defaults");
            return Ok(Self::default());
        }

        let contents = std::fs::read_to_string(path)
            .map_err(|e| ContextMcpError::Config(format!("Failed to read config file: {}", e)))?;

        let mut config: Self = serde_json::from_str(&contents)
            .map_err(|e| ContextMcpError::Config(format!("Failed to parse config file: {}", e)))?;

        // Apply environment variable overrides
        config.apply_env_overrides();

        // Validate configuration
        config.validate()?;

        info!("Configuration loaded successfully");
        debug!("Config: {:?}", config);

        Ok(config)
    }

    /// Create a default configuration and save it to a file
    pub fn save_default(path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();
        info!("Saving default configuration to {:?}", path);

        let config = Self::default();
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| ContextMcpError::Config(format!("Failed to serialize config: {}", e)))?;

        std::fs::write(path, json)
            .map_err(|e| ContextMcpError::Config(format!("Failed to write config file: {}", e)))?;

        info!("Default configuration saved");
        Ok(())
    }

    /// Load configuration with fallback to default
    ///
    /// Searches for .context-mcp.json in:
    /// 1. Current directory
    /// 2. Home directory
    /// 3. Fallback to defaults
    pub fn load_with_fallback() -> Result<Self> {
        // Try current directory
        if let Ok(config) = Self::from_file(".context-mcp.json") {
            return Ok(config);
        }

        // Try home directory
        if let Ok(home) = env::var("HOME") {
            let home_config = Path::new(&home).join(".context-mcp.json");
            if let Ok(config) = Self::from_file(&home_config) {
                return Ok(config);
            }
        }

        // Fallback to defaults
        warn!("No configuration file found, using defaults");
        Ok(Self::default())
    }

    /// Apply environment variable overrides
    fn apply_env_overrides(&mut self) {
        if let Ok(addr) = env::var("MILVUS_ADDRESS") {
            debug!("Overriding Milvus address from env: {}", addr);
            self.milvus.address = addr;
        }

        if let Ok(token) = env::var("MILVUS_TOKEN") {
            debug!("Overriding Milvus token from env");
            self.milvus.token = Some(token);
        }

        if let Ok(path) = env::var("MODEL_PATH") {
            debug!("Overriding model path from env: {}", path);
            self.embedding.model_path = path.into();
        }

        if let Ok(path) = env::var("TOKENIZER_PATH") {
            debug!("Overriding tokenizer path from env: {}", path);
            self.embedding.tokenizer_path = path.into();
        }

        if let Ok(path) = env::var("BM25_DB_PATH") {
            debug!("Overriding BM25 DB path from env: {}", path);
            self.bm25.db_path = path.into();
        }
    }

    /// Validate configuration values
    pub fn validate(&self) -> Result<()> {
        // Validate alpha (must be between 0 and 1)
        if !(0.0..=1.0).contains(&self.hybrid.alpha) {
            return Err(ContextMcpError::Config(format!(
                "Invalid alpha value: {}. Must be between 0.0 and 1.0",
                self.hybrid.alpha
            )));
        }

        // Validate BM25 parameters
        if self.bm25.k1 <= 0.0 {
            return Err(ContextMcpError::Config(format!(
                "Invalid BM25 k1: {}. Must be positive",
                self.bm25.k1
            )));
        }

        if !(0.0..=1.0).contains(&self.bm25.b) {
            return Err(ContextMcpError::Config(format!(
                "Invalid BM25 b: {}. Must be between 0.0 and 1.0",
                self.bm25.b
            )));
        }

        // Validate normalization type
        let valid_norms = ["MinMax", "ZScore", "None"];
        if !valid_norms.contains(&self.hybrid.normalization.as_str()) {
            return Err(ContextMcpError::Config(format!(
                "Invalid normalization type: '{}'. Must be one of: {:?}",
                self.hybrid.normalization, valid_norms
            )));
        }

        // Validate batch sizes
        if self.indexing.batch_size == 0 {
            return Err(ContextMcpError::Config(
                "Indexing batch size must be greater than 0".to_string(),
            ));
        }

        if self.indexing.max_parallel == 0 {
            return Err(ContextMcpError::Config(
                "Max parallel tasks must be greater than 0".to_string(),
            ));
        }

        // Validate dimension
        if self.indexing.dimension == 0 {
            return Err(ContextMcpError::Config(
                "Vector dimension must be greater than 0".to_string(),
            ));
        }

        debug!("Configuration validation passed");
        Ok(())
    }

    /// Get a summary of the configuration
    pub fn summary(&self) -> String {
        format!(
            "Milvus: {}, Embedding: {:?}, BM25: {:?}, Collection: {}, Hybrid alpha: {}",
            self.milvus.address,
            self.embedding.model_path,
            self.bm25.db_path,
            self.indexing.collection_name,
            self.hybrid.alpha
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_default_config() {
        let config = ServerConfig::default();
        assert!(config.validate().is_ok());
        assert_eq!(config.milvus.address, "localhost:19530");
        assert_eq!(config.indexing.collection_name, "code_vectors");
        assert_eq!(config.hybrid.alpha, 0.3);
    }

    #[test]
    fn test_config_validation() {
        let mut config = ServerConfig::default();

        // Test invalid alpha
        config.hybrid.alpha = 1.5;
        assert!(config.validate().is_err());

        config.hybrid.alpha = 0.3;
        assert!(config.validate().is_ok());

        // Test invalid normalization
        config.hybrid.normalization = "Invalid".to_string();
        assert!(config.validate().is_err());

        config.hybrid.normalization = "MinMax".to_string();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_save_and_load() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("test-config.json");

        // Save default config
        ServerConfig::save_default(&config_path).unwrap();
        assert!(config_path.exists());

        // Load it back
        let loaded = ServerConfig::from_file(&config_path).unwrap();
        assert_eq!(loaded.milvus.address, "localhost:19530");
    }

    #[test]
    fn test_json_serialization() {
        let config = ServerConfig::default();
        let json = serde_json::to_string_pretty(&config).unwrap();

        // Verify it contains expected fields
        assert!(json.contains("milvus"));
        assert!(json.contains("embedding"));
        assert!(json.contains("bm25"));
        assert!(json.contains("indexing"));
        assert!(json.contains("hybrid"));

        // Deserialize back
        let parsed: ServerConfig = serde_json::from_str(&json).unwrap();
        assert!(parsed.validate().is_ok());
    }
}
