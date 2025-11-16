use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::model::*;
use rmcp::{tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::error::{ContextMcpError, Result};
use crate::tools::*;

/// MCP Server state
#[derive(Clone)]
pub struct ContextMcpServer {
    /// Tool router for MCP protocol
    tool_router: ToolRouter<Self>,

    /// Server state (placeholder for future services)
    state: Arc<RwLock<ServerState>>,
}

/// Internal server state
#[derive(Debug, Default)]
struct ServerState {
    /// Placeholder: will hold indexing service, search service, etc.
    _initialized: bool,
}

#[tool_router]
impl ContextMcpServer {
    /// Create a new MCP server instance
    pub fn new() -> Self {
        info!("Initializing Context-MCP server");

        Self {
            tool_router: Self::tool_router(),
            state: Arc::new(RwLock::new(ServerState::default())),
        }
    }

    /// Initialize server with configuration
    pub async fn initialize(&self) -> Result<()> {
        info!("Initializing server state");

        let mut state = self.state.write().await;
        state._initialized = true;

        // TODO: Initialize indexing service
        // TODO: Initialize search service
        // TODO: Initialize vector store connection
        // TODO: Load configuration

        Ok(())
    }

    // ========================================================================
    // MCP Tool Handlers
    // ========================================================================

    /// Tool 1: Index a project
    ///
    /// Indexes all files in a project directory, parsing code with Tree-sitter
    /// and extracting symbols for semantic search.
    #[tool(
        description = "Index a project directory for semantic code search. Parses source code with Tree-sitter AST analysis and stores embeddings in vector database."
    )]
    async fn index_project(
        &self,
        #[tool(schema(description = "Root path of the project to index"))] root_path: String,
        #[tool(schema(description = "Programming languages to parse (e.g., ['typescript', 'python'])"))]
        languages: Option<Vec<String>>,
        #[tool(schema(description = "Patterns to exclude (e.g., ['node_modules/**', '.git/**'])"))]
        exclude_patterns: Option<Vec<String>>,
        #[tool(schema(description = "Whether to include document files (*.md, *.txt)"))]
        include_documents: Option<bool>,
    ) -> std::result::Result<CallToolResult, McpError> {
        debug!(
            "index_project called: root_path={}, languages={:?}",
            root_path, languages
        );

        // Build params
        let params = IndexProjectParams {
            root_path: root_path.clone(),
            languages: languages.unwrap_or_default(),
            exclude_patterns: exclude_patterns.unwrap_or_default(),
            include_documents: include_documents.unwrap_or(true),
        };

        // TODO: Implement actual indexing logic
        // For now, return stub response
        let response = IndexProjectResponse {
            total_files: 0,
            code_files: 0,
            document_files: 0,
            total_symbols: 0,
            processing_time_ms: 0,
            errors: 0,
            status: format!("Stub: Would index project at {}", params.root_path),
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| ContextMcpError::Parse(e.to_string()))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 2: Search code semantically
    ///
    /// Performs hybrid search (BM25 + vector similarity) to find relevant
    /// code snippets matching the natural language query.
    #[tool(
        description = "Search code using natural language queries. Uses hybrid search combining BM25 and vector similarity for accurate results."
    )]
    async fn search_code(
        &self,
        #[tool(schema(description = "Natural language search query"))] query: String,
        #[tool(schema(description = "Project ID to search within (optional)"))] project_id: Option<
            String,
        >,
        #[tool(schema(description = "File types to filter (e.g., ['ts', 'py'])"))] file_types: Option<
            Vec<String>,
        >,
        #[tool(schema(description = "Maximum number of results (default: 10)"))] top_k: Option<
            usize,
        >,
        #[tool(schema(description = "Minimum similarity score threshold (0.0-1.0, default: 0.5)"))]
        score_threshold: Option<f32>,
    ) -> std::result::Result<CallToolResult, McpError> {
        debug!("search_code called: query={}", query);

        let params = SearchCodeParams {
            query: query.clone(),
            project_id,
            file_types: file_types.unwrap_or_default(),
            top_k: top_k.unwrap_or(10),
            score_threshold: score_threshold.unwrap_or(0.5),
        };

        // TODO: Implement actual search logic
        let response = SearchCodeResponse {
            results: vec![],
            total_found: 0,
            search_time_ms: 0,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| ContextMcpError::Parse(e.to_string()))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 3: Get symbol definition and references
    ///
    /// Finds all definitions and references of a specific symbol (function,
    /// class, variable, etc.) across the indexed codebase.
    #[tool(description = "Find definitions and references of a symbol (function, class, variable, etc.) across the codebase.")]
    async fn get_symbol(
        &self,
        #[tool(schema(description = "Symbol name to search for"))] symbol_name: String,
        #[tool(schema(description = "Symbol type filter (function, class, etc.)"))] symbol_type: Option<
            String,
        >,
        #[tool(schema(description = "Project ID to search within"))] project_id: Option<String>,
    ) -> std::result::Result<CallToolResult, McpError> {
        debug!("get_symbol called: symbol_name={}", symbol_name);

        let params = GetSymbolParams {
            symbol_name: symbol_name.clone(),
            symbol_type,
            project_id,
        };

        // TODO: Implement actual symbol lookup
        let response = GetSymbolResponse {
            definitions: vec![],
            references: vec![],
            total_count: 0,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| ContextMcpError::Parse(e.to_string()))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 4: Find related documentation
    ///
    /// Searches for documentation files (Markdown, text) related to specific
    /// code files or symbols using semantic similarity.
    #[tool(description = "Find documentation files related to specific code files or symbols using semantic search.")]
    async fn find_related_docs(
        &self,
        #[tool(schema(description = "File path to find docs for"))] file_path: Option<String>,
        #[tool(schema(description = "Symbol name to find docs for"))] symbol_name: Option<String>,
        #[tool(schema(description = "Maximum number of documents (default: 10)"))] top_k: Option<
            usize,
        >,
    ) -> std::result::Result<CallToolResult, McpError> {
        debug!(
            "find_related_docs called: file_path={:?}, symbol_name={:?}",
            file_path, symbol_name
        );

        let params = FindRelatedDocsParams {
            file_path,
            symbol_name,
            top_k: top_k.unwrap_or(10),
        };

        // TODO: Implement actual doc search
        let response = FindRelatedDocsResponse {
            documents: vec![],
            total_found: 0,
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| ContextMcpError::Parse(e.to_string()))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 5: Get indexing status
    ///
    /// Returns current status of indexed projects, including statistics about
    /// indexed files, symbols, and vector database size.
    #[tool(description = "Get the current indexing status and statistics for all or specific projects.")]
    async fn get_index_status(
        &self,
        #[tool(schema(description = "Project ID to get status for (optional)"))] project_id: Option<
            String,
        >,
    ) -> std::result::Result<CallToolResult, McpError> {
        debug!("get_index_status called: project_id={:?}", project_id);

        let params = GetIndexStatusParams { project_id };

        // TODO: Implement actual status retrieval
        let response = GetIndexStatusResponse {
            projects: vec![],
            overall_stats: IndexStatistics {
                total_files: 0,
                code_files: 0,
                document_files: 0,
                total_symbols: 0,
                total_vectors: 0,
                index_size_bytes: 0,
            },
        };

        let json = serde_json::to_string_pretty(&response)
            .map_err(|e| ContextMcpError::Parse(e.to_string()))?;

        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    /// Tool 6: Clear index
    ///
    /// Removes indexed data for specific projects or all projects. Requires
    /// confirmation flag to prevent accidental deletion.
    #[tool(description = "Clear the index for specific or all projects. Requires confirmation to prevent accidental deletion.")]
    async fn clear_index(
        &self,
        #[tool(schema(description = "Project ID to clear (clears all if not specified)"))]
        project_id: Option<String>,
        #[tool(schema(description = "Confirm deletion (required safety flag)"))] confirm: Option<
            bool,
        >,
    ) -> std::result::Result<CallToolResult, McpError> {
        debug!("clear_index called: project_id={:?}", project_id);

        let confirm = confirm.unwrap_or(false);
        if !confirm {
            return Ok(CallToolResult::success(vec![Content::text(
                "Error: Confirmation required. Set confirm=true to proceed with deletion."
                    .to_string(),
            )]));
        }

        let params = ClearIndexParams {
            project_id,
            confirm,
        };

        // TODO: Implement actual index clearing
        let response = ClearIndexResponse {
            success: false,
            projects_cleared: 0,
            vectors_deleted: 0,
            message: "Stub: Index clearing not yet implemented".to_string(),
        };

        let json = serde_json::to_string_pretty(&response)
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
#[tool_handler]
impl ServerHandler for ContextMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            name: "context-mcp".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            instructions: Some(
                "Context-MCP: Semantic code search with Tree-sitter AST analysis and vector database.\n\
                 Provides hybrid search (BM25 + vector similarity) across your codebase.\n\
                 Use index_project to index your code, then search_code for semantic search."
                    .to_string(),
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}
