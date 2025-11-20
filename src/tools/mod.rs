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

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================
    // Task 12.7: Tools parameter tests
    // ========================================

    #[test]
    fn test_index_project_params_deserialization() {
        let json = r#"{
            "rootPath": "/test/path",
            "languages": ["rust", "python"],
            "excludePatterns": ["target/**", "node_modules/**"],
            "includeDocuments": true
        }"#;

        let params: IndexProjectParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.root_path, "/test/path");
        assert_eq!(params.languages.len(), 2);
        assert_eq!(params.exclude_patterns.len(), 2);
        assert!(params.include_documents);
    }

    #[test]
    fn test_index_project_params_defaults() {
        let json = r#"{
            "rootPath": "/test/path"
        }"#;

        let params: IndexProjectParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.root_path, "/test/path");
        assert!(params.languages.is_empty());
        assert!(params.exclude_patterns.is_empty());
        assert!(params.include_documents); // default_true
    }

    #[test]
    fn test_index_project_params_include_documents_false() {
        let json = r#"{
            "rootPath": "/test/path",
            "includeDocuments": false
        }"#;

        let params: IndexProjectParams = serde_json::from_str(json).unwrap();
        assert!(!params.include_documents);
    }

    #[test]
    fn test_index_project_response_serialization() {
        let response = IndexProjectResponse {
            total_files: 100,
            code_files: 80,
            document_files: 20,
            total_symbols: 500,
            processing_time_ms: 5000,
            errors: 0,
            status: "completed".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("totalFiles"));
        assert!(json.contains("codeFiles"));
        assert!(json.contains("processingTimeMs"));
    }

    #[test]
    fn test_search_code_params_deserialization() {
        let json = r#"{
            "query": "authentication function",
            "projectId": "my-project",
            "fileTypes": ["rs", "py"],
            "topK": 20,
            "scoreThreshold": 0.7
        }"#;

        let params: SearchCodeParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.query, "authentication function");
        assert_eq!(params.project_id, Some("my-project".to_string()));
        assert_eq!(params.file_types.len(), 2);
        assert_eq!(params.top_k, 20);
        assert!((params.score_threshold - 0.7).abs() < 1e-5);
    }

    #[test]
    fn test_search_code_params_defaults() {
        let json = r#"{
            "query": "test query"
        }"#;

        let params: SearchCodeParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.query, "test query");
        assert!(params.project_id.is_none());
        assert!(params.file_types.is_empty());
        assert_eq!(params.top_k, 10); // default_top_k
        assert!((params.score_threshold - 0.5).abs() < 1e-5); // default_threshold
    }

    #[test]
    fn test_search_code_params_optional_project_id() {
        let json = r#"{
            "query": "test"
        }"#;

        let params: SearchCodeParams = serde_json::from_str(json).unwrap();
        assert!(params.project_id.is_none());
    }

    #[test]
    fn test_search_result_serialization() {
        let result = SearchResult {
            file_path: "/path/to/file.rs".to_string(),
            snippet: "fn test() {}".to_string(),
            score: 0.95,
            language: "rust".to_string(),
            symbol_type: Some("function".to_string()),
            symbol_name: Some("test".to_string()),
            line_range: (10, 20),
            metadata: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("filePath"));
        assert!(json.contains("symbolType"));
        assert!(json.contains("lineRange"));
        assert!(!json.contains("metadata")); // None is skipped
    }

    #[test]
    fn test_get_symbol_params_deserialization() {
        let json = r#"{
            "symbolName": "MyClass",
            "symbolType": "class",
            "projectId": "proj1"
        }"#;

        let params: GetSymbolParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.symbol_name, "MyClass");
        assert_eq!(params.symbol_type, Some("class".to_string()));
        assert_eq!(params.project_id, Some("proj1".to_string()));
    }

    #[test]
    fn test_get_symbol_params_minimal() {
        let json = r#"{
            "symbolName": "foo"
        }"#;

        let params: GetSymbolParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.symbol_name, "foo");
        assert!(params.symbol_type.is_none());
        assert!(params.project_id.is_none());
    }

    #[test]
    fn test_symbol_location_serialization() {
        let location = SymbolLocation {
            file_path: "/src/main.rs".to_string(),
            symbol_name: "main".to_string(),
            symbol_type: "function".to_string(),
            line_range: (1, 10),
            snippet: "fn main() {}".to_string(),
            is_definition: true,
            docstring: Some("Main entry point".to_string()),
        };

        let json = serde_json::to_string(&location).unwrap();
        assert!(json.contains("isDefinition"));
        assert!(json.contains("docstring"));
    }

    #[test]
    fn test_find_related_docs_params_deserialization() {
        let json = r#"{
            "filePath": "/src/auth.rs",
            "symbolName": "authenticate",
            "topK": 5
        }"#;

        let params: FindRelatedDocsParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.file_path, Some("/src/auth.rs".to_string()));
        assert_eq!(params.symbol_name, Some("authenticate".to_string()));
        assert_eq!(params.top_k, 5);
    }

    #[test]
    fn test_find_related_docs_params_defaults() {
        let json = r#"{}"#;

        let params: FindRelatedDocsParams = serde_json::from_str(json).unwrap();
        assert!(params.file_path.is_none());
        assert!(params.symbol_name.is_none());
        assert_eq!(params.top_k, 10); // default_top_k
    }

    #[test]
    fn test_related_document_serialization() {
        let doc = RelatedDocument {
            file_path: "/docs/README.md".to_string(),
            title: "Authentication Guide".to_string(),
            relevance_score: 0.85,
            excerpt: "How to use authentication...".to_string(),
            section: Some("Getting Started".to_string()),
        };

        let json = serde_json::to_string(&doc).unwrap();
        assert!(json.contains("relevanceScore"));
        assert!(json.contains("section"));
    }

    #[test]
    fn test_get_index_status_params_deserialization() {
        let json = r#"{
            "projectId": "my-project"
        }"#;

        let params: GetIndexStatusParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.project_id, Some("my-project".to_string()));
    }

    #[test]
    fn test_get_index_status_params_no_project_id() {
        let json = r#"{}"#;

        let params: GetIndexStatusParams = serde_json::from_str(json).unwrap();
        assert!(params.project_id.is_none());
    }

    #[test]
    fn test_index_statistics_serialization() {
        let stats = IndexStatistics {
            total_files: 100,
            code_files: 80,
            document_files: 20,
            total_symbols: 500,
            total_vectors: 500,
            index_size_bytes: 1024 * 1024,
        };

        let json = serde_json::to_string(&stats).unwrap();
        assert!(json.contains("totalFiles"));
        assert!(json.contains("totalSymbols"));
        assert!(json.contains("indexSizeBytes"));
    }

    #[test]
    fn test_project_index_status_serialization() {
        let status = ProjectIndexStatus {
            project_id: "proj1".to_string(),
            root_path: "/path/to/proj".to_string(),
            status: "indexed".to_string(),
            last_indexed_at: Some("2024-01-01T00:00:00Z".to_string()),
            stats: IndexStatistics {
                total_files: 50,
                code_files: 40,
                document_files: 10,
                total_symbols: 200,
                total_vectors: 200,
                index_size_bytes: 512 * 1024,
            },
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("projectId"));
        assert!(json.contains("lastIndexedAt"));
    }

    #[test]
    fn test_clear_index_params_deserialization() {
        let json = r#"{
            "projectId": "my-project",
            "confirm": true
        }"#;

        let params: ClearIndexParams = serde_json::from_str(json).unwrap();
        assert_eq!(params.project_id, Some("my-project".to_string()));
        assert!(params.confirm);
    }

    #[test]
    fn test_clear_index_params_defaults() {
        let json = r#"{}"#;

        let params: ClearIndexParams = serde_json::from_str(json).unwrap();
        assert!(params.project_id.is_none());
        assert!(!params.confirm); // default is false
    }

    #[test]
    fn test_clear_index_response_serialization() {
        let response = ClearIndexResponse {
            success: true,
            projects_cleared: 3,
            vectors_deleted: 1500,
            message: "Index cleared successfully".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("projectsCleared"));
        assert!(json.contains("vectorsDeleted"));
    }

    #[test]
    fn test_search_code_response_serialization() {
        let response = SearchCodeResponse {
            results: vec![
                SearchResult {
                    file_path: "/src/lib.rs".to_string(),
                    snippet: "pub fn foo() {}".to_string(),
                    score: 0.9,
                    language: "rust".to_string(),
                    symbol_type: Some("function".to_string()),
                    symbol_name: Some("foo".to_string()),
                    line_range: (1, 5),
                    metadata: None,
                },
            ],
            total_found: 1,
            search_time_ms: 50,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("totalFound"));
        assert!(json.contains("searchTimeMs"));
    }

    #[test]
    fn test_get_symbol_response_serialization() {
        let response = GetSymbolResponse {
            definitions: vec![],
            references: vec![],
            total_count: 0,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("totalCount"));
    }

    #[test]
    fn test_find_related_docs_response_serialization() {
        let response = FindRelatedDocsResponse {
            documents: vec![],
            total_found: 0,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("totalFound"));
    }

    #[test]
    fn test_get_index_status_response_serialization() {
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

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("overallStats"));
    }

    // Test invalid JSON handling
    #[test]
    fn test_invalid_json_deserialization() {
        let json = r#"{
            "rootPath": 123
        }"#;

        let result: Result<IndexProjectParams, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_missing_required_field() {
        let json = r#"{
            "languages": ["rust"]
        }"#;

        let result: Result<IndexProjectParams, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    // Test default helper functions
    #[test]
    fn test_default_true() {
        assert!(default_true());
    }

    #[test]
    fn test_default_top_k() {
        assert_eq!(default_top_k(), 10);
    }

    #[test]
    fn test_default_threshold() {
        assert!((default_threshold() - 0.5).abs() < 1e-5);
    }
}
