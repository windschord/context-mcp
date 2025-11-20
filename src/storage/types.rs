use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for creating a Milvus collection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionConfig {
    /// Name of the collection
    pub name: String,
    /// Description of the collection
    pub description: String,
    /// Vector dimension
    pub dimension: i32,
    /// Index configuration
    pub index_config: IndexConfig,
    /// Optional shard number (default: 2)
    pub shard_num: Option<i32>,
}

impl CollectionConfig {
    /// Create a new collection configuration for code vectors
    pub fn code_vectors(dimension: i32) -> Self {
        Self {
            name: "code_vectors".to_string(),
            description: "Code embeddings with AST metadata".to_string(),
            dimension,
            index_config: IndexConfig::default(),
            shard_num: Some(2),
        }
    }
}

/// Index configuration for vector search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexConfig {
    /// Index type (IVF_FLAT, HNSW, etc.)
    pub index_type: IndexType,
    /// Metric type (COSINE, L2, IP)
    pub metric_type: MetricType,
    /// Index parameters
    pub params: HashMap<String, String>,
}

impl Default for IndexConfig {
    fn default() -> Self {
        let mut params = HashMap::new();
        params.insert("nlist".to_string(), "1024".to_string());

        Self {
            index_type: IndexType::IvfFlat,
            metric_type: MetricType::Cosine,
            params,
        }
    }
}

/// Supported index types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum IndexType {
    /// Inverted File with Flat compression
    IvfFlat,
    /// Inverted File with Product Quantization
    IvfPq,
    /// Inverted File with Scalar Quantization
    IvfSq8,
    /// Hierarchical Navigable Small World
    Hnsw,
    /// Flat (brute force)
    Flat,
}

impl IndexType {
    pub fn as_str(&self) -> &str {
        match self {
            IndexType::IvfFlat => "IVF_FLAT",
            IndexType::IvfPq => "IVF_PQ",
            IndexType::IvfSq8 => "IVF_SQ8",
            IndexType::Hnsw => "HNSW",
            IndexType::Flat => "FLAT",
        }
    }
}

/// Metric types for similarity computation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum MetricType {
    /// Cosine similarity
    Cosine,
    /// L2 (Euclidean) distance
    L2,
    /// Inner product
    #[serde(rename = "IP")]
    InnerProduct,
}

impl MetricType {
    pub fn as_str(&self) -> &str {
        match self {
            MetricType::Cosine => "COSINE",
            MetricType::L2 => "L2",
            MetricType::InnerProduct => "IP",
        }
    }
}

/// Field schema for collection fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldSchema {
    pub name: String,
    pub data_type: String,
    pub is_primary_key: bool,
    pub auto_id: bool,
    pub params: HashMap<String, String>,
}

/// A vector record to be stored in Milvus
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorRecord {
    /// Unique identifier (format: "file_path:line_start")
    pub id: String,
    /// Embedding vector
    pub vector: Vec<f32>,
    /// Project ID
    pub project_id: String,
    /// File path
    pub file_path: String,
    /// Programming language
    pub language: String,
    /// Symbol type (function, class, variable, etc.)
    pub symbol_type: String,
    /// Symbol name
    pub symbol_name: String,
    /// Start line number
    pub line_start: i64,
    /// End line number
    pub line_end: i64,
    /// Code snippet
    pub snippet: String,
    /// Docstring or comment
    pub docstring: String,
    /// Additional metadata as JSON
    pub metadata: HashMap<String, String>,
}

impl VectorRecord {
    /// Create a new vector record
    pub fn new(
        id: String,
        vector: Vec<f32>,
        project_id: String,
        file_path: String,
        language: String,
        symbol_type: String,
        symbol_name: String,
        line_start: i64,
        line_end: i64,
        snippet: String,
        docstring: String,
    ) -> Self {
        Self {
            id,
            vector,
            project_id,
            file_path,
            language,
            symbol_type,
            symbol_name,
            line_start,
            line_end,
            snippet,
            docstring,
            metadata: HashMap::new(),
        }
    }

    /// Add metadata field
    pub fn with_metadata(mut self, key: String, value: String) -> Self {
        self.metadata.insert(key, value);
        self
    }
}

/// Query parameters for vector search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    /// Query vector
    pub vector: Vec<f32>,
    /// Number of results to return
    pub top_k: usize,
    /// Metadata filters (Milvus expression syntax)
    pub filters: Option<String>,
    /// Fields to return in results
    pub output_fields: Vec<String>,
    /// Search parameters
    pub search_params: HashMap<String, String>,
}

impl SearchQuery {
    /// Create a new search query
    pub fn new(vector: Vec<f32>, top_k: usize) -> Self {
        let mut search_params = HashMap::new();
        search_params.insert("nprobe".to_string(), "10".to_string());

        Self {
            vector,
            top_k,
            filters: None,
            output_fields: vec![
                "id".to_string(),
                "file_path".to_string(),
                "language".to_string(),
                "symbol_type".to_string(),
                "symbol_name".to_string(),
                "line_start".to_string(),
                "line_end".to_string(),
                "snippet".to_string(),
                "docstring".to_string(),
            ],
            search_params,
        }
    }

    /// Add a filter expression
    pub fn with_filter(mut self, filter: String) -> Self {
        self.filters = Some(filter);
        self
    }

    /// Set custom output fields
    pub fn with_output_fields(mut self, fields: Vec<String>) -> Self {
        self.output_fields = fields;
        self
    }

    /// Set search parameters (nprobe, ef, etc.)
    pub fn with_search_params(mut self, params: HashMap<String, String>) -> Self {
        self.search_params = params;
        self
    }
}

/// Search result from Milvus
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// Record ID
    pub id: String,
    /// Similarity score (higher is more similar for COSINE and IP, lower for L2)
    pub score: f32,
    /// The vector record data
    pub record: VectorRecord,
}

impl SearchResult {
    /// Create a new search result
    pub fn new(id: String, score: f32, record: VectorRecord) -> Self {
        Self { id, score, record }
    }
}

/// Collection statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionStats {
    /// Collection name
    pub name: String,
    /// Number of entities (vectors)
    pub entity_count: i64,
    /// Index status
    pub indexed: bool,
    /// Memory usage in bytes
    pub memory_size: i64,
}

impl CollectionStats {
    /// Create new collection statistics
    pub fn new(name: String, entity_count: i64, indexed: bool, memory_size: i64) -> Self {
        Self {
            name,
            entity_count,
            indexed,
            memory_size,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collection_config_creation() {
        let config = CollectionConfig::code_vectors(384);
        assert_eq!(config.name, "code_vectors");
        assert_eq!(config.dimension, 384);
        assert_eq!(config.shard_num, Some(2));
    }

    #[test]
    fn test_vector_record_creation() {
        let record = VectorRecord::new(
            "test.rs:10".to_string(),
            vec![0.1, 0.2, 0.3],
            "project1".to_string(),
            "/path/to/test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "test_fn".to_string(),
            10,
            20,
            "fn test_fn() {}".to_string(),
            "Test function".to_string(),
        );

        assert_eq!(record.id, "test.rs:10");
        assert_eq!(record.language, "rust");
        assert_eq!(record.symbol_name, "test_fn");
    }

    #[test]
    fn test_search_query_creation() {
        let query =
            SearchQuery::new(vec![0.1, 0.2, 0.3], 10).with_filter("language == 'rust'".to_string());

        assert_eq!(query.top_k, 10);
        assert_eq!(query.filters, Some("language == 'rust'".to_string()));
    }

    #[test]
    fn test_index_type_serialization() {
        let index_type = IndexType::Hnsw;
        assert_eq!(index_type.as_str(), "HNSW");
    }

    #[test]
    fn test_metric_type_serialization() {
        let metric = MetricType::Cosine;
        assert_eq!(metric.as_str(), "COSINE");
    }
}
