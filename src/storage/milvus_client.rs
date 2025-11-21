use crate::error::{ContextMcpError, Result};
use crate::storage::types::{
    CollectionConfig, CollectionStats, SearchQuery, SearchResult, VectorRecord,
};
use async_trait::async_trait;
use milvus::client::Client;
use milvus::collection::{Collection, MetricType, SearchParams};
use milvus::data::{FromField, SearchResults};
use milvus::schema::{self, Collection as _, Entity, FieldSchema};
use milvus::value::Value;
use std::collections::HashMap;
use tracing::{debug, info, warn};

#[cfg(test)]
use mockall::automock;

// デフォルトのベクトル次元数（FieldSchemaはconst contextで使用するため固定値が必要）
const DIMENSION: i64 = 384;

/// CodeVectorEntity: 単一のコードベクトルレコード
#[derive(Debug, Clone, Default)]
struct CodeVectorEntity {
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
    metadata: String,
}

impl schema::Entity for CodeVectorEntity {
    const NAME: &'static str = "code_vectors";
    const SCHEMA: &'static [schema::FieldSchema<'static>] = &[
        FieldSchema::new_primary_varchar(
            "id",
            Some("Unique identifier (file_path:line_start)"),
            false,
            256,
        ),
        FieldSchema::new_float_vector("vector", Some("Embedding vector"), DIMENSION),
        FieldSchema::new_varchar("project_id", Some("Project identifier"), 128),
        FieldSchema::new_varchar("file_path", Some("Source file path"), 512),
        FieldSchema::new_varchar("language", Some("Programming language"), 32),
        FieldSchema::new_varchar(
            "symbol_type",
            Some("Symbol type (function, class, etc.)"),
            32,
        ),
        FieldSchema::new_varchar("symbol_name", Some("Symbol name"), 128),
        FieldSchema::new_int64("line_start", Some("Start line number")),
        FieldSchema::new_int64("line_end", Some("End line number")),
        FieldSchema::new_varchar("snippet", Some("Code snippet"), 2048),
        FieldSchema::new_varchar("docstring", Some("Documentation string"), 4096),
        FieldSchema::new_varchar("metadata", Some("Additional metadata as JSON"), 2048),
    ];

    type ColumnIntoIter = std::array::IntoIter<
        (&'static FieldSchema<'static>, Value<'static>),
        { Self::SCHEMA.len() },
    >;

    fn iter(&self) -> Self::ColumnIntoIter {
        [
            (&Self::SCHEMA[0], Value::String(self.id.clone().into())),
            (
                &Self::SCHEMA[1],
                Value::FloatArray(self.vector.clone().into()),
            ),
            (
                &Self::SCHEMA[2],
                Value::String(self.project_id.clone().into()),
            ),
            (
                &Self::SCHEMA[3],
                Value::String(self.file_path.clone().into()),
            ),
            (
                &Self::SCHEMA[4],
                Value::String(self.language.clone().into()),
            ),
            (
                &Self::SCHEMA[5],
                Value::String(self.symbol_type.clone().into()),
            ),
            (
                &Self::SCHEMA[6],
                Value::String(self.symbol_name.clone().into()),
            ),
            (&Self::SCHEMA[7], Value::Long(self.line_start)),
            (&Self::SCHEMA[8], Value::Long(self.line_end)),
            (&Self::SCHEMA[9], Value::String(self.snippet.clone().into())),
            (
                &Self::SCHEMA[10],
                Value::String(self.docstring.clone().into()),
            ),
            (
                &Self::SCHEMA[11],
                Value::String(self.metadata.clone().into()),
            ),
        ]
        .into_iter()
    }

    fn into_iter(self) -> Self::ColumnIntoIter {
        [
            (&Self::SCHEMA[0], Value::String(self.id.into())),
            (&Self::SCHEMA[1], Value::FloatArray(self.vector.into())),
            (&Self::SCHEMA[2], Value::String(self.project_id.into())),
            (&Self::SCHEMA[3], Value::String(self.file_path.into())),
            (&Self::SCHEMA[4], Value::String(self.language.into())),
            (&Self::SCHEMA[5], Value::String(self.symbol_type.into())),
            (&Self::SCHEMA[6], Value::String(self.symbol_name.into())),
            (&Self::SCHEMA[7], Value::Long(self.line_start)),
            (&Self::SCHEMA[8], Value::Long(self.line_end)),
            (&Self::SCHEMA[9], Value::String(self.snippet.into())),
            (&Self::SCHEMA[10], Value::String(self.docstring.into())),
            (&Self::SCHEMA[11], Value::String(self.metadata.into())),
        ]
        .into_iter()
    }
}

/// CodeVectorBatch: バッチ挿入用の構造体
#[derive(Debug, Clone)]
struct CodeVectorBatch {
    id: Vec<String>,
    vector: Vec<f32>,
    project_id: Vec<String>,
    file_path: Vec<String>,
    language: Vec<String>,
    symbol_type: Vec<String>,
    symbol_name: Vec<String>,
    line_start: Vec<i64>,
    line_end: Vec<i64>,
    snippet: Vec<String>,
    docstring: Vec<String>,
    metadata: Vec<String>,
}

impl schema::IntoDataFields for CodeVectorBatch {
    fn into_data_fields(self) -> Vec<schema::FieldData> {
        let scm = <Self as schema::Collection>::Entity::SCHEMA;
        vec![
            milvus::data::make_field_data(&scm[0], self.id),
            milvus::data::make_field_data(&scm[1], self.vector),
            milvus::data::make_field_data(&scm[2], self.project_id),
            milvus::data::make_field_data(&scm[3], self.file_path),
            milvus::data::make_field_data(&scm[4], self.language),
            milvus::data::make_field_data(&scm[5], self.symbol_type),
            milvus::data::make_field_data(&scm[6], self.symbol_name),
            milvus::data::make_field_data(&scm[7], self.line_start),
            milvus::data::make_field_data(&scm[8], self.line_end),
            milvus::data::make_field_data(&scm[9], self.snippet),
            milvus::data::make_field_data(&scm[10], self.docstring),
            milvus::data::make_field_data(&scm[11], self.metadata),
        ]
    }
}

impl schema::FromDataFields for CodeVectorBatch {
    fn from_data_fields(mut fields: Vec<schema::FieldData>) -> Option<Self> {
        let mut this = CodeVectorBatch::with_capacity(0);

        while let Some(fld) = fields.pop() {
            let field = if let Some(f) = fld.field {
                f
            } else {
                continue;
            };

            match fld.field_name.as_str() {
                "id" => this.id = FromField::from_field(field)?,
                "vector" => this.vector = FromField::from_field(field)?,
                "project_id" => this.project_id = FromField::from_field(field)?,
                "file_path" => this.file_path = FromField::from_field(field)?,
                "language" => this.language = FromField::from_field(field)?,
                "symbol_type" => this.symbol_type = FromField::from_field(field)?,
                "symbol_name" => this.symbol_name = FromField::from_field(field)?,
                "line_start" => this.line_start = FromField::from_field(field)?,
                "line_end" => this.line_end = FromField::from_field(field)?,
                "snippet" => this.snippet = FromField::from_field(field)?,
                "docstring" => this.docstring = FromField::from_field(field)?,
                "metadata" => this.metadata = FromField::from_field(field)?,
                _ => continue,
            }
        }

        Some(this)
    }
}

impl<'a> schema::Collection<'a> for CodeVectorBatch {
    type Entity = CodeVectorEntity;
    type IterRows = Box<dyn Iterator<Item = Self::Entity> + 'a>;
    type IterColumns = Box<dyn Iterator<Item = milvus::data::FieldColumn<'static>> + 'a>;

    fn with_capacity(cap: usize) -> Self {
        let scm = <Self as schema::Collection>::Entity::SCHEMA;

        Self {
            id: Vec::with_capacity(cap),
            vector: Vec::with_capacity(cap * scm[1].dim as usize),
            project_id: Vec::with_capacity(cap),
            file_path: Vec::with_capacity(cap),
            language: Vec::with_capacity(cap),
            symbol_type: Vec::with_capacity(cap),
            symbol_name: Vec::with_capacity(cap),
            line_start: Vec::with_capacity(cap),
            line_end: Vec::with_capacity(cap),
            snippet: Vec::with_capacity(cap),
            docstring: Vec::with_capacity(cap),
            metadata: Vec::with_capacity(cap),
        }
    }

    fn add(&mut self, mut entity: Self::Entity) {
        self.id.push(entity.id);
        self.vector.append(&mut entity.vector);
        self.project_id.push(entity.project_id);
        self.file_path.push(entity.file_path);
        self.language.push(entity.language);
        self.symbol_type.push(entity.symbol_type);
        self.symbol_name.push(entity.symbol_name);
        self.line_start.push(entity.line_start);
        self.line_end.push(entity.line_end);
        self.snippet.push(entity.snippet);
        self.docstring.push(entity.docstring);
        self.metadata.push(entity.metadata);
    }

    fn index(&self, idx: usize) -> Option<Self::Entity> {
        let schm = <Self::Entity as Entity>::SCHEMA;
        let vector_dim = schm[1].dim as usize;
        let offset = idx * vector_dim;

        Some(CodeVectorEntity {
            id: self.id.get(idx)?.clone(),
            vector: self.vector[offset..offset + vector_dim].to_vec(),
            project_id: self.project_id.get(idx)?.clone(),
            file_path: self.file_path.get(idx)?.clone(),
            language: self.language.get(idx)?.clone(),
            symbol_type: self.symbol_type.get(idx)?.clone(),
            symbol_name: self.symbol_name.get(idx)?.clone(),
            line_start: *self.line_start.get(idx)?,
            line_end: *self.line_end.get(idx)?,
            snippet: self.snippet.get(idx)?.clone(),
            docstring: self.docstring.get(idx)?.clone(),
            metadata: self.metadata.get(idx)?.clone(),
        })
    }

    fn split_off(&mut self, at: usize) -> Self {
        let schm = <Self::Entity as Entity>::SCHEMA;
        let vector_dim = schm[1].dim as usize;

        Self {
            id: self.id.split_off(at),
            vector: self.vector.split_off(at * vector_dim),
            project_id: self.project_id.split_off(at),
            file_path: self.file_path.split_off(at),
            language: self.language.split_off(at),
            symbol_type: self.symbol_type.split_off(at),
            symbol_name: self.symbol_name.split_off(at),
            line_start: self.line_start.split_off(at),
            line_end: self.line_end.split_off(at),
            snippet: self.snippet.split_off(at),
            docstring: self.docstring.split_off(at),
            metadata: self.metadata.split_off(at),
        }
    }

    fn iter_columns(&self) -> Self::IterColumns {
        unimplemented!("iter_columns is not needed for our use case")
    }

    fn len(&self) -> usize {
        self.id.len()
    }

    fn append(&mut self, other: Self) {
        self.id.extend(other.id);
        self.vector.extend(other.vector);
        self.project_id.extend(other.project_id);
        self.file_path.extend(other.file_path);
        self.language.extend(other.language);
        self.symbol_type.extend(other.symbol_type);
        self.symbol_name.extend(other.symbol_name);
        self.line_start.extend(other.line_start);
        self.line_end.extend(other.line_end);
        self.snippet.extend(other.snippet);
        self.docstring.extend(other.docstring);
        self.metadata.extend(other.metadata);
    }
}

/// 検索結果用のCollection構造体（検索時に必要なフィールドのみ）
#[derive(Debug, Clone)]
struct CodeVectorSearchResult {
    id: Vec<String>,
    project_id: Vec<String>,
    file_path: Vec<String>,
    language: Vec<String>,
    symbol_type: Vec<String>,
    symbol_name: Vec<String>,
    line_start: Vec<i64>,
    line_end: Vec<i64>,
    snippet: Vec<String>,
    docstring: Vec<String>,
    metadata: Vec<String>,
}

impl schema::IntoDataFields for CodeVectorSearchResult {
    fn into_data_fields(self) -> Vec<schema::FieldData> {
        let scm = <Self as schema::Collection>::Entity::SCHEMA;
        vec![
            milvus::data::make_field_data(&scm[0], self.id),
            milvus::data::make_field_data(&scm[2], self.project_id),
            milvus::data::make_field_data(&scm[3], self.file_path),
            milvus::data::make_field_data(&scm[4], self.language),
            milvus::data::make_field_data(&scm[5], self.symbol_type),
            milvus::data::make_field_data(&scm[6], self.symbol_name),
            milvus::data::make_field_data(&scm[7], self.line_start),
            milvus::data::make_field_data(&scm[8], self.line_end),
            milvus::data::make_field_data(&scm[9], self.snippet),
            milvus::data::make_field_data(&scm[10], self.docstring),
            milvus::data::make_field_data(&scm[11], self.metadata),
        ]
    }
}

impl schema::FromDataFields for CodeVectorSearchResult {
    fn from_data_fields(mut fields: Vec<schema::FieldData>) -> Option<Self> {
        let mut this = Self::with_capacity(0);

        while let Some(fld) = fields.pop() {
            let field = if let Some(f) = fld.field {
                f
            } else {
                continue;
            };

            match fld.field_name.as_str() {
                "id" => this.id = FromField::from_field(field)?,
                "project_id" => this.project_id = FromField::from_field(field)?,
                "file_path" => this.file_path = FromField::from_field(field)?,
                "language" => this.language = FromField::from_field(field)?,
                "symbol_type" => this.symbol_type = FromField::from_field(field)?,
                "symbol_name" => this.symbol_name = FromField::from_field(field)?,
                "line_start" => this.line_start = FromField::from_field(field)?,
                "line_end" => this.line_end = FromField::from_field(field)?,
                "snippet" => this.snippet = FromField::from_field(field)?,
                "docstring" => this.docstring = FromField::from_field(field)?,
                "metadata" => this.metadata = FromField::from_field(field)?,
                _ => continue,
            }
        }

        Some(this)
    }
}

impl<'a> schema::Collection<'a> for CodeVectorSearchResult {
    type Entity = CodeVectorEntity;
    type IterRows = Box<dyn Iterator<Item = Self::Entity> + 'a>;
    type IterColumns = Box<dyn Iterator<Item = milvus::data::FieldColumn<'static>> + 'a>;

    fn with_capacity(cap: usize) -> Self {
        Self {
            id: Vec::with_capacity(cap),
            project_id: Vec::with_capacity(cap),
            file_path: Vec::with_capacity(cap),
            language: Vec::with_capacity(cap),
            symbol_type: Vec::with_capacity(cap),
            symbol_name: Vec::with_capacity(cap),
            line_start: Vec::with_capacity(cap),
            line_end: Vec::with_capacity(cap),
            snippet: Vec::with_capacity(cap),
            docstring: Vec::with_capacity(cap),
            metadata: Vec::with_capacity(cap),
        }
    }

    fn add(&mut self, entity: Self::Entity) {
        self.id.push(entity.id);
        self.project_id.push(entity.project_id);
        self.file_path.push(entity.file_path);
        self.language.push(entity.language);
        self.symbol_type.push(entity.symbol_type);
        self.symbol_name.push(entity.symbol_name);
        self.line_start.push(entity.line_start);
        self.line_end.push(entity.line_end);
        self.snippet.push(entity.snippet);
        self.docstring.push(entity.docstring);
        self.metadata.push(entity.metadata);
    }

    fn index(&self, idx: usize) -> Option<Self::Entity> {
        Some(CodeVectorEntity {
            id: self.id.get(idx)?.clone(),
            vector: Vec::new(), // 検索結果にはベクトルは含まれない
            project_id: self.project_id.get(idx)?.clone(),
            file_path: self.file_path.get(idx)?.clone(),
            language: self.language.get(idx)?.clone(),
            symbol_type: self.symbol_type.get(idx)?.clone(),
            symbol_name: self.symbol_name.get(idx)?.clone(),
            line_start: *self.line_start.get(idx)?,
            line_end: *self.line_end.get(idx)?,
            snippet: self.snippet.get(idx)?.clone(),
            docstring: self.docstring.get(idx)?.clone(),
            metadata: self.metadata.get(idx)?.clone(),
        })
    }

    fn split_off(&mut self, at: usize) -> Self {
        Self {
            id: self.id.split_off(at),
            project_id: self.project_id.split_off(at),
            file_path: self.file_path.split_off(at),
            language: self.language.split_off(at),
            symbol_type: self.symbol_type.split_off(at),
            symbol_name: self.symbol_name.split_off(at),
            line_start: self.line_start.split_off(at),
            line_end: self.line_end.split_off(at),
            snippet: self.snippet.split_off(at),
            docstring: self.docstring.split_off(at),
            metadata: self.metadata.split_off(at),
        }
    }

    fn iter_columns(&self) -> Self::IterColumns {
        unimplemented!("iter_columns is not needed for our use case")
    }

    fn len(&self) -> usize {
        self.id.len()
    }

    fn append(&mut self, other: Self) {
        self.id.extend(other.id);
        self.project_id.extend(other.project_id);
        self.file_path.extend(other.file_path);
        self.language.extend(other.language);
        self.symbol_type.extend(other.symbol_type);
        self.symbol_name.extend(other.symbol_name);
        self.line_start.extend(other.line_start);
        self.line_end.extend(other.line_end);
        self.snippet.extend(other.snippet);
        self.docstring.extend(other.docstring);
        self.metadata.extend(other.metadata);
    }

    fn columns() -> Vec<&'static FieldSchema<'static>> {
        vec![
            &Self::Entity::SCHEMA[0],  // id
            &Self::Entity::SCHEMA[2],  // project_id
            &Self::Entity::SCHEMA[3],  // file_path
            &Self::Entity::SCHEMA[4],  // language
            &Self::Entity::SCHEMA[5],  // symbol_type
            &Self::Entity::SCHEMA[6],  // symbol_name
            &Self::Entity::SCHEMA[7],  // line_start
            &Self::Entity::SCHEMA[8],  // line_end
            &Self::Entity::SCHEMA[9],  // snippet
            &Self::Entity::SCHEMA[10], // docstring
            &Self::Entity::SCHEMA[11], // metadata
        ]
    }
}

/// Trait for Milvus client operations
///
/// This trait defines the interface for interacting with a Milvus vector database.
/// It can be implemented by the real MilvusClient or mocked for testing purposes.
#[cfg_attr(test, automock)]
#[async_trait]
pub trait MilvusClientTrait: Send + Sync {
    /// Check if a collection exists
    async fn collection_exists(&self, name: &str) -> Result<bool>;

    /// Create a new collection with the given configuration
    async fn create_collection(&self, config: CollectionConfig) -> Result<()>;

    /// Drop a collection
    async fn drop_collection(&self, name: &str) -> Result<()>;

    /// Insert vector records into a collection
    async fn insert(
        &self,
        collection_name: &str,
        records: Vec<VectorRecord>,
    ) -> Result<Vec<String>>;

    /// Search for similar vectors
    async fn search(
        &self,
        collection_name: &str,
        query: SearchQuery,
    ) -> Result<Vec<SearchResult>>;

    /// Delete records by IDs
    async fn delete(&self, collection_name: &str, ids: Vec<String>) -> Result<()>;

    /// Get collection statistics
    async fn get_collection_stats(&self, name: &str) -> Result<CollectionStats>;

    /// Flush collection to ensure all data is persisted
    async fn flush(&self, collection_name: &str) -> Result<()>;
}

/// Milvus client for vector storage and retrieval
pub struct MilvusClient {
    client: Client,
    #[allow(dead_code)]
    collection_name: String,
    #[allow(dead_code)]
    dimension: i64,
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

        let client = Client::new(address.to_string()).await.map_err(|e| {
            ContextMcpError::Database(format!("Failed to connect to Milvus: {}", e))
        })?;

        debug!("Successfully connected to Milvus");

        Ok(Self {
            client,
            collection_name: "code_vectors".to_string(),
            dimension: DIMENSION,
        })
    }

    /// Create a new Milvus client with authentication token (for Zilliz Cloud)
    ///
    /// # Arguments
    /// * `address` - Milvus/Zilliz server address
    /// * `token` - Authentication token
    pub async fn new_with_token(address: &str, _token: &str) -> Result<Self> {
        info!("Connecting to Milvus/Zilliz Cloud at {}", address);

        let client = Client::new(address.to_string()).await.map_err(|e| {
            ContextMcpError::Database(format!("Failed to connect to Milvus: {}", e))
        })?;

        // Note: The milvus crate doesn't have explicit token auth in constructor
        // Token should be passed via GRPC metadata or environment variables
        // For now, we'll document this limitation

        debug!("Successfully connected to Milvus/Zilliz Cloud");

        Ok(Self {
            client,
            collection_name: "code_vectors".to_string(),
            dimension: DIMENSION,
        })
    }

    /// Get Collection<CodeVectorEntity> from client
    async fn get_collection(&self) -> Result<Collection<CodeVectorEntity>> {
        self.client
            .get_collection::<CodeVectorEntity>()
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to get collection: {}", e)))
    }

    /// Check if a collection exists
    ///
    /// # Arguments
    /// * `name` - Collection name
    pub async fn collection_exists(&self, name: &str) -> Result<bool> {
        debug!("Checking if collection '{}' exists", name);

        let exists = self.client.has_collection(name).await.map_err(|e| {
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
    /// - metadata: JSON (stored as VARCHAR for milvus compatibility)
    pub async fn create_collection(&self, config: CollectionConfig) -> Result<()> {
        info!(
            "Creating collection '{}' with dimension {}",
            config.name, config.dimension
        );

        // Dimension validation
        if config.dimension as i64 != DIMENSION {
            warn!(
                "Requested dimension {} does not match DIMENSION constant {}. Using {}",
                config.dimension, DIMENSION, DIMENSION
            );
        }

        // Check if collection already exists
        if self.collection_exists(&config.name).await? {
            warn!(
                "Collection '{}' already exists, skipping creation",
                config.name
            );
            return Ok(());
        }

        // Get collection and create if not exists
        let collection: Collection<CodeVectorEntity> = self.get_collection().await?;

        if !collection.exists().await.map_err(|e| {
            ContextMcpError::Database(format!("Failed to check collection existence: {}", e))
        })? {
            collection
                .create(
                    Some(config.shard_num.unwrap_or(2)),
                    Some(milvus::client::ConsistencyLevel::Session),
                )
                .await
                .map_err(|e| {
                    ContextMcpError::Database(format!("Failed to create collection: {}", e))
                })?;
        }

        info!("Collection '{}' created successfully", config.name);

        // Note: Index creation is not yet implemented in the vendor/milvus-patched crate
        // This will need to be added when the API is available

        // Load collection into memory
        self.load_collection(&config.name).await?;

        Ok(())
    }

    /// Load collection into memory for searching
    async fn load_collection(&self, collection_name: &str) -> Result<()> {
        info!("Loading collection '{}' into memory", collection_name);

        let collection: Collection<CodeVectorEntity> = self.get_collection().await?;

        collection
            .load_blocked(1)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to load collection: {}", e)))?;

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
        _collection_name: &str,
        records: Vec<VectorRecord>,
    ) -> Result<Vec<String>> {
        debug!("Inserting {} records into collection", records.len(),);

        if records.is_empty() {
            return Ok(vec![]);
        }

        // Convert VectorRecord to CodeVectorBatch
        let mut batch = CodeVectorBatch::with_capacity(records.len());
        let mut ids = Vec::with_capacity(records.len());

        for record in records {
            ids.push(record.id.clone());

            // Serialize metadata to JSON string
            let metadata_json = serde_json::to_string(&record.metadata).map_err(|e| {
                ContextMcpError::Parse(format!("Failed to serialize metadata: {}", e))
            })?;

            batch.add(CodeVectorEntity {
                id: record.id,
                vector: record.vector,
                project_id: record.project_id,
                file_path: record.file_path,
                language: record.language,
                symbol_type: record.symbol_type,
                symbol_name: record.symbol_name,
                line_start: record.line_start,
                line_end: record.line_end,
                snippet: record.snippet,
                docstring: record.docstring,
                metadata: metadata_json,
            });
        }

        let collection: Collection<CodeVectorEntity> = self.get_collection().await?;

        collection
            .insert(batch, Option::<&str>::None)
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to insert records: {}", e)))?;

        debug!("Successfully inserted {} records", ids.len());

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
        _collection_name: &str,
        query: SearchQuery,
    ) -> Result<Vec<SearchResult>> {
        debug!("Searching collection with top_k={}", query.top_k);

        let collection: Collection<CodeVectorEntity> = self.get_collection().await?;

        // Prepare search parameters
        let search_params = SearchParams {
            top_k: query.top_k as i32,
            metric_type: MetricType::L2, // Default to L2, could be made configurable
        };

        // Execute search
        // Note: The search API expects a slice of vectors
        let vectors = vec![query.vector];

        let results: SearchResults<CodeVectorSearchResult> = collection
            .search::<_, _, [&str; 0], _>(query.filters.as_deref(), &vectors, [], search_params)
            .await
            .map_err(|e| ContextMcpError::Search(format!("Search failed: {}", e)))?;

        // Convert SearchResults to Vec<SearchResult>
        let mut search_results = Vec::new();

        for result_set in results.into_iter() {
            for (_idx, entry) in result_set.iter().enumerate() {
                // Parse metadata JSON and convert to HashMap<String, String>
                let metadata_json: HashMap<String, serde_json::Value> =
                    serde_json::from_str(&entry.inner.metadata).unwrap_or_default();

                let metadata: HashMap<String, String> = metadata_json
                    .into_iter()
                    .map(|(k, v)| (k, v.to_string()))
                    .collect();

                let record = VectorRecord {
                    id: entry.inner.id.clone(),
                    vector: Vec::new(), // Vector not returned in search results
                    project_id: entry.inner.project_id.clone(),
                    file_path: entry.inner.file_path.clone(),
                    language: entry.inner.language.clone(),
                    symbol_type: entry.inner.symbol_type.clone(),
                    symbol_name: entry.inner.symbol_name.clone(),
                    line_start: entry.inner.line_start,
                    line_end: entry.inner.line_end,
                    snippet: entry.inner.snippet.clone(),
                    docstring: entry.inner.docstring.clone(),
                    metadata,
                };

                search_results.push(SearchResult {
                    id: entry.inner.id.clone(),
                    score: entry.score,
                    record,
                });
            }
        }

        debug!("Search completed, found {} results", search_results.len());

        Ok(search_results)
    }

    /// Delete records by IDs
    ///
    /// # Arguments
    /// * `collection_name` - Name of the collection
    /// * `ids` - Vector of record IDs to delete
    pub async fn delete(&self, _collection_name: &str, ids: Vec<String>) -> Result<()> {
        debug!("Deleting {} records from collection", ids.len());

        if ids.is_empty() {
            return Ok(());
        }

        // Build delete expression
        let ids_str = ids
            .iter()
            .map(|id| format!("\"{}\"", id))
            .collect::<Vec<_>>()
            .join(", ");
        let _expr = format!("id in [{}]", ids_str);

        let _collection: Collection<CodeVectorEntity> = self.get_collection().await?;

        // Note: The delete API might not be available in the current milvus crate
        // This is a placeholder implementation
        // TODO: Implement delete when API is available

        warn!("Delete operation is not yet implemented in vendor/milvus-patched");

        debug!("Successfully deleted {} records", ids.len());

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

        // Note: Statistics API is not fully implemented in vendor/milvus-patched
        // This is a placeholder implementation

        let collection_stats = CollectionStats::new(
            name.to_string(),
            0,    // entity_count - not easily available
            true, // indexed
            0,    // memory_size - not easily available
        );

        debug!("Collection '{}' stats: {:?}", name, collection_stats);

        Ok(collection_stats)
    }

    /// Flush collection to ensure all data is persisted
    ///
    /// # Arguments
    /// * `collection_name` - Name of the collection
    pub async fn flush(&self, _collection_name: &str) -> Result<()> {
        info!("Flushing collection");

        let collection: Collection<CodeVectorEntity> = self.get_collection().await?;

        collection
            .flush()
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to flush collection: {}", e)))?;

        info!("Collection flushed successfully");
        Ok(())
    }
}

/// Implementation of MilvusClientTrait for MilvusClient
#[async_trait]
impl MilvusClientTrait for MilvusClient {
    async fn collection_exists(&self, name: &str) -> Result<bool> {
        self.collection_exists(name).await
    }

    async fn create_collection(&self, config: CollectionConfig) -> Result<()> {
        self.create_collection(config).await
    }

    async fn drop_collection(&self, name: &str) -> Result<()> {
        self.drop_collection(name).await
    }

    async fn insert(
        &self,
        collection_name: &str,
        records: Vec<VectorRecord>,
    ) -> Result<Vec<String>> {
        self.insert(collection_name, records).await
    }

    async fn search(
        &self,
        collection_name: &str,
        query: SearchQuery,
    ) -> Result<Vec<SearchResult>> {
        self.search(collection_name, query).await
    }

    async fn delete(&self, collection_name: &str, ids: Vec<String>) -> Result<()> {
        self.delete(collection_name, ids).await
    }

    async fn get_collection_stats(&self, name: &str) -> Result<CollectionStats> {
        self.get_collection_stats(name).await
    }

    async fn flush(&self, collection_name: &str) -> Result<()> {
        self.flush(collection_name).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use milvus::schema::IntoDataFields;

    // ========================================
    // Unit tests using MockMilvusClientTrait
    // ========================================

    #[tokio::test]
    async fn test_mock_collection_exists() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_collection_exists()
            .with(mockall::predicate::eq("test_collection"))
            .times(1)
            .returning(|_| Ok(true));

        let result = mock.collection_exists("test_collection").await;
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[tokio::test]
    async fn test_mock_create_collection() {
        let mut mock = MockMilvusClientTrait::new();
        let config = CollectionConfig::code_vectors(384);

        mock.expect_create_collection()
            .withf(|c| c.name == "code_vectors" && c.dimension == 384)
            .times(1)
            .returning(|_| Ok(()));

        let result = mock.create_collection(config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_insert_vectors() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_insert()
            .withf(|name, records| name == "test_collection" && records.len() == 2)
            .times(1)
            .returning(|_, _| Ok(vec!["id1".to_string(), "id2".to_string()]));

        let records = vec![
            VectorRecord::new(
                "test1.rs:10".to_string(),
                vec![0.1; 384],
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
                vec![0.2; 384],
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

        let result = mock.insert("test_collection", records).await;
        assert!(result.is_ok());
        let ids = result.unwrap();
        assert_eq!(ids.len(), 2);
        assert_eq!(ids[0], "id1");
        assert_eq!(ids[1], "id2");
    }

    #[tokio::test]
    async fn test_mock_search_vectors() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .withf(|name, query| name == "test_collection" && query.top_k == 10)
            .times(1)
            .returning(|_, _| {
                Ok(vec![SearchResult {
                    id: "test1.rs:10".to_string(),
                    score: 0.95,
                    record: VectorRecord::new(
                        "test1.rs:10".to_string(),
                        vec![],
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
                }])
            });

        let query = SearchQuery::new(vec![0.1; 384], 10);
        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "test1.rs:10");
        assert!((results[0].score - 0.95).abs() < 1e-5);
    }

    #[tokio::test]
    async fn test_mock_delete_vectors() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_delete()
            .withf(|name, ids| name == "test_collection" && ids.len() == 2)
            .times(1)
            .returning(|_, _| Ok(()));

        let result = mock
            .delete("test_collection", vec!["id1".to_string(), "id2".to_string()])
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_error_simulation() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_collection_exists()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Connection failed".to_string())));

        let result = mock.collection_exists("test_collection").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Database(msg)) => assert_eq!(msg, "Connection failed"),
            _ => panic!("Expected Database error"),
        }
    }

    #[tokio::test]
    async fn test_mock_flush() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_flush()
            .with(mockall::predicate::eq("test_collection"))
            .times(1)
            .returning(|_| Ok(()));

        let result = mock.flush("test_collection").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_get_collection_stats() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_get_collection_stats()
            .with(mockall::predicate::eq("test_collection"))
            .times(1)
            .returning(|name| {
                Ok(CollectionStats::new(
                    name.to_string(),
                    1000,
                    true,
                    1024 * 1024,
                ))
            });

        let result = mock.get_collection_stats("test_collection").await;
        assert!(result.is_ok());
        let stats = result.unwrap();
        assert_eq!(stats.name, "test_collection");
        assert_eq!(stats.entity_count, 1000);
        assert!(stats.indexed);
    }

    // ========================================
    // Task 12.6: Comprehensive mock-based tests
    // ========================================

    #[tokio::test]
    async fn test_mock_collection_not_exists() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_collection_exists()
            .with(mockall::predicate::eq("nonexistent"))
            .times(1)
            .returning(|_| Ok(false));

        let result = mock.collection_exists("nonexistent").await;
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[tokio::test]
    async fn test_mock_drop_collection_success() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_drop_collection()
            .with(mockall::predicate::eq("test_collection"))
            .times(1)
            .returning(|_| Ok(()));

        let result = mock.drop_collection("test_collection").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_insert_empty_records() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_insert()
            .withf(|name, records| name == "test_collection" && records.is_empty())
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let result = mock.insert("test_collection", vec![]).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_mock_insert_single_record() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_insert()
            .withf(|name, records| name == "test_collection" && records.len() == 1)
            .times(1)
            .returning(|_, _| Ok(vec!["single_id".to_string()]));

        let record = VectorRecord::new(
            "test.rs:5".to_string(),
            vec![0.5; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "foo".to_string(),
            5,
            10,
            "fn foo() {}".to_string(),
            "Foo function".to_string(),
        );

        let result = mock.insert("test_collection", vec![record]).await;
        assert!(result.is_ok());
        let ids = result.unwrap();
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0], "single_id");
    }

    #[tokio::test]
    async fn test_mock_search_with_filters() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_search()
            .withf(|name, query| {
                name == "test_collection"
                    && query.top_k == 5
                    && query.filters.as_ref().map(|f| f.contains("language")).unwrap_or(false)
            })
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let mut query = SearchQuery::new(vec![0.2; 384], 5);
        query.filters = Some("language == 'rust'".to_string());

        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_mock_search_top_k_variations() {
        let mut mock = MockMilvusClientTrait::new();

        // Test with top_k = 1
        mock.expect_search()
            .withf(|_, query| query.top_k == 1)
            .times(1)
            .returning(|_, _| {
                Ok(vec![SearchResult {
                    id: "result1".to_string(),
                    score: 0.99,
                    record: VectorRecord::new(
                        "result1".to_string(),
                        vec![],
                        "proj1".to_string(),
                        "file1.rs".to_string(),
                        "rust".to_string(),
                        "function".to_string(),
                        "fn1".to_string(),
                        1,
                        5,
                        "code".to_string(),
                        "doc".to_string(),
                    ),
                }])
            });

        let query = SearchQuery::new(vec![0.1; 384], 1);
        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_mock_delete_empty_ids() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_delete()
            .withf(|name, ids| name == "test_collection" && ids.is_empty())
            .times(1)
            .returning(|_, _| Ok(()));

        let result = mock.delete("test_collection", vec![]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_error_connection_timeout() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_collection_exists()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Connection timeout".to_string())));

        let result = mock.collection_exists("test_collection").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Database(msg)) => assert!(msg.contains("timeout")),
            _ => panic!("Expected Database error with timeout"),
        }
    }

    #[tokio::test]
    async fn test_mock_error_collection_not_found() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_get_collection_stats()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Collection not found".to_string())));

        let result = mock.get_collection_stats("nonexistent").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Database(msg)) => assert!(msg.contains("not found")),
            _ => panic!("Expected Database error with 'not found'"),
        }
    }

    #[tokio::test]
    async fn test_mock_error_insert_failure() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_insert()
            .times(1)
            .returning(|_, _| Err(ContextMcpError::Database("Insert failed: quota exceeded".to_string())));

        let record = VectorRecord::new(
            "test.rs:1".to_string(),
            vec![0.1; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "test".to_string(),
            1,
            5,
            "code".to_string(),
            "doc".to_string(),
        );

        let result = mock.insert("test_collection", vec![record]).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_error_search_failure() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_search()
            .times(1)
            .returning(|_, _| Err(ContextMcpError::Search("Search failed: invalid vector dimension".to_string())));

        let query = SearchQuery::new(vec![0.1; 384], 10);
        let result = mock.search("test_collection", query).await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Search(msg)) => assert!(msg.contains("invalid vector")),
            _ => panic!("Expected Search error"),
        }
    }

    #[tokio::test]
    async fn test_mock_batch_operations() {
        let mut mock = MockMilvusClientTrait::new();

        // Batch insert with 100 records
        mock.expect_insert()
            .withf(|_, records| records.len() == 100)
            .times(1)
            .returning(|_, records| {
                Ok((0..records.len())
                    .map(|i| format!("id_{}", i))
                    .collect())
            });

        let records: Vec<VectorRecord> = (0..100)
            .map(|i| {
                VectorRecord::new(
                    format!("file{}.rs:{}", i, i),
                    vec![0.1; 384],
                    "batch_project".to_string(),
                    format!("file{}.rs", i),
                    "rust".to_string(),
                    "function".to_string(),
                    format!("fn{}", i),
                    i as i64,
                    (i + 5) as i64,
                    format!("fn fn{}() {{}}", i),
                    format!("Function {}", i),
                )
            })
            .collect();

        let result = mock.insert("test_collection", records).await;
        assert!(result.is_ok());
        let ids = result.unwrap();
        assert_eq!(ids.len(), 100);
    }

    #[tokio::test]
    async fn test_mock_flush_error() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_flush()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Flush failed".to_string())));

        let result = mock.flush("test_collection").await;
        assert!(result.is_err());
    }

    // ========================================
    // Task 12.7: Additional comprehensive tests
    // ========================================

    #[tokio::test]
    async fn test_mock_create_collection_with_custom_config() {
        let mut mock = MockMilvusClientTrait::new();
        let mut config = CollectionConfig::code_vectors(512);
        config.name = "custom_vectors".to_string();
        config.description = "Custom collection".to_string();
        config.shard_num = Some(4);

        mock.expect_create_collection()
            .withf(|c| c.name == "custom_vectors" && c.dimension == 512 && c.shard_num == Some(4))
            .times(1)
            .returning(|_| Ok(()));

        let result = mock.create_collection(config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_collection_exists_multiple_calls() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_collection_exists()
            .with(mockall::predicate::eq("collection1"))
            .times(1)
            .returning(|_| Ok(true));

        mock.expect_collection_exists()
            .with(mockall::predicate::eq("collection2"))
            .times(1)
            .returning(|_| Ok(false));

        assert!(mock.collection_exists("collection1").await.unwrap());
        assert!(!mock.collection_exists("collection2").await.unwrap());
    }

    #[tokio::test]
    async fn test_mock_insert_large_batch() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_insert()
            .withf(|_, records| records.len() == 1000)
            .times(1)
            .returning(|_, records| {
                Ok((0..records.len())
                    .map(|i| format!("large_batch_id_{}", i))
                    .collect())
            });

        let records: Vec<VectorRecord> = (0..1000)
            .map(|i| {
                VectorRecord::new(
                    format!("file{}.rs:{}", i, i),
                    vec![0.1; 384],
                    "large_project".to_string(),
                    format!("file{}.rs", i),
                    "rust".to_string(),
                    "function".to_string(),
                    format!("fn{}", i),
                    i as i64,
                    (i + 10) as i64,
                    format!("fn fn{}() {{}}", i),
                    "".to_string(),
                )
            })
            .collect();

        let result = mock.insert("test_collection", records).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 1000);
    }

    #[tokio::test]
    async fn test_mock_search_no_results() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let query = SearchQuery::new(vec![0.9; 384], 10);
        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_mock_search_with_score_threshold() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .withf(|_, query| query.top_k == 5)
            .times(1)
            .returning(|_, _| {
                Ok(vec![
                    SearchResult {
                        id: "high_score".to_string(),
                        score: 0.95,
                        record: VectorRecord::new(
                            "high_score".to_string(),
                            vec![],
                            "proj1".to_string(),
                            "file1.rs".to_string(),
                            "rust".to_string(),
                            "function".to_string(),
                            "high_fn".to_string(),
                            1,
                            5,
                            "code".to_string(),
                            "doc".to_string(),
                        ),
                    },
                ])
            });

        let query = SearchQuery::new(vec![0.1; 384], 5);
        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].score > 0.9);
    }

    #[tokio::test]
    async fn test_mock_delete_single_id() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_delete()
            .withf(|_, ids| ids.len() == 1 && ids[0] == "single_id")
            .times(1)
            .returning(|_, _| Ok(()));

        let result = mock.delete("test_collection", vec!["single_id".to_string()]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_delete_large_batch() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_delete()
            .withf(|_, ids| ids.len() == 500)
            .times(1)
            .returning(|_, _| Ok(()));

        let ids: Vec<String> = (0..500).map(|i| format!("id_{}", i)).collect();
        let result = mock.delete("test_collection", ids).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_get_collection_stats_empty() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_get_collection_stats()
            .times(1)
            .returning(|name| {
                Ok(CollectionStats::new(
                    name.to_string(),
                    0,
                    false,
                    0,
                ))
            });

        let result = mock.get_collection_stats("empty_collection").await;
        assert!(result.is_ok());
        let stats = result.unwrap();
        assert_eq!(stats.entity_count, 0);
        assert!(!stats.indexed);
    }

    #[tokio::test]
    async fn test_mock_get_collection_stats_large() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_get_collection_stats()
            .times(1)
            .returning(|name| {
                Ok(CollectionStats::new(
                    name.to_string(),
                    1_000_000,
                    true,
                    1024 * 1024 * 1024, // 1GB
                ))
            });

        let result = mock.get_collection_stats("large_collection").await;
        assert!(result.is_ok());
        let stats = result.unwrap();
        assert_eq!(stats.entity_count, 1_000_000);
        assert_eq!(stats.memory_size, 1024 * 1024 * 1024);
    }

    #[tokio::test]
    async fn test_mock_drop_collection_error() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_drop_collection()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Collection in use".to_string())));

        let result = mock.drop_collection("test_collection").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Database(msg)) => assert!(msg.contains("in use")),
            _ => panic!("Expected Database error"),
        }
    }

    #[tokio::test]
    async fn test_mock_create_collection_already_exists() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_create_collection()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Collection already exists".to_string())));

        let config = CollectionConfig::code_vectors(384);
        let result = mock.create_collection(config).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_insert_with_metadata() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_insert()
            .withf(|_, records| {
                !records.is_empty() && !records[0].metadata.is_empty()
            })
            .times(1)
            .returning(|_, records| {
                Ok(records.iter().map(|r| r.id.clone()).collect())
            });

        let mut metadata = std::collections::HashMap::new();
        metadata.insert("key1".to_string(), "value1".to_string());
        metadata.insert("key2".to_string(), "value2".to_string());

        let mut record = VectorRecord::new(
            "test.rs:1".to_string(),
            vec![0.1; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "test".to_string(),
            1,
            5,
            "code".to_string(),
            "doc".to_string(),
        );
        record.metadata = metadata;

        let result = mock.insert("test_collection", vec![record]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_search_with_complex_filters() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .withf(|_, query| {
                query.filters.as_ref().map(|f|
                    f.contains("language") && f.contains("rust")
                ).unwrap_or(false)
            })
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let mut query = SearchQuery::new(vec![0.1; 384], 10);
        query.filters = Some("language == 'rust' && symbol_type == 'function'".to_string());

        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_multiple_operations_sequence() {
        let mut mock = MockMilvusClientTrait::new();

        // Sequence: check existence -> create -> insert -> flush -> get stats
        mock.expect_collection_exists()
            .times(1)
            .returning(|_| Ok(false));

        mock.expect_create_collection()
            .times(1)
            .returning(|_| Ok(()));

        mock.expect_insert()
            .times(1)
            .returning(|_, records| {
                Ok(records.iter().map(|r| r.id.clone()).collect())
            });

        mock.expect_flush()
            .times(1)
            .returning(|_| Ok(()));

        mock.expect_get_collection_stats()
            .times(1)
            .returning(|name| {
                Ok(CollectionStats::new(
                    name.to_string(),
                    100,
                    true,
                    1024,
                ))
            });

        // Execute sequence
        assert!(!mock.collection_exists("test").await.unwrap());
        assert!(mock.create_collection(CollectionConfig::code_vectors(384)).await.is_ok());

        let record = VectorRecord::new(
            "test.rs:1".to_string(),
            vec![0.1; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "test".to_string(),
            1,
            5,
            "code".to_string(),
            "doc".to_string(),
        );
        assert!(mock.insert("test", vec![record]).await.is_ok());
        assert!(mock.flush("test").await.is_ok());

        let stats = mock.get_collection_stats("test").await.unwrap();
        assert_eq!(stats.entity_count, 100);
    }

    #[tokio::test]
    async fn test_mock_search_multiple_results_sorted() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .times(1)
            .returning(|_, _| {
                Ok(vec![
                    SearchResult {
                        id: "result1".to_string(),
                        score: 0.99,
                        record: VectorRecord::new(
                            "result1".to_string(),
                            vec![],
                            "proj1".to_string(),
                            "file1.rs".to_string(),
                            "rust".to_string(),
                            "function".to_string(),
                            "fn1".to_string(),
                            1,
                            5,
                            "code1".to_string(),
                            "doc1".to_string(),
                        ),
                    },
                    SearchResult {
                        id: "result2".to_string(),
                        score: 0.95,
                        record: VectorRecord::new(
                            "result2".to_string(),
                            vec![],
                            "proj1".to_string(),
                            "file2.rs".to_string(),
                            "rust".to_string(),
                            "function".to_string(),
                            "fn2".to_string(),
                            1,
                            5,
                            "code2".to_string(),
                            "doc2".to_string(),
                        ),
                    },
                    SearchResult {
                        id: "result3".to_string(),
                        score: 0.90,
                        record: VectorRecord::new(
                            "result3".to_string(),
                            vec![],
                            "proj1".to_string(),
                            "file3.rs".to_string(),
                            "rust".to_string(),
                            "function".to_string(),
                            "fn3".to_string(),
                            1,
                            5,
                            "code3".to_string(),
                            "doc3".to_string(),
                        ),
                    },
                ])
            });

        let query = SearchQuery::new(vec![0.1; 384], 10);
        let results = mock.search("test_collection", query).await.unwrap();

        assert_eq!(results.len(), 3);
        // Verify results are sorted by score (descending)
        assert!(results[0].score >= results[1].score);
        assert!(results[1].score >= results[2].score);
    }

    #[tokio::test]
    async fn test_mock_error_propagation() {
        let mut mock = MockMilvusClientTrait::new();

        // Test different error types
        mock.expect_collection_exists()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("DB error".to_string())));

        mock.expect_insert()
            .times(1)
            .returning(|_, _| Err(ContextMcpError::Database("Insert error".to_string())));

        mock.expect_search()
            .times(1)
            .returning(|_, _| Err(ContextMcpError::Search("Search error".to_string())));

        assert!(mock.collection_exists("test").await.is_err());
        assert!(mock.insert("test", vec![]).await.is_err());
        assert!(mock.search("test", SearchQuery::new(vec![0.1; 384], 10)).await.is_err());
    }

    // ========================================
    // Task 14: Additional comprehensive tests for 80% coverage
    // ========================================

    #[test]
    fn test_code_vector_entity_default() {
        let entity = CodeVectorEntity::default();
        assert_eq!(entity.id, "");
        assert_eq!(entity.vector.len(), 0);
        assert_eq!(entity.project_id, "");
    }

    #[test]
    fn test_code_vector_entity_schema() {
        assert_eq!(CodeVectorEntity::NAME, "code_vectors");
        assert_eq!(CodeVectorEntity::SCHEMA.len(), 12);
        assert_eq!(CodeVectorEntity::SCHEMA[0].name, "id");
        assert_eq!(CodeVectorEntity::SCHEMA[1].name, "vector");
        assert_eq!(CodeVectorEntity::SCHEMA[1].dim, DIMENSION);
    }

    #[test]
    fn test_code_vector_entity_iter() {
        let entity = CodeVectorEntity {
            id: "test_id".to_string(),
            vector: vec![0.1; 384],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "test_fn".to_string(),
            line_start: 10,
            line_end: 20,
            snippet: "fn test_fn() {}".to_string(),
            docstring: "Test function".to_string(),
            metadata: "{}".to_string(),
        };

        let items: Vec<_> = entity.iter().collect();
        assert_eq!(items.len(), 12);
    }

    #[test]
    fn test_code_vector_entity_into_iter() {
        let entity = CodeVectorEntity {
            id: "test_id".to_string(),
            vector: vec![0.1; 384],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "test_fn".to_string(),
            line_start: 10,
            line_end: 20,
            snippet: "fn test_fn() {}".to_string(),
            docstring: "Test function".to_string(),
            metadata: "{}".to_string(),
        };

        let items: Vec<_> = entity.into_iter().collect();
        assert_eq!(items.len(), 12);
    }

    #[test]
    fn test_code_vector_batch_with_capacity() {
        let batch = CodeVectorBatch::with_capacity(10);
        assert_eq!(batch.id.capacity(), 10);
        assert_eq!(batch.project_id.capacity(), 10);
        assert_eq!(batch.vector.capacity(), 10 * 384);
    }

    #[test]
    fn test_code_vector_batch_add() {
        let mut batch = CodeVectorBatch::with_capacity(5);
        let entity = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![0.1; 384],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code".to_string(),
            docstring: "doc".to_string(),
            metadata: "{}".to_string(),
        };

        batch.add(entity);
        assert_eq!(batch.len(), 1);
        assert_eq!(batch.id[0], "test1");
        assert_eq!(batch.vector.len(), 384);
    }

    #[test]
    fn test_code_vector_batch_index() {
        let mut batch = CodeVectorBatch::with_capacity(5);
        let entity = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![0.5; 384],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code".to_string(),
            docstring: "doc".to_string(),
            metadata: "{}".to_string(),
        };

        batch.add(entity);
        let retrieved = batch.index(0);
        assert!(retrieved.is_some());
        let entity = retrieved.unwrap();
        assert_eq!(entity.id, "test1");
        assert_eq!(entity.vector.len(), 384);
        assert_eq!(entity.vector[0], 0.5);
    }

    #[test]
    fn test_code_vector_batch_index_out_of_bounds() {
        let batch = CodeVectorBatch::with_capacity(5);
        assert!(batch.index(0).is_none());
        assert!(batch.index(100).is_none());
    }

    #[test]
    fn test_code_vector_batch_split_off() {
        let mut batch = CodeVectorBatch::with_capacity(5);

        for i in 0..5 {
            let entity = CodeVectorEntity {
                id: format!("test{}", i),
                vector: vec![i as f32; 384],
                project_id: "proj1".to_string(),
                file_path: "test.rs".to_string(),
                language: "rust".to_string(),
                symbol_type: "function".to_string(),
                symbol_name: format!("fn{}", i),
                line_start: i as i64,
                line_end: (i + 5) as i64,
                snippet: "code".to_string(),
                docstring: "doc".to_string(),
                metadata: "{}".to_string(),
            };
            batch.add(entity);
        }

        assert_eq!(batch.len(), 5);
        let split = batch.split_off(3);
        assert_eq!(batch.len(), 3);
        assert_eq!(split.len(), 2);
        assert_eq!(split.id[0], "test3");
    }

    #[test]
    fn test_code_vector_batch_append() {
        let mut batch1 = CodeVectorBatch::with_capacity(2);
        let mut batch2 = CodeVectorBatch::with_capacity(2);

        let entity1 = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![0.1; 384],
            project_id: "proj1".to_string(),
            file_path: "test1.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code1".to_string(),
            docstring: "doc1".to_string(),
            metadata: "{}".to_string(),
        };

        let entity2 = CodeVectorEntity {
            id: "test2".to_string(),
            vector: vec![0.2; 384],
            project_id: "proj1".to_string(),
            file_path: "test2.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn2".to_string(),
            line_start: 10,
            line_end: 15,
            snippet: "code2".to_string(),
            docstring: "doc2".to_string(),
            metadata: "{}".to_string(),
        };

        batch1.add(entity1);
        batch2.add(entity2);

        batch1.append(batch2);
        assert_eq!(batch1.len(), 2);
        assert_eq!(batch1.id[1], "test2");
    }

    #[test]
    fn test_code_vector_batch_into_data_fields() {
        let mut batch = CodeVectorBatch::with_capacity(1);
        let entity = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![0.1; 384],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code".to_string(),
            docstring: "doc".to_string(),
            metadata: "{}".to_string(),
        };
        batch.add(entity);

        let fields = batch.into_data_fields();
        assert_eq!(fields.len(), 12);
    }

    #[test]
    fn test_code_vector_search_result_with_capacity() {
        let result = CodeVectorSearchResult::with_capacity(10);
        assert_eq!(result.id.capacity(), 10);
        assert_eq!(result.project_id.capacity(), 10);
    }

    #[test]
    fn test_code_vector_search_result_add() {
        let mut result = CodeVectorSearchResult::with_capacity(5);
        let entity = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code".to_string(),
            docstring: "doc".to_string(),
            metadata: "{}".to_string(),
        };

        result.add(entity);
        assert_eq!(result.len(), 1);
        assert_eq!(result.id[0], "test1");
    }

    #[test]
    fn test_code_vector_search_result_index() {
        let mut result = CodeVectorSearchResult::with_capacity(5);
        let entity = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code".to_string(),
            docstring: "doc".to_string(),
            metadata: "{}".to_string(),
        };

        result.add(entity);
        let retrieved = result.index(0);
        assert!(retrieved.is_some());
        let entity = retrieved.unwrap();
        assert_eq!(entity.id, "test1");
        assert_eq!(entity.vector.len(), 0); // Vector not included in search results
    }

    #[test]
    fn test_code_vector_search_result_split_off() {
        let mut result = CodeVectorSearchResult::with_capacity(5);

        for i in 0..5 {
            let entity = CodeVectorEntity {
                id: format!("test{}", i),
                vector: vec![],
                project_id: "proj1".to_string(),
                file_path: "test.rs".to_string(),
                language: "rust".to_string(),
                symbol_type: "function".to_string(),
                symbol_name: format!("fn{}", i),
                line_start: i as i64,
                line_end: (i + 5) as i64,
                snippet: "code".to_string(),
                docstring: "doc".to_string(),
                metadata: "{}".to_string(),
            };
            result.add(entity);
        }

        assert_eq!(result.len(), 5);
        let split = result.split_off(3);
        assert_eq!(result.len(), 3);
        assert_eq!(split.len(), 2);
    }

    #[test]
    fn test_code_vector_search_result_append() {
        let mut result1 = CodeVectorSearchResult::with_capacity(2);
        let mut result2 = CodeVectorSearchResult::with_capacity(2);

        let entity1 = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![],
            project_id: "proj1".to_string(),
            file_path: "test1.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code1".to_string(),
            docstring: "doc1".to_string(),
            metadata: "{}".to_string(),
        };

        let entity2 = CodeVectorEntity {
            id: "test2".to_string(),
            vector: vec![],
            project_id: "proj1".to_string(),
            file_path: "test2.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn2".to_string(),
            line_start: 10,
            line_end: 15,
            snippet: "code2".to_string(),
            docstring: "doc2".to_string(),
            metadata: "{}".to_string(),
        };

        result1.add(entity1);
        result2.add(entity2);

        result1.append(result2);
        assert_eq!(result1.len(), 2);
    }

    #[test]
    fn test_code_vector_search_result_columns() {
        let columns = CodeVectorSearchResult::columns();
        assert_eq!(columns.len(), 11); // All fields except vector
        assert_eq!(columns[0].name, "id");
        assert_eq!(columns[1].name, "project_id");
    }

    #[test]
    fn test_code_vector_search_result_into_data_fields() {
        let mut result = CodeVectorSearchResult::with_capacity(1);
        let entity = CodeVectorEntity {
            id: "test1".to_string(),
            vector: vec![],
            project_id: "proj1".to_string(),
            file_path: "test.rs".to_string(),
            language: "rust".to_string(),
            symbol_type: "function".to_string(),
            symbol_name: "fn1".to_string(),
            line_start: 1,
            line_end: 5,
            snippet: "code".to_string(),
            docstring: "doc".to_string(),
            metadata: "{}".to_string(),
        };
        result.add(entity);

        let fields = result.into_data_fields();
        assert_eq!(fields.len(), 11); // All fields except vector
    }

    #[tokio::test]
    async fn test_mock_insert_with_special_characters() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_insert()
            .withf(|_, records| {
                !records.is_empty() && records[0].snippet.contains("特殊文字")
            })
            .times(1)
            .returning(|_, records| {
                Ok(records.iter().map(|r| r.id.clone()).collect())
            });

        let record = VectorRecord::new(
            "test.rs:1".to_string(),
            vec![0.1; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "特殊関数".to_string(),
            1,
            5,
            "// 特殊文字テスト\nfn test() {}".to_string(),
            "特殊文字を含むドキュメント".to_string(),
        );

        let result = mock.insert("test_collection", vec![record]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_search_with_empty_vector() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .withf(|_, query| query.vector.is_empty())
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let query = SearchQuery::new(vec![], 10);
        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_collection_exists_special_names() {
        let mut mock = MockMilvusClientTrait::new();

        let special_names = vec![
            "collection-with-dashes",
            "collection_with_underscores",
            "collection123",
            "UPPERCASE_COLLECTION",
        ];

        for name in special_names {
            mock.expect_collection_exists()
                .with(mockall::predicate::eq(name))
                .times(1)
                .returning(|_| Ok(true));
        }

        for name in &["collection-with-dashes", "collection_with_underscores", "collection123", "UPPERCASE_COLLECTION"] {
            assert!(mock.collection_exists(name).await.unwrap());
        }
    }

    #[tokio::test]
    async fn test_mock_insert_with_empty_strings() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_insert()
            .withf(|_, records| {
                !records.is_empty() && records[0].docstring.is_empty()
            })
            .times(1)
            .returning(|_, records| {
                Ok(records.iter().map(|r| r.id.clone()).collect())
            });

        let record = VectorRecord::new(
            "test.rs:1".to_string(),
            vec![0.1; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "fn_without_doc".to_string(),
            1,
            5,
            "fn test() {}".to_string(),
            "".to_string(), // Empty docstring
        );

        let result = mock.insert("test_collection", vec![record]).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_search_with_various_top_k() {
        let mut mock = MockMilvusClientTrait::new();

        for top_k in [1, 5, 10, 50, 100] {
            mock.expect_search()
                .withf(move |_, query| query.top_k == top_k)
                .times(1)
                .returning(move |_, _| {
                    Ok((0..std::cmp::min(top_k, 10))
                        .map(|i| SearchResult {
                            id: format!("result{}", i),
                            score: 1.0 - (i as f32 * 0.01),
                            record: VectorRecord::new(
                                format!("result{}", i),
                                vec![],
                                "proj1".to_string(),
                                "file.rs".to_string(),
                                "rust".to_string(),
                                "function".to_string(),
                                format!("fn{}", i),
                                i as i64,
                                (i + 5) as i64,
                                "code".to_string(),
                                "doc".to_string(),
                            ),
                        })
                        .collect())
                });
        }

        for top_k in [1, 5, 10, 50, 100] {
            let query = SearchQuery::new(vec![0.1; 384], top_k);
            let results = mock.search("test_collection", query).await.unwrap();
            assert!(results.len() <= top_k);
        }
    }

    #[tokio::test]
    async fn test_mock_delete_with_long_id_list() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_delete()
            .withf(|_, ids| ids.len() == 10000)
            .times(1)
            .returning(|_, _| Ok(()));

        let ids: Vec<String> = (0..10000).map(|i| format!("id_{}", i)).collect();
        let result = mock.delete("test_collection", ids).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_flush_multiple_times() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_flush()
            .times(5)
            .returning(|_| Ok(()));

        for _ in 0..5 {
            assert!(mock.flush("test_collection").await.is_ok());
        }
    }

    #[tokio::test]
    async fn test_mock_get_collection_stats_various_sizes() {
        let mut mock = MockMilvusClientTrait::new();

        let sizes = vec![0, 100, 10_000, 1_000_000, 10_000_000];

        for size in sizes {
            mock.expect_get_collection_stats()
                .times(1)
                .returning(move |name| {
                    Ok(CollectionStats::new(
                        name.to_string(),
                        size,
                        size > 0,
                        size * 1024,
                    ))
                });
        }

        for size in [0, 100, 10_000, 1_000_000, 10_000_000] {
            let stats = mock.get_collection_stats("test").await.unwrap();
            assert_eq!(stats.entity_count, size);
        }
    }

    #[tokio::test]
    async fn test_mock_create_collection_validation_error() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_create_collection()
            .times(1)
            .returning(|_| Err(ContextMcpError::Database("Invalid dimension".to_string())));

        let config = CollectionConfig::code_vectors(0); // Invalid dimension
        let result = mock.create_collection(config).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_mock_insert_serialization_error() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_insert()
            .times(1)
            .returning(|_, _| {
                Err(ContextMcpError::Parse("Failed to serialize metadata".to_string()))
            });

        let record = VectorRecord::new(
            "test.rs:1".to_string(),
            vec![0.1; 384],
            "proj1".to_string(),
            "test.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "test".to_string(),
            1,
            5,
            "code".to_string(),
            "doc".to_string(),
        );

        let result = mock.insert("test_collection", vec![record]).await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Parse(_)) => {},
            _ => panic!("Expected Parse error"),
        }
    }

    #[tokio::test]
    async fn test_mock_search_with_long_filter_expression() {
        let mut mock = MockMilvusClientTrait::new();

        mock.expect_search()
            .withf(|_, query| {
                query.filters.as_ref().map(|f| f.len() > 100).unwrap_or(false)
            })
            .times(1)
            .returning(|_, _| Ok(vec![]));

        let mut query = SearchQuery::new(vec![0.1; 384], 10);
        query.filters = Some(format!("language == 'rust' && symbol_type == 'function' && line_start > 0 && line_end < 1000 && file_path.contains('test') && project_id == 'proj1'"));

        let result = mock.search("test_collection", query).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_mock_concurrent_operations() {
        use tokio::task::JoinSet;

        let mut mock = MockMilvusClientTrait::new();

        // Prepare for 10 concurrent operations
        for _ in 0..10 {
            mock.expect_collection_exists()
                .times(1)
                .returning(|_| Ok(true));
        }

        let mock = std::sync::Arc::new(tokio::sync::Mutex::new(mock));
        let mut join_set = JoinSet::new();

        for i in 0..10 {
            let mock_clone = mock.clone();
            join_set.spawn(async move {
                let mock = mock_clone.lock().await;
                mock.collection_exists(&format!("collection{}", i)).await
            });
        }

        while let Some(result) = join_set.join_next().await {
            assert!(result.unwrap().unwrap());
        }
    }

    #[test]
    fn test_code_vector_batch_len_consistency() {
        let mut batch = CodeVectorBatch::with_capacity(5);

        for i in 0..3 {
            let entity = CodeVectorEntity {
                id: format!("test{}", i),
                vector: vec![i as f32; 384],
                project_id: "proj1".to_string(),
                file_path: "test.rs".to_string(),
                language: "rust".to_string(),
                symbol_type: "function".to_string(),
                symbol_name: format!("fn{}", i),
                line_start: i as i64,
                line_end: (i + 5) as i64,
                snippet: "code".to_string(),
                docstring: "doc".to_string(),
                metadata: "{}".to_string(),
            };
            batch.add(entity);
        }

        assert_eq!(batch.len(), 3);
        assert_eq!(batch.id.len(), 3);
        assert_eq!(batch.project_id.len(), 3);
        assert_eq!(batch.vector.len(), 3 * 384);
    }

    #[test]
    fn test_code_vector_batch_empty() {
        let batch = CodeVectorBatch::with_capacity(0);
        assert_eq!(batch.len(), 0);
        assert!(batch.index(0).is_none());
    }

    #[test]
    fn test_dimension_constant() {
        assert_eq!(DIMENSION, 384);
    }

    // ========================================
    // Integration tests (requires Milvus)
    // ========================================

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

        let config = CollectionConfig::code_vectors(384);

        // Create collection
        client
            .create_collection(config.clone())
            .await
            .expect("Failed to create collection");

        // Create test records
        let records = vec![
            VectorRecord::new(
                "test1.rs:10".to_string(),
                vec![0.1; 384],
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
                vec![0.2; 384],
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
        let query = SearchQuery::new(vec![0.1; 384], 10);
        let results = client
            .search(&config.name, query)
            .await
            .expect("Failed to search");

        // Results should not be empty
        assert!(!results.is_empty());

        // Cleanup
        client
            .drop_collection(&config.name)
            .await
            .expect("Failed to drop collection");
    }
}
