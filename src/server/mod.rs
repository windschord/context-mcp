use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::*;
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{schemars, tool, tool_router, ErrorData as McpError, ServerHandler};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use crate::config::ServerConfig;
use crate::embedding::EmbeddingEngine;
use crate::error::{ContextMcpError, Result};
use crate::indexing::service::IndexingService;
use crate::indexing::types::IndexConfig;
use crate::parser::SymbolExtractor;
use crate::search::bm25_engine::BM25Engine;
use crate::search::hybrid_engine::HybridSearchEngine;
use crate::search::types::NormalizationType;
use crate::storage::milvus_client::MilvusClient;
use crate::storage::types::CollectionConfig;
use crate::tools::*;

// ========================================================================
// Tool Parameter Structs
// ========================================================================

/// Parameters for index_project tool
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct IndexProjectParams {
    #[schemars(description = "Root path of the project to index")]
    root_path: String,

    #[schemars(description = "Programming languages to parse (e.g., ['typescript', 'python'])")]
    languages: Option<Vec<String>>,

    #[schemars(description = "Patterns to exclude (e.g., ['node_modules/**', '.git/**'])")]
    exclude_patterns: Option<Vec<String>>,

    #[schemars(description = "Whether to include document files (*.md, *.txt)")]
    include_documents: Option<bool>,

    #[schemars(description = "Project ID (defaults to directory name)")]
    project_id: Option<String>,
}

/// Parameters for search_code tool
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct SearchCodeParams {
    #[schemars(description = "Natural language search query")]
    query: String,

    #[schemars(description = "Project ID to search within (optional)")]
    project_id: Option<String>,

    #[schemars(description = "Milvus collection name (default: 'code_vectors')")]
    collection_name: Option<String>,

    #[schemars(description = "File types to filter (e.g., ['ts', 'py'])")]
    file_types: Option<Vec<String>>,

    #[schemars(description = "Maximum number of results (default: 10)")]
    top_k: Option<usize>,

    #[schemars(description = "Minimum similarity score threshold (0.0-1.0, default: 0.5)")]
    min_score: Option<f32>,
}

/// Parameters for get_symbol tool
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct GetSymbolParams {
    #[schemars(description = "Symbol name to search for (function, class, variable, etc.)")]
    symbol_name: String,

    #[schemars(description = "Symbol type filter (e.g., 'function', 'class', 'variable')")]
    symbol_type: Option<String>,

    #[schemars(description = "Project ID to search within (optional)")]
    project_id: Option<String>,
}

/// Parameters for find_related_docs tool
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct FindRelatedDocsParams {
    #[schemars(description = "File path of the code file (optional)")]
    file_path: Option<String>,

    #[schemars(description = "Symbol name to find related documentation for (optional)")]
    symbol_name: Option<String>,

    #[schemars(description = "Maximum number of related documents (default: 5)")]
    top_k: Option<usize>,
}

/// Parameters for get_index_status tool
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct GetIndexStatusParams {
    #[schemars(
        description = "Project ID to get status for (optional, returns all if not specified)"
    )]
    project_id: Option<String>,
}

/// Parameters for clear_index tool
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ClearIndexParams {
    #[schemars(description = "Project ID to clear (optional, clears all if not specified)")]
    project_id: Option<String>,

    #[schemars(description = "Confirm deletion (required safety flag)")]
    confirm: Option<bool>,
}

/// MCP Server state
#[derive(Clone)]
pub struct ContextMcpServer {
    /// Tool router for MCP protocol
    tool_router: ToolRouter<Self>,

    /// Server state
    state: Arc<RwLock<ServerState>>,
}

/// Internal server state containing all services
struct ServerState {
    /// Server configuration
    config: ServerConfig,

    /// Symbol extractor for AST parsing
    parser: Option<Arc<SymbolExtractor>>,

    /// Embedding engine for vector generation
    embedding: Option<Arc<EmbeddingEngine>>,

    /// Milvus client for vector storage
    storage: Option<Arc<MilvusClient>>,

    /// BM25 engine for full-text search (already thread-safe internally)
    bm25: Option<Arc<BM25Engine>>,

    /// Hybrid search engine
    hybrid: Option<Arc<HybridSearchEngine>>,

    /// Indexing service
    indexing: Option<Arc<IndexingService>>,

    /// Track indexed projects
    indexed_projects: HashMap<String, ProjectState>,

    /// Initialization status
    initialized: bool,
}

/// State of an indexed project
#[derive(Debug, Clone)]
struct ProjectState {
    project_id: String,
    root_path: PathBuf,
    indexed_at: chrono::DateTime<chrono::Utc>,
    file_count: usize,
    symbol_count: usize,
}

impl ServerState {
    fn new(config: ServerConfig) -> Self {
        Self {
            config,
            parser: None,
            embedding: None,
            storage: None,
            bm25: None,
            hybrid: None,
            indexing: None,
            indexed_projects: HashMap::new(),
            initialized: false,
        }
    }
}

#[tool_router]
impl ContextMcpServer {
    /// Create a new MCP server instance with default configuration
    pub fn new() -> Self {
        info!("Initializing Context-MCP server with default configuration");

        let config = ServerConfig::default();
        Self::with_config(config)
    }

    /// Create a new MCP server instance with custom configuration
    pub fn with_config(config: ServerConfig) -> Self {
        info!("Initializing Context-MCP server with custom configuration");
        info!("Config: {}", config.summary());

        Self {
            tool_router: Self::tool_router(),
            state: Arc::new(RwLock::new(ServerState::new(config))),
        }
    }

    /// Load configuration from file and create server
    pub async fn from_config_file(path: impl AsRef<std::path::Path>) -> Result<Self> {
        let config = ServerConfig::from_file(path)?;
        Ok(Self::with_config(config))
    }

    /// Initialize server with all components
    pub async fn initialize(&self) -> Result<()> {
        info!("Initializing server components");

        let mut state = self.state.write().await;

        if state.initialized {
            warn!("Server already initialized");
            return Ok(());
        }

        // Initialize symbol parser
        info!("Initializing symbol extractor");
        state.parser = Some(Arc::new(SymbolExtractor::new()));

        // Initialize embedding engine
        info!("Initializing embedding engine");
        let embedding_config = crate::embedding::EmbeddingConfig {
            model_path: state.config.embedding.model_path.clone(),
            tokenizer_path: state.config.embedding.tokenizer_path.clone(),
            max_length: state.config.embedding.max_length,
            batch_size: state.config.embedding.batch_size,
        };

        let embedding = EmbeddingEngine::new(embedding_config).await.map_err(|e| {
            error!("Failed to initialize embedding engine: {}", e);
            e
        })?;
        state.embedding = Some(Arc::new(embedding));

        // Initialize Milvus client
        info!("Connecting to Milvus at {}", state.config.milvus.address);
        let milvus = if let Some(token) = &state.config.milvus.token {
            MilvusClient::new_with_token(&state.config.milvus.address, token).await?
        } else {
            MilvusClient::new(&state.config.milvus.address).await?
        };
        state.storage = Some(Arc::new(milvus));

        // Initialize BM25 engine
        info!("Initializing BM25 engine");
        let bm25_config =
            crate::search::types::BM25Config::new(state.config.bm25.k1, state.config.bm25.b);

        // Create parent directory if it doesn't exist
        if let Some(parent) = state.config.bm25.db_path.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }

        let bm25 = BM25Engine::new(&state.config.bm25.db_path)
            .and_then(|engine| engine.with_config(bm25_config))?;
        state.bm25 = Some(Arc::new(bm25));

        // Initialize hybrid search engine
        info!("Initializing hybrid search engine");
        let hybrid = HybridSearchEngine::new(
            Arc::clone(
                state
                    .bm25
                    .as_ref()
                    .expect("BM25 engine must be initialized before hybrid search"),
            ),
            Arc::clone(
                state
                    .storage
                    .as_ref()
                    .expect("Storage must be initialized before hybrid search"),
            ),
            Arc::clone(
                state
                    .embedding
                    .as_ref()
                    .expect("Embedding engine must be initialized before hybrid search"),
            ),
        );
        state.hybrid = Some(Arc::new(hybrid));

        // Initialize indexing service
        info!("Initializing indexing service");
        let indexing = IndexingService::new(
            Arc::clone(
                state
                    .parser
                    .as_ref()
                    .expect("Parser must be initialized before indexing service"),
            ),
            Arc::clone(
                state
                    .embedding
                    .as_ref()
                    .expect("Embedding engine must be initialized before indexing service"),
            ),
            Arc::clone(
                state
                    .storage
                    .as_ref()
                    .expect("Storage must be initialized before indexing service"),
            ),
            Arc::clone(
                state
                    .bm25
                    .as_ref()
                    .expect("BM25 engine must be initialized before indexing service"),
            ),
        )
        .with_collection_name(state.config.indexing.collection_name.clone());
        state.indexing = Some(Arc::new(indexing));

        // Create Milvus collection if it doesn't exist
        let collection_name = &state.config.indexing.collection_name;
        let storage = state
            .storage
            .as_ref()
            .expect("Storage must be initialized before collection creation");

        if !storage.collection_exists(collection_name).await? {
            info!("Creating collection: {}", collection_name);
            let mut collection_config =
                CollectionConfig::code_vectors(state.config.indexing.dimension as i32);
            collection_config.name = collection_name.clone();
            collection_config.description = "Code vectors for semantic search".to_string();
            collection_config.shard_num = Some(state.config.milvus.shard_num);

            storage.create_collection(collection_config).await?;
            info!("Collection created successfully");
        } else {
            info!("Collection already exists: {}", collection_name);
        }

        state.initialized = true;
        info!("Server initialization complete");

        Ok(())
    }

    // ========================================================================
    // MCP Tool Handlers
    // ========================================================================

    /// Tool 1: Index a project
    #[tool(
        description = "Index a project directory for semantic code search. Parses source code with Tree-sitter AST analysis and stores embeddings in vector database."
    )]
    async fn index_project(
        &self,
        Parameters(params): Parameters<IndexProjectParams>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let start_time = Instant::now();
        info!("index_project: root_path={}", params.root_path);

        // Destructure parameters
        let IndexProjectParams {
            root_path,
            languages,
            exclude_patterns,
            include_documents,
            project_id,
        } = params;

        let (indexing_service, batch_size, max_parallel) = {
            let state = self.state.read().await;
            if !state.initialized {
                return Ok(CallToolResult::success(vec![Content::text(
                    "Error: Server not initialized. Please wait for initialization to complete."
                        .to_string(),
                )]));
            }

            let indexing_service = match &state.indexing {
                Some(service) => Arc::clone(service),
                None => {
                    return Ok(CallToolResult::success(vec![Content::text(
                        "Error: Indexing service not available".to_string(),
                    )]));
                }
            };

            (
                indexing_service,
                state.config.indexing.batch_size,
                state.config.indexing.max_parallel,
            )
        };

        // Determine project ID
        let project_id = project_id.unwrap_or_else(|| {
            PathBuf::from(&root_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("default")
                .to_string()
        });

        // Build index config
        let mut config = IndexConfig::new(PathBuf::from(&root_path));
        config.project_id = project_id.clone();
        config.languages = languages
            .unwrap_or_default()
            .iter()
            .filter_map(|lang| match lang.to_lowercase().as_str() {
                "typescript" => Some(crate::parser::Language::TypeScript),
                "javascript" => Some(crate::parser::Language::JavaScript),
                "python" => Some(crate::parser::Language::Python),
                "go" => Some(crate::parser::Language::Go),
                "rust" => Some(crate::parser::Language::Rust),
                "java" => Some(crate::parser::Language::Java),
                "c" => Some(crate::parser::Language::C),
                "cpp" | "c++" => Some(crate::parser::Language::Cpp),
                _ => None,
            })
            .collect();
        config.exclude_patterns = exclude_patterns.unwrap_or_default();
        config.include_documents = include_documents.unwrap_or(true);
        config.batch_size = batch_size;
        config.max_parallel = max_parallel;

        // Perform indexing
        let result = match indexing_service.index_project(config).await {
            Ok(result) => result,
            Err(e) => {
                error!("Indexing failed: {}", e);
                let response = IndexProjectResponse {
                    total_files: 0,
                    code_files: 0,
                    document_files: 0,
                    total_symbols: 0,
                    processing_time_ms: start_time.elapsed().as_millis() as u64,
                    errors: 1,
                    status: format!("Indexing failed: {}", e),
                };
                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;
                return Ok(CallToolResult::success(vec![Content::text(json)]));
            }
        };

        // Update project state
        let mut state = self.state.write().await;
        state.indexed_projects.insert(
            project_id.clone(),
            ProjectState {
                project_id,
                root_path: PathBuf::from(&root_path),
                indexed_at: chrono::Utc::now(),
                file_count: result.indexed_files,
                symbol_count: result.total_symbols,
            },
        );
        drop(state);

        // Build response
        let response = IndexProjectResponse {
            total_files: result.total_files,
            code_files: result.indexed_files,
            document_files: 0, // TODO: Track document files separately
            total_symbols: result.total_symbols,
            processing_time_ms: start_time.elapsed().as_millis() as u64,
            errors: result.errors.len(),
            status: if result.success {
                "Indexing completed successfully".to_string()
            } else {
                format!("Indexing completed with {} errors", result.errors.len())
            },
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;

        info!("index_project completed: {}", result.summary());

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 2: Search code semantically
    #[tool(
        description = "Search code using natural language queries. Uses hybrid search combining BM25 and vector similarity for accurate results."
    )]
    async fn search_code(
        &self,
        Parameters(params): Parameters<SearchCodeParams>,
    ) -> std::result::Result<CallToolResult, McpError> {
        let start_time = Instant::now();
        info!("search_code: query='{}'", params.query);

        // Destructure parameters
        let SearchCodeParams {
            query,
            project_id,
            collection_name,
            file_types,
            top_k,
            min_score: score_threshold,
        } = params;

        let (hybrid_engine, collection_name, hybrid_config) = {
            let state = self.state.read().await;
            if !state.initialized {
                return Ok(CallToolResult::success(vec![Content::text(
                    "Error: Server not initialized".to_string(),
                )]));
            }

            let hybrid_engine = match &state.hybrid {
                Some(engine) => Arc::clone(engine),
                None => {
                    return Ok(CallToolResult::success(vec![Content::text(
                        "Error: Search engine not available".to_string(),
                    )]));
                }
            };

            // Use provided collection_name or default from config
            let collection_name = collection_name
                .as_ref()
                .map(|s| s.to_string())
                .unwrap_or_else(|| state.config.indexing.collection_name.clone());
            let top_k_value = top_k.unwrap_or(10);
            let _threshold = score_threshold.unwrap_or(0.5);

            // Build hybrid config
            let hybrid_config = crate::search::types::HybridConfig {
                alpha: state.config.hybrid.alpha,
                normalization: match state.config.hybrid.normalization.as_str() {
                    "MinMax" => NormalizationType::MinMax,
                    "ZScore" => NormalizationType::ZScore,
                    "None" => NormalizationType::None,
                    _ => NormalizationType::MinMax,
                },
                bm25_top_k: state.config.hybrid.bm25_top_k,
                vector_top_k: state.config.hybrid.vector_top_k,
                top_k: top_k_value,
            };

            (hybrid_engine, collection_name, hybrid_config)
        };

        // Perform hybrid search
        let results = match hybrid_engine
            .search_with_config(&query, &collection_name, hybrid_config)
            .await
        {
            Ok(results) => results,
            Err(e) => {
                error!("Search failed: {}", e);
                let response = SearchCodeResponse {
                    results: vec![],
                    total_found: 0,
                    search_time_ms: start_time.elapsed().as_millis() as u64,
                };
                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;
                return Ok(CallToolResult::success(vec![Content::text(json)]));
            }
        };

        // Convert to response format
        let mut search_results = Vec::new();
        for result in results {
            // Apply filters
            if let Some(threshold) = score_threshold {
                if result.score < threshold {
                    continue;
                }
            }

            if let Some(ref types) = file_types {
                if !types.contains(&result.record.language) {
                    continue;
                }
            }

            if let Some(ref pid) = project_id {
                if &result.record.project_id != pid {
                    continue;
                }
            }

            search_results.push(SearchResult {
                file_path: result.record.file_path,
                snippet: result.record.snippet,
                score: result.score,
                language: result.record.language,
                symbol_type: Some(result.record.symbol_type),
                symbol_name: Some(result.record.symbol_name),
                line_range: (
                    result.record.line_start as usize,
                    result.record.line_end as usize,
                ),
                metadata: None,
            });
        }

        let response = SearchCodeResponse {
            total_found: search_results.len(),
            results: search_results,
            search_time_ms: start_time.elapsed().as_millis() as u64,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;

        info!(
            "search_code completed: {} results in {}ms",
            response.total_found, response.search_time_ms
        );

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 3: Get symbol definition and references
    #[tool(
        description = "Find definitions and references of a symbol (function, class, variable, etc.) across the codebase."
    )]
    async fn get_symbol(
        &self,
        Parameters(params): Parameters<GetSymbolParams>,
    ) -> std::result::Result<CallToolResult, McpError> {
        info!("get_symbol: symbol_name='{}'", params.symbol_name);

        // Destructure parameters
        let GetSymbolParams {
            symbol_name,
            symbol_type,
            project_id,
        } = params;

        let state = self.state.read().await;
        if !state.initialized {
            return Ok(CallToolResult::success(vec![Content::text(
                "Error: Server not initialized".to_string(),
            )]));
        }

        // Use BM25 to search for exact symbol name matches
        let bm25 = match &state.bm25 {
            Some(engine) => engine,
            None => {
                return Ok(CallToolResult::success(vec![Content::text(
                    "Error: Search engine not available".to_string(),
                )]));
            }
        };

        let results = bm25
            .search(&symbol_name, 100)
            .map_err(|e| McpError::from(ContextMcpError::Search(e.to_string())))?;

        // Convert to symbol locations (simplified implementation)
        let mut definitions = Vec::new();
        let references = Vec::new();

        for result in results {
            let parts: Vec<&str> = result.id.split(':').collect();
            if parts.len() < 2 {
                continue;
            }

            let file_path = parts[0].to_string();
            let line_start = parts
                .get(1)
                .and_then(|s| s.parse::<usize>().ok())
                .unwrap_or(0);

            // Check metadata for symbol type
            let symbol_type_match = symbol_type.as_ref().map_or(true, |st| {
                result
                    .metadata
                    .get("symbol_type")
                    .map_or(false, |t| t.contains(st))
            });

            if !symbol_type_match {
                continue;
            }

            // Check project ID filter
            if let Some(ref _pid) = project_id {
                // Would need to track project_id in BM25 metadata
                // For now, skip this filter
            }

            let location = SymbolLocation {
                file_path,
                symbol_name: result
                    .metadata
                    .get("symbol_name")
                    .cloned()
                    .unwrap_or_else(|| symbol_name.clone()),
                symbol_type: result
                    .metadata
                    .get("symbol_type")
                    .cloned()
                    .unwrap_or_else(|| "unknown".to_string()),
                line_range: (line_start, line_start + 10),
                snippet: result.text.clone(),
                is_definition: true, // Simplified: assume all are definitions
                docstring: None,
            };

            definitions.push(location);
        }

        let response = GetSymbolResponse {
            definitions: definitions.clone(),
            references: references.clone(),
            total_count: definitions.len() + references.len(),
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 4: Find related documentation
    #[tool(
        description = "Find documentation files related to specific code files or symbols using semantic search."
    )]
    async fn find_related_docs(
        &self,
        Parameters(params): Parameters<FindRelatedDocsParams>,
    ) -> std::result::Result<CallToolResult, McpError> {
        info!(
            "find_related_docs: file_path={:?}, symbol_name={:?}",
            params.file_path, params.symbol_name
        );

        // Destructure parameters
        let FindRelatedDocsParams {
            file_path,
            symbol_name,
            top_k,
        } = params;

        // Build search query from inputs
        let query = if let Some(ref name) = symbol_name {
            name.clone()
        } else if let Some(ref path) = file_path {
            format!("documentation for {}", path)
        } else {
            return Ok(CallToolResult::success(vec![Content::text(
                "Error: Must provide either file_path or symbol_name".to_string(),
            )]));
        };

        // Use hybrid search to find related documents
        let (hybrid_engine, collection_name, top_k_value) = {
            let state = self.state.read().await;
            if !state.initialized {
                return Ok(CallToolResult::success(vec![Content::text(
                    "Error: Server not initialized".to_string(),
                )]));
            }

            let hybrid_engine = match &state.hybrid {
                Some(engine) => Arc::clone(engine),
                None => {
                    return Ok(CallToolResult::success(vec![Content::text(
                        "Error: Search engine not available".to_string(),
                    )]));
                }
            };

            let collection_name = state.config.indexing.collection_name.clone();
            let top_k_value = top_k.unwrap_or(10);

            (hybrid_engine, collection_name, top_k_value)
        };

        let results = match hybrid_engine
            .search(&query, &collection_name, top_k_value)
            .await
        {
            Ok(results) => results,
            Err(e) => {
                error!("Document search failed: {}", e);
                let response = FindRelatedDocsResponse {
                    documents: vec![],
                    total_found: 0,
                };
                let json = serde_json::to_string_pretty(&response)
                    .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;
                return Ok(CallToolResult::success(vec![Content::text(json)]));
            }
        };

        // Filter for document files (.md, .txt)
        let documents: Vec<RelatedDocument> = results
            .iter()
            .filter(|r| {
                let path = &r.record.file_path;
                path.ends_with(".md") || path.ends_with(".txt") || path.ends_with(".rst")
            })
            .map(|r| RelatedDocument {
                file_path: r.record.file_path.clone(),
                title: r.record.symbol_name.clone(),
                relevance_score: r.score,
                excerpt: r.record.snippet.clone(),
                section: None,
            })
            .collect();

        let response = FindRelatedDocsResponse {
            total_found: documents.len(),
            documents,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 5: Get indexing status
    #[tool(
        description = "Get the current indexing status and statistics for all or specific projects."
    )]
    async fn get_index_status(
        &self,
        Parameters(params): Parameters<GetIndexStatusParams>,
    ) -> std::result::Result<CallToolResult, McpError> {
        info!("get_index_status: project_id={:?}", params.project_id);

        // Destructure parameters
        let GetIndexStatusParams { project_id } = params;

        let state = self.state.read().await;

        let mut projects = Vec::new();
        let mut overall_files = 0;
        let mut overall_symbols = 0;

        // Filter projects if project_id specified
        for (pid, proj_state) in &state.indexed_projects {
            if let Some(ref filter_id) = project_id {
                if pid != filter_id {
                    continue;
                }
            }

            projects.push(ProjectIndexStatus {
                project_id: proj_state.project_id.clone(),
                root_path: proj_state.root_path.to_string_lossy().to_string(),
                status: "indexed".to_string(),
                last_indexed_at: Some(proj_state.indexed_at.to_rfc3339()),
                stats: IndexStatistics {
                    total_files: proj_state.file_count,
                    code_files: proj_state.file_count,
                    document_files: 0,
                    total_symbols: proj_state.symbol_count,
                    total_vectors: proj_state.symbol_count,
                    index_size_bytes: 0,
                },
            });

            overall_files += proj_state.file_count;
            overall_symbols += proj_state.symbol_count;
        }

        // Get database stats if available
        if let Some(ref indexing) = state.indexing {
            if let Ok(stats) = indexing.get_stats().await {
                overall_symbols = stats.vector_count;
            }
        }

        let response = GetIndexStatusResponse {
            projects,
            overall_stats: IndexStatistics {
                total_files: overall_files,
                code_files: overall_files,
                document_files: 0,
                total_symbols: overall_symbols,
                total_vectors: overall_symbols,
                index_size_bytes: 0,
            },
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| McpError::from(ContextMcpError::Parse(e.to_string())))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 6: Clear index
    #[tool(
        description = "Clear the index for specific or all projects. Requires confirmation to prevent accidental deletion."
    )]
    async fn clear_index(
        &self,
        Parameters(params): Parameters<ClearIndexParams>,
    ) -> std::result::Result<CallToolResult, McpError> {
        info!("clear_index: project_id={:?}", params.project_id);

        // Destructure parameters
        let ClearIndexParams {
            project_id,
            confirm,
        } = params;

        let confirm = confirm.unwrap_or(false);
        if !confirm {
            return Ok(CallToolResult::success(vec![Content::text(
                "Error: Confirmation required. Set confirm=true to proceed with deletion."
                    .to_string(),
            )]));
        }

        let indexing_service = {
            let state = self.state.read().await;
            if !state.initialized {
                return Ok(CallToolResult::success(vec![Content::text(
                    "Error: Server not initialized".to_string(),
                )]));
            }

            match &state.indexing {
                Some(service) => Arc::clone(service),
                None => {
                    return Ok(CallToolResult::success(vec![Content::text(
                        "Error: Indexing service not available".to_string(),
                    )]));
                }
            }
        };

        // Clear the index
        let result = if let Some(ref pid) = project_id {
            // Clear specific project
            let mut state = self.state.write().await;
            let count = if state.indexed_projects.contains_key(pid) {
                state.indexed_projects.remove(pid);
                1
            } else {
                0
            };

            // Note: We don't have per-project deletion in vector DB yet
            // This would require filtering by project_id field
            warn!("Per-project deletion not fully implemented");

            ClearIndexResponse {
                success: count > 0,
                projects_cleared: count,
                vectors_deleted: 0,
                message: if count > 0 {
                    format!("Project '{}' cleared from tracking", pid)
                } else {
                    format!("Project '{}' not found", pid)
                },
            }
        } else {
            // Clear all
            let project_count = {
                let mut state = self.state.write().await;
                let count = state.indexed_projects.len();
                state.indexed_projects.clear();
                count
            };

            match indexing_service.clear_index().await {
                Ok(()) => ClearIndexResponse {
                    success: true,
                    projects_cleared: project_count,
                    vectors_deleted: 0,
                    message: "All indexes cleared successfully".to_string(),
                },
                Err(e) => {
                    error!("Failed to clear index: {}", e);
                    ClearIndexResponse {
                        success: false,
                        projects_cleared: 0,
                        vectors_deleted: 0,
                        message: format!("Failed to clear index: {}", e),
                    }
                }
            }
        };

        let json = serde_json::to_string_pretty(&result)
            .map_err(|e| ContextMcpError::Parse(e.to_string()))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }
}

impl Default for ContextMcpServer {
    fn default() -> Self {
        Self::new()
    }
}

/// ServerHandler implementation for MCP protocol
impl ServerHandler for ContextMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::default(),
            server_info: Implementation {
                name: "context-mcp".to_string(),
                title: None,
                version: env!("CARGO_PKG_VERSION").to_string(),
                icons: None,
                website_url: None,
            },
            instructions: Some(
                "Context-MCP: Semantic code search with Tree-sitter AST analysis and vector database.\n\
                 Provides hybrid search (BM25 + vector similarity) across your codebase.\n\n\
                 Available tools:\n\
                 - index_project: Index a project directory for semantic search\n\
                 - search_code: Search code using natural language queries\n\
                 - get_symbol: Find symbol definitions and references\n\
                 - find_related_docs: Find related documentation\n\
                 - get_index_status: Get indexing status and statistics\n\
                 - clear_index: Clear indexed data\n\n\
                 Start by indexing your project, then use search_code for semantic search."
                    .to_string(),
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
        }
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParam,
        context: RequestContext<RoleServer>,
    ) -> std::result::Result<CallToolResult, McpError> {
        use rmcp::handler::server::tool::ToolCallContext;
        let tool_context = ToolCallContext::new(self, request, context);
        self.tool_router.call(tool_context).await
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> std::result::Result<ListToolsResult, McpError> {
        Ok(ListToolsResult {
            tools: self.tool_router.list_all(),
            next_cursor: None,
        })
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
