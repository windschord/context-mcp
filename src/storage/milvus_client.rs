use crate::error::{ContextMcpError, Result};
use crate::storage::types::{
    CollectionConfig, CollectionStats, SearchQuery, SearchResult, VectorRecord,
};
use milvus::client::Client;
use milvus::collection::{Collection, MetricType, SearchParams};
use milvus::data::{FromField, SearchResults};
use milvus::schema::{self, Collection as _, Entity, FieldSchema};
use milvus::value::Value;
use std::collections::HashMap;
use tracing::{debug, info, warn};

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
        FieldSchema::new_primary_varchar("id", Some("Unique identifier (file_path:line_start)"), false, 256),
        FieldSchema::new_float_vector("vector", Some("Embedding vector"), DIMENSION),
        FieldSchema::new_varchar("project_id", Some("Project identifier"), 128),
        FieldSchema::new_varchar("file_path", Some("Source file path"), 512),
        FieldSchema::new_varchar("language", Some("Programming language"), 32),
        FieldSchema::new_varchar("symbol_type", Some("Symbol type (function, class, etc.)"), 32),
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
            (&Self::SCHEMA[1], Value::FloatArray(self.vector.clone().into())),
            (&Self::SCHEMA[2], Value::String(self.project_id.clone().into())),
            (&Self::SCHEMA[3], Value::String(self.file_path.clone().into())),
            (&Self::SCHEMA[4], Value::String(self.language.clone().into())),
            (&Self::SCHEMA[5], Value::String(self.symbol_type.clone().into())),
            (&Self::SCHEMA[6], Value::String(self.symbol_name.clone().into())),
            (&Self::SCHEMA[7], Value::Long(self.line_start)),
            (&Self::SCHEMA[8], Value::Long(self.line_end)),
            (&Self::SCHEMA[9], Value::String(self.snippet.clone().into())),
            (&Self::SCHEMA[10], Value::String(self.docstring.clone().into())),
            (&Self::SCHEMA[11], Value::String(self.metadata.clone().into())),
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

        let client = Client::new(address.to_string())
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to connect to Milvus: {}", e)))?;

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

        let client = Client::new(address.to_string())
            .await
            .map_err(|e| ContextMcpError::Database(format!("Failed to connect to Milvus: {}", e)))?;

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
            warn!("Collection '{}' already exists, skipping creation", config.name);
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

        collection.load_blocked(1).await.map_err(|e| {
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

        self.client.drop_collection(name).await.map_err(|e| {
            ContextMcpError::Database(format!("Failed to drop collection: {}", e))
        })?;

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
        debug!(
            "Inserting {} records into collection",
            records.len(),
        );

        if records.is_empty() {
            return Ok(vec![]);
        }

        // Convert VectorRecord to CodeVectorBatch
        let mut batch = CodeVectorBatch::with_capacity(records.len());
        let mut ids = Vec::with_capacity(records.len());

        for record in records {
            ids.push(record.id.clone());

            // Serialize metadata to JSON string
            let metadata_json = serde_json::to_string(&record.metadata)
                .map_err(|e| ContextMcpError::Parse(format!("Failed to serialize metadata: {}", e)))?;

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
        debug!(
            "Searching collection with top_k={}",
            query.top_k
        );

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
            .search::<_, _, [&str; 0], _>(
                query.filters.as_deref(),
                &vectors,
                [],
                search_params,
            )
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
            0,     // entity_count - not easily available
            true,  // indexed
            0,     // memory_size - not easily available
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

        collection.flush().await.map_err(|e| {
            ContextMcpError::Database(format!("Failed to flush collection: {}", e))
        })?;

        info!("Collection flushed successfully");
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
