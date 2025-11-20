/// Storage module for vector database integration
///
/// This module provides abstractions for storing and querying code embeddings
/// using Milvus as the vector database backend.
pub mod milvus_client;
pub mod types;

pub use milvus_client::MilvusClient;
pub use types::{
    CollectionConfig, CollectionStats, FieldSchema, IndexConfig, IndexType, MetricType,
    SearchQuery, SearchResult, VectorRecord,
};
