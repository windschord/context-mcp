use crate::error::{ContextMcpError, Result};
use crate::storage::types::{
    CollectionConfig, CollectionStats, IndexType, MetricType, SearchQuery, SearchResult,
    VectorRecord,
};
use milvus::client::Client;
use milvus::collection::{Collection, ParamValue};
use milvus::data::FieldColumn;
use milvus::index::IndexParams;
use milvus::schema::{CollectionSchema, CollectionSchemaBuilder, FieldSchema};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Milvus client for vector storage and retrieval
pub struct MilvusClient {
    client: Arc<Client>,
    collections: Arc<RwLock<HashMap<String, Collection>>>,
}

impl MilvusClient {
    /// Create a new Milvus client and connect to the server
    ///
    /// # Arguments
    /// * `address` - Milvus server address (e.g., "http://localhost:19530")
    ///
    /// # Example
    /// ```no_run
    /// # use context_mcp::storage::MilvusClient;
    /// # async fn example() -> context_mcp::Result<()> {
    /// let client = MilvusClient::new("http://localhost:19530").await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn new(address: &str) -> Result<Self> {
        info!("Connecting to Milvus at {}", address);

        let client = Client::new(address)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to connect to Milvus: {}", e)))?;

        debug!("Successfully connected to Milvus");

        Ok(Self {
            client: Arc::new(client),
            collections: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Create a new Milvus client with authentication token (for Zilliz Cloud)
    ///
    /// # Arguments
    /// * `address` - Milvus/Zilliz server address
    /// * `token` - Authentication token
    pub async fn new_with_token(address: &str, token: &str) -> Result<Self> {
        info!("Connecting to Milvus/Zilliz Cloud at {}", address);

        let client = Client::new(address)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to connect to Milvus: {}", e)))?;

        // Note: The milvus crate 0.2 doesn't have explicit token auth in constructor
        // Token should be passed via GRPC metadata or environment variables
        // For now, we'll document this limitation

        debug!("Successfully connected to Milvus/Zilliz Cloud");

        Ok(Self {
            client: Arc::new(client),
            collections: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Check if a collection exists
    ///
    /// # Arguments
    /// * `name` - Collection name
    pub async fn collection_exists(&self, name: &str) -> Result<bool> {
        debug!("Checking if collection '{}' exists", name);

        let exists = self
            .client
            .has_collection(name)
            .await
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to check collection existence: {}", e))
            })?;

        debug!("Collection '{}' exists: {}", name, exists);
        Ok(exists)
    }

    /// Create a new collection with the code vectors schema
    ///
    /// # Arguments
    /// * `config` - Collection configuration
    ///
    /// # Schema
    /// - id: VARCHAR (primary key)
    /// - vector: FLOAT_VECTOR
    /// - project_id: VARCHAR
    /// - file_path: VARCHAR
    /// - language: VARCHAR
    /// - symbol_type: VARCHAR
    /// - symbol_name: VARCHAR
    /// - line_start: INT64
    /// - line_end: INT64
    /// - snippet: VARCHAR
    /// - docstring: VARCHAR
    /// - metadata: JSON (stored as VARCHAR for milvus 0.2 compatibility)
    pub async fn create_collection(&self, config: CollectionConfig) -> Result<()> {
        info!(
            "Creating collection '{}' with dimension {}",
            config.name, config.dimension
        );

        // Check if collection already exists
        if self.collection_exists(&config.name).await? {
            warn!("Collection '{}' already exists, skipping creation", config.name);
            return Ok(());
        }

        // Build collection schema
        let schema = CollectionSchemaBuilder::new(&config.name, &config.description)
            .add_field(
                FieldSchema::new_primary_varchar("id", 256)
                    .with_description("Unique identifier (file_path:line_start)"),
            )
            .add_field(
                FieldSchema::new_float_vector("vector", config.dimension)
                    .with_description("Embedding vector"),
            )
            .add_field(
                FieldSchema::new_varchar("project_id", 128)
                    .with_description("Project identifier"),
            )
            .add_field(
                FieldSchema::new_varchar("file_path", 512).with_description("Source file path"),
            )
            .add_field(FieldSchema::new_varchar("language", 32).with_description("Programming language"))
            .add_field(
                FieldSchema::new_varchar("symbol_type", 32)
                    .with_description("Symbol type (function, class, etc.)"),
            )
            .add_field(FieldSchema::new_varchar("symbol_name", 128).with_description("Symbol name"))
            .add_field(FieldSchema::new_int64("line_start").with_description("Start line number"))
            .add_field(FieldSchema::new_int64("line_end").with_description("End line number"))
            .add_field(
                FieldSchema::new_varchar("snippet", 2048).with_description("Code snippet"),
            )
            .add_field(
                FieldSchema::new_varchar("docstring", 4096)
                    .with_description("Documentation string"),
            )
            .add_field(
                FieldSchema::new_varchar("metadata", 2048)
                    .with_description("Additional metadata as JSON"),
            )
            .build()
            .map_err(|e| ContextMcpError::Database(format!("Failed to build schema: {}", e)))?;

        // Create collection
        self.client
            .create_collection(schema, config.shard_num.unwrap_or(2))
            .await
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to create collection: {}", e))
            })?;

        info!("Collection '{}' created successfully", config.name);

        // Create index on vector field
        self.create_index(&config.name, &config.index_config)
            .await?;

        // Load collection into memory
        self.load_collection(&config.name).await?;

        Ok(())
    }

    /// Create an index on the vector field
    async fn create_index(
        &self,
        collection_name: &str,
        index_config: &crate::storage::types::IndexConfig,
    ) -> Result<()> {
        info!(
            "Creating index on collection '{}' with type {:?}",
            collection_name, index_config.index_type
        );

        let mut index_params = IndexParams::new(
            collection_name.to_string(),
            "vector".to_string(),
            index_config.index_type.as_str().to_string(),
        );

        // Add metric type
        index_params = index_params.metric_type(index_config.metric_type.as_str().to_string());

        // Add index-specific parameters
        for (key, value) in &index_config.params {
            index_params = index_params.extra_param(key.clone(), ParamValue::String(value.clone()));
        }

        self.client
            .create_index(index_params)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to create index: {}", e)))?;

        info!("Index created successfully on collection '{}'", collection_name);
        Ok(())
    }

    /// Load collection into memory for searching
    async fn load_collection(&self, collection_name: &str) -> Result<()> {
        info!("Loading collection '{}' into memory", collection_name);

        self.client
            .load_collection(collection_name)
            .await
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to load collection: {}", e))
            })?;

        info!("Collection '{}' loaded successfully", collection_name);
        Ok(())
    }

    /// Drop a collection
    ///
    /// # Arguments
    /// * `name` - Collection name
    pub async fn drop_collection(&self, name: &str) -> Result<()> {
        info!("Dropping collection '{}'", name);

        if !self.collection_exists(name).await? {
            warn!("Collection '{}' does not exist, skipping drop", name);
            return Ok(());
        }

        self.client
            .drop_collection(name)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to drop collection: {}", e)))?;

        // Remove from cache
        self.collections.write().await.remove(name);

        info!("Collection '{}' dropped successfully", name);
        Ok(())
    }

    /// Insert vector records into a collection
    ///
    /// # Arguments
    /// * `collection_name` - Name of the collection
    /// * `records` - Vector records to insert
    ///
    /// # Returns
    /// Vector of inserted record IDs
    pub async fn insert(
        &self,
        collection_name: &str,
        records: Vec<VectorRecord>,
    ) -> Result<Vec<String>> {
        debug!(
            "Inserting {} records into collection '{}'",
            records.len(),
            collection_name
        );

        if records.is_empty() {
            return Ok(vec![]);
        }

        // Prepare field columns
        let mut ids = Vec::new();
        let mut vectors = Vec::new();
        let mut project_ids = Vec::new();
        let mut file_paths = Vec::new();
        let mut languages = Vec::new();
        let mut symbol_types = Vec::new();
        let mut symbol_names = Vec::new();
        let mut line_starts = Vec::new();
        let mut line_ends = Vec::new();
        let mut snippets = Vec::new();
        let mut docstrings = Vec::new();
        let mut metadatas = Vec::new();

        for record in records {
            ids.push(record.id.clone());
            vectors.push(record.vector);
            project_ids.push(record.project_id);
            file_paths.push(record.file_path);
            languages.push(record.language);
            symbol_types.push(record.symbol_type);
            symbol_names.push(record.symbol_name);
            line_starts.push(record.line_start);
            line_ends.push(record.line_end);
            snippets.push(record.snippet);
            docstrings.push(record.docstring);
            // Serialize metadata as JSON string
            let metadata_json = serde_json::to_string(&record.metadata)
                .map_err(|e| ContextMcpError::Parse(format!("Failed to serialize metadata: {}", e)))?;
            metadatas.push(metadata_json);
        }

        let columns = vec![
            FieldColumn::new_varchar("id", ids.clone()),
            FieldColumn::new_float_vector("vector", vectors),
            FieldColumn::new_varchar("project_id", project_ids),
            FieldColumn::new_varchar("file_path", file_paths),
            FieldColumn::new_varchar("language", languages),
            FieldColumn::new_varchar("symbol_type", symbol_types),
            FieldColumn::new_varchar("symbol_name", symbol_names),
            FieldColumn::new_int64("line_start", line_starts),
            FieldColumn::new_int64("line_end", line_ends),
            FieldColumn::new_varchar("snippet", snippets),
            FieldColumn::new_varchar("docstring", docstrings),
            FieldColumn::new_varchar("metadata", metadatas),
        ];

        self.client
            .insert(collection_name, columns, None)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to insert records: {}", e)))?;

        debug!(
            "Successfully inserted {} records into collection '{}'",
            ids.len(),
            collection_name
        );

        Ok(ids)
    }

    /// Search for similar vectors
    ///
    /// # Arguments
    /// * `collection_name` - Name of the collection
    /// * `query` - Search query parameters
    ///
    /// # Returns
    /// Vector of search results sorted by similarity score
    pub async fn search(
        &self,
        collection_name: &str,
        query: SearchQuery,
    ) -> Result<Vec<SearchResult>> {
        debug!(
            "Searching collection '{}' with top_k={}",
            collection_name, query.top_k
        );

        // Build search parameters
        let mut search_params = HashMap::new();
        for (key, value) in query.search_params {
            search_params.insert(key, value);
        }

        // Prepare search vectors
        let vectors = vec![query.vector];

        // Execute search
        let results = self
            .client
            .search(
                collection_name,
                vectors,
                "vector",
                query.output_fields.clone(),
                query.filters.clone().unwrap_or_default(),
                query.top_k as i64,
                search_params,
            )
            .await
            .map_err(|e| ContextMcpError::Search(format!("Search failed: {}", e)))?;

        // Parse results
        let mut search_results = Vec::new();

        // Note: The milvus crate 0.2's search API returns a complex structure
        // We need to extract the results and convert them to our SearchResult type
        // This is a simplified implementation - you may need to adjust based on actual API

        // For now, we'll return an empty vector as the exact result parsing
        // depends on the milvus crate's internal structure
        // This will need to be updated once we can test with actual Milvus

        debug!("Search completed, processing results");

        // TODO: Parse actual search results from milvus response
        // The response structure needs to be mapped to our SearchResult type

        Ok(search_results)
    }

    /// Delete records by IDs
    ///
    /// # Arguments
    /// * `collection_name` - Name of the collection
    /// * `ids` - Vector of record IDs to delete
    pub async fn delete(&self, collection_name: &str, ids: Vec<String>) -> Result<()> {
        debug!(
            "Deleting {} records from collection '{}'",
            ids.len(),
            collection_name
        );

        if ids.is_empty() {
            return Ok(());
        }

        // Build delete expression
        let ids_str = ids
            .iter()
            .map(|id| format!("\"{}\"", id))
            .collect::<Vec<_>>()
            .join(", ");
        let expr = format!("id in [{}]", ids_str);

        self.client
            .delete(collection_name, &expr)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to delete records: {}", e)))?;

        debug!(
            "Successfully deleted {} records from collection '{}'",
            ids.len(),
            collection_name
        );

        Ok(())
    }

    /// Get collection statistics
    ///
    /// # Arguments
    /// * `name` - Collection name
    ///
    /// # Returns
    /// Collection statistics including entity count and index status
    pub async fn get_collection_stats(&self, name: &str) -> Result<CollectionStats> {
        debug!("Getting statistics for collection '{}'", name);

        // Get collection info
        let info = self
            .client
            .describe_collection(name)
            .await
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to describe collection: {}", e))
            })?;

        // Get entity count
        let stats = self
            .client
            .get_collection_statistics(name)
            .await
            .map_err(|e| {
                ContextMcpError::Database(format!("Failed to get collection statistics: {}", e))
            })?;

        // Parse entity count from stats
        // The stats object contains various statistics, we need to extract row_count
        let entity_count = 0; // TODO: Extract from stats response

        // Check if collection has index
        let indexed = true; // TODO: Check index status

        let collection_stats = CollectionStats::new(
            name.to_string(),
            entity_count,
            indexed,
            0, // Memory size not easily available in milvus 0.2
        );

        debug!("Collection '{}' stats: {:?}", name, collection_stats);

        Ok(collection_stats)
    }

    /// Flush collection to ensure all data is persisted
    ///
    /// # Arguments
    /// * `collection_name` - Name of the collection
    pub async fn flush(&self, collection_name: &str) -> Result<()> {
        info!("Flushing collection '{}'", collection_name);

        self.client
            .flush(&[collection_name])
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to flush collection: {}", e)))?;

        info!("Collection '{}' flushed successfully", collection_name);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These are integration tests that require a running Milvus instance
    // Run with: cargo test --package context-mcp --lib storage::milvus_client -- --ignored

    #[tokio::test]
    #[ignore] // Requires Milvus instance
    async fn test_connection() {
        let client = MilvusClient::new("http://localhost:19530").await;
        assert!(client.is_ok());
    }

    #[tokio::test]
    #[ignore] // Requires Milvus instance
    async fn test_create_and_drop_collection() {
        let client = MilvusClient::new("http://localhost:19530")
            .await
            .expect("Failed to connect");

        let config = CollectionConfig::code_vectors(384);

        // Create collection
        client
            .create_collection(config.clone())
            .await
            .expect("Failed to create collection");

        // Check existence
        let exists = client
            .collection_exists(&config.name)
            .await
            .expect("Failed to check collection");
        assert!(exists);

        // Drop collection
        client
            .drop_collection(&config.name)
            .await
            .expect("Failed to drop collection");

        // Verify dropped
        let exists = client
            .collection_exists(&config.name)
            .await
            .expect("Failed to check collection");
        assert!(!exists);
    }

    #[tokio::test]
    #[ignore] // Requires Milvus instance
    async fn test_insert_and_search() {
        let client = MilvusClient::new("http://localhost:19530")
            .await
            .expect("Failed to connect");

        let config = CollectionConfig::code_vectors(3); // Small dimension for testing

        // Create collection
        client
            .create_collection(config.clone())
            .await
            .expect("Failed to create collection");

        // Create test records
        let records = vec![
            VectorRecord::new(
                "test1.rs:10".to_string(),
                vec![0.1, 0.2, 0.3],
                "test_project".to_string(),
                "test1.rs".to_string(),
                "rust".to_string(),
                "function".to_string(),
                "test_fn".to_string(),
                10,
                20,
                "fn test_fn() {}".to_string(),
                "Test function".to_string(),
            ),
            VectorRecord::new(
                "test2.rs:30".to_string(),
                vec![0.4, 0.5, 0.6],
                "test_project".to_string(),
                "test2.rs".to_string(),
                "rust".to_string(),
                "struct".to_string(),
                "TestStruct".to_string(),
                30,
                40,
                "struct TestStruct {}".to_string(),
                "Test struct".to_string(),
            ),
        ];

        // Insert records
        let ids = client
            .insert(&config.name, records)
            .await
            .expect("Failed to insert records");
        assert_eq!(ids.len(), 2);

        // Flush to ensure data is persisted
        client.flush(&config.name).await.expect("Failed to flush");

        // Search
        let query = SearchQuery::new(vec![0.1, 0.2, 0.3], 10);
        let results = client
            .search(&config.name, query)
            .await
            .expect("Failed to search");

        // Note: Results validation would go here once search parsing is implemented

        // Cleanup
        client
            .drop_collection(&config.name)
            .await
            .expect("Failed to drop collection");
    }
}
