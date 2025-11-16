use serde::{Deserialize, Serialize};

/// Tool parameter and response types for MCP handlers

// ============================================================================
// 1. index_project
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProjectParams {
    /// Root path of the project to index
    pub root_path: String,

    /// Programming languages to parse (e.g., ["typescript", "python", "rust"])
    #[serde(default)]
    pub languages: Vec<String>,

    /// Patterns to exclude from indexing (e.g., ["node_modules/**", ".git/**"])
    #[serde(default)]
    pub exclude_patterns: Vec<String>,

    /// Whether to include document files (*.md, *.txt)
    #[serde(default = "default_true")]
    pub include_documents: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProjectResponse {
    /// Total number of files processed
    pub total_files: usize,

    /// Number of code files indexed
    pub code_files: usize,

    /// Number of document files indexed
    pub document_files: usize,

    /// Total number of symbols extracted
    pub total_symbols: usize,

    /// Processing time in milliseconds
    pub processing_time_ms: u64,

    /// Number of errors encountered
    pub errors: usize,

    /// Status message
    pub status: String,
}

// ============================================================================
// 2. search_code
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCodeParams {
    /// Search query (natural language or code snippet)
    pub query: String,

    /// Project ID to search within (optional, searches all if not specified)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,

    /// File types to filter (e.g., ["ts", "py", "rs"])
    #[serde(default)]
    pub file_types: Vec<String>,

    /// Maximum number of results to return
    #[serde(default = "default_top_k")]
    pub top_k: usize,

    /// Minimum similarity score threshold (0.0 - 1.0)
    #[serde(default = "default_threshold")]
    pub score_threshold: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCodeResponse {
    /// Search results
    pub results: Vec<SearchResult>,

    /// Total number of results found (may be > results.len() if limited by top_k)
    pub total_found: usize,

    /// Search time in milliseconds
    pub search_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// File path
    pub file_path: String,

    /// Code snippet
    pub snippet: String,

    /// Similarity score (0.0 - 1.0)
    pub score: f32,

    /// Programming language
    pub language: String,

    /// Symbol type (function, class, method, etc.)
    pub symbol_type: Option<String>,

    /// Symbol name
    pub symbol_name: Option<String>,

    /// Line number range (start, end)
    pub line_range: (usize, usize),

    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

// ============================================================================
// 3. get_symbol
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSymbolParams {
    /// Symbol name to search for
    pub symbol_name: String,

    /// Symbol type filter (function, class, interface, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol_type: Option<String>,

    /// Project ID to search within
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSymbolResponse {
    /// Symbol definitions found
    pub definitions: Vec<SymbolLocation>,

    /// Symbol references found
    pub references: Vec<SymbolLocation>,

    /// Total count
    pub total_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolLocation {
    /// File path
    pub file_path: String,

    /// Symbol name
    pub symbol_name: String,

    /// Symbol type
    pub symbol_type: String,

    /// Line number range
    pub line_range: (usize, usize),

    /// Code snippet
    pub snippet: String,

    /// Whether this is a definition (vs reference)
    pub is_definition: bool,

    /// Docstring/comment if available
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docstring: Option<String>,
}

// ============================================================================
// 4. find_related_docs
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindRelatedDocsParams {
    /// File path to find related documents for
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,

    /// Symbol name to find related documents for
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol_name: Option<String>,

    /// Maximum number of documents to return
    #[serde(default = "default_top_k")]
    pub top_k: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindRelatedDocsResponse {
    /// Related documents
    pub documents: Vec<RelatedDocument>,

    /// Total found
    pub total_found: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedDocument {
    /// Document file path
    pub file_path: String,

    /// Document title/heading
    pub title: String,

    /// Relevance score (0.0 - 1.0)
    pub relevance_score: f32,

    /// Excerpt/snippet from the document
    pub excerpt: String,

    /// Section within the document
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
}

// ============================================================================
// 5. get_index_status
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetIndexStatusParams {
    /// Project ID to get status for (optional, returns all if not specified)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetIndexStatusResponse {
    /// Index status per project
    pub projects: Vec<ProjectIndexStatus>,

    /// Overall statistics
    pub overall_stats: IndexStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIndexStatus {
    /// Project ID
    pub project_id: String,

    /// Project root path
    pub root_path: String,

    /// Indexing status (indexed, indexing, error)
    pub status: String,

    /// Last indexed timestamp (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_indexed_at: Option<String>,

    /// Statistics for this project
    pub stats: IndexStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatistics {
    /// Total files indexed
    pub total_files: usize,

    /// Code files
    pub code_files: usize,

    /// Document files
    pub document_files: usize,

    /// Total symbols
    pub total_symbols: usize,

    /// Total vectors in database
    pub total_vectors: usize,

    /// Index size in bytes
    pub index_size_bytes: u64,
}

// ============================================================================
// 6. clear_index
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearIndexParams {
    /// Project ID to clear (if not specified, clears all)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,

    /// Confirm deletion (safety flag)
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearIndexResponse {
    /// Whether the operation succeeded
    pub success: bool,

    /// Number of projects cleared
    pub projects_cleared: usize,

    /// Number of vectors deleted
    pub vectors_deleted: usize,

    /// Status message
    pub message: String,
}

// ============================================================================
// Helper functions
// ============================================================================

fn default_true() -> bool {
    true
}

fn default_top_k() -> usize {
    10
}

fn default_threshold() -> f32 {
    0.5
}
