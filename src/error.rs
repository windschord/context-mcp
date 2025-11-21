use std::io;
use thiserror::Error;

/// Error types for Context-MCP
#[derive(Debug, Error)]
pub enum ContextMcpError {
    /// Configuration-related errors
    #[error("Configuration error: {0}")]
    Config(String),

    /// MCP protocol errors
    #[error("MCP protocol error: {0}")]
    Mcp(String),

    /// I/O errors
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    /// Parsing errors (AST, JSON, etc.)
    #[error("Parse error: {0}")]
    Parse(String),

    /// Database errors (vector store, SQLite)
    #[error("Database error: {0}")]
    Database(String),

    /// Embedding model errors
    #[error("Embedding error: {0}")]
    Embedding(String),

    /// Indexing service errors
    #[error("Indexing error: {0}")]
    Indexing(String),

    /// Search service errors
    #[error("Search error: {0}")]
    Search(String),

    /// Tree-sitter parsing errors
    #[error("Tree-sitter error: {0}")]
    TreeSitter(String),

    /// File system errors
    #[error("File system error: {0}")]
    FileSystem(String),

    /// Generic internal errors
    #[error("Internal error: {0}")]
    Internal(String),

    /// Wrapped anyhow errors for compatibility
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// Result type alias for Context-MCP operations
pub type Result<T> = std::result::Result<T, ContextMcpError>;

/// Convert ContextMcpError to MCP protocol error
impl From<ContextMcpError> for rmcp::ErrorData {
    fn from(err: ContextMcpError) -> Self {
        use rmcp::model::{ErrorCode, ErrorData};
        use std::borrow::Cow;

        match err {
            ContextMcpError::Config(msg) => ErrorData {
                code: ErrorCode::INVALID_PARAMS,
                message: Cow::Owned(format!("Configuration error: {}", msg)),
                data: None,
            },
            ContextMcpError::Mcp(msg) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(msg),
                data: None,
            },
            ContextMcpError::Parse(msg) => ErrorData {
                code: ErrorCode::PARSE_ERROR,
                message: Cow::Owned(format!("Parse error: {}", msg)),
                data: None,
            },
            ContextMcpError::Database(msg) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(format!("Database error: {}", msg)),
                data: None,
            },
            ContextMcpError::Indexing(msg)
            | ContextMcpError::Search(msg)
            | ContextMcpError::Embedding(msg) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(msg),
                data: None,
            },
            ContextMcpError::TreeSitter(msg) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(format!("Tree-sitter error: {}", msg)),
                data: None,
            },
            ContextMcpError::FileSystem(msg) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(format!("File system error: {}", msg)),
                data: None,
            },
            ContextMcpError::Io(err) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(format!("I/O error: {}", err)),
                data: None,
            },
            ContextMcpError::Internal(msg) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(format!("Internal error: {}", msg)),
                data: None,
            },
            ContextMcpError::Other(err) => ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::Owned(format!("Error: {}", err)),
                data: None,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::ErrorCode;
    use std::io;

    // ============================================================================
    // Task 12.11: Error Type Comprehensive Tests
    // ============================================================================

    #[test]
    fn test_config_error_variant() {
        let err = ContextMcpError::Config("Invalid configuration".to_string());
        assert_eq!(
            err.to_string(),
            "Configuration error: Invalid configuration"
        );
    }

    #[test]
    fn test_mcp_error_variant() {
        let err = ContextMcpError::Mcp("Protocol error".to_string());
        assert_eq!(err.to_string(), "MCP protocol error: Protocol error");
    }

    #[test]
    fn test_parse_error_variant() {
        let err = ContextMcpError::Parse("JSON parsing failed".to_string());
        assert_eq!(err.to_string(), "Parse error: JSON parsing failed");
    }

    #[test]
    fn test_database_error_variant() {
        let err = ContextMcpError::Database("Connection failed".to_string());
        assert_eq!(err.to_string(), "Database error: Connection failed");
    }

    #[test]
    fn test_embedding_error_variant() {
        let err = ContextMcpError::Embedding("Model load failed".to_string());
        assert_eq!(err.to_string(), "Embedding error: Model load failed");
    }

    #[test]
    fn test_indexing_error_variant() {
        let err = ContextMcpError::Indexing("Index creation failed".to_string());
        assert_eq!(err.to_string(), "Indexing error: Index creation failed");
    }

    #[test]
    fn test_search_error_variant() {
        let err = ContextMcpError::Search("Search query failed".to_string());
        assert_eq!(err.to_string(), "Search error: Search query failed");
    }

    #[test]
    fn test_tree_sitter_error_variant() {
        let err = ContextMcpError::TreeSitter("Parser error".to_string());
        assert_eq!(err.to_string(), "Tree-sitter error: Parser error");
    }

    #[test]
    fn test_file_system_error_variant() {
        let err = ContextMcpError::FileSystem("File not found".to_string());
        assert_eq!(err.to_string(), "File system error: File not found");
    }

    #[test]
    fn test_internal_error_variant() {
        let err = ContextMcpError::Internal("Internal error occurred".to_string());
        assert_eq!(err.to_string(), "Internal error: Internal error occurred");
    }

    #[test]
    fn test_io_error_conversion() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let err: ContextMcpError = io_err.into();
        assert!(err.to_string().contains("I/O error"));
        assert!(err.to_string().contains("file not found"));
    }

    #[test]
    fn test_anyhow_error_conversion() {
        let anyhow_err = anyhow::anyhow!("generic error");
        let err: ContextMcpError = anyhow_err.into();
        assert!(err.to_string().contains("generic error"));
    }

    // ============================================================================
    // Error Conversion to rmcp::ErrorData Tests
    // ============================================================================

    #[test]
    fn test_config_error_to_error_data() {
        let err = ContextMcpError::Config("test config error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INVALID_PARAMS);
        assert!(error_data.message.contains("Configuration error"));
        assert!(error_data.message.contains("test config error"));
    }

    #[test]
    fn test_mcp_error_to_error_data() {
        let err = ContextMcpError::Mcp("test mcp error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert_eq!(&*error_data.message, "test mcp error");
    }

    #[test]
    fn test_parse_error_to_error_data() {
        let err = ContextMcpError::Parse("test parse error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::PARSE_ERROR);
        assert!(error_data.message.contains("Parse error"));
        assert!(error_data.message.contains("test parse error"));
    }

    #[test]
    fn test_database_error_to_error_data() {
        let err = ContextMcpError::Database("test db error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("Database error"));
        assert!(error_data.message.contains("test db error"));
    }

    #[test]
    fn test_embedding_error_to_error_data() {
        let err = ContextMcpError::Embedding("test embedding error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("test embedding error"));
    }

    #[test]
    fn test_indexing_error_to_error_data() {
        let err = ContextMcpError::Indexing("test indexing error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("test indexing error"));
    }

    #[test]
    fn test_search_error_to_error_data() {
        let err = ContextMcpError::Search("test search error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("test search error"));
    }

    #[test]
    fn test_tree_sitter_error_to_error_data() {
        let err = ContextMcpError::TreeSitter("test tree-sitter error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("Tree-sitter error"));
        assert!(error_data.message.contains("test tree-sitter error"));
    }

    #[test]
    fn test_file_system_error_to_error_data() {
        let err = ContextMcpError::FileSystem("test fs error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("File system error"));
        assert!(error_data.message.contains("test fs error"));
    }

    #[test]
    fn test_io_error_to_error_data() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "test io error");
        let err: ContextMcpError = io_err.into();
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("I/O error"));
        assert!(error_data.message.contains("test io error"));
    }

    #[test]
    fn test_internal_error_to_error_data() {
        let err = ContextMcpError::Internal("test internal error".to_string());
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("Internal error"));
        assert!(error_data.message.contains("test internal error"));
    }

    #[test]
    fn test_other_error_to_error_data() {
        let anyhow_err = anyhow::anyhow!("test other error");
        let err: ContextMcpError = anyhow_err.into();
        let error_data: rmcp::ErrorData = err.into();
        assert_eq!(error_data.code, ErrorCode::INTERNAL_ERROR);
        assert!(error_data.message.contains("Error"));
        assert!(error_data.message.contains("test other error"));
    }

    // ============================================================================
    // Error Message Content Validation
    // ============================================================================

    #[test]
    fn test_error_messages_contain_context() {
        // Test that error messages provide meaningful context
        let test_cases = vec![
            (
                ContextMcpError::Config("Missing API key".to_string()),
                vec!["Configuration error", "Missing API key"],
            ),
            (
                ContextMcpError::Database("Connection timeout".to_string()),
                vec!["Database error", "Connection timeout"],
            ),
            (
                ContextMcpError::TreeSitter("Invalid syntax".to_string()),
                vec!["Tree-sitter error", "Invalid syntax"],
            ),
        ];

        for (error, expected_fragments) in test_cases {
            let error_data: rmcp::ErrorData = error.into();
            for fragment in expected_fragments {
                assert!(
                    error_data.message.contains(fragment),
                    "Error message '{}' should contain '{}'",
                    error_data.message,
                    fragment
                );
            }
        }
    }

    // ============================================================================
    // Error Code Mapping Tests
    // ============================================================================

    #[test]
    fn test_error_code_mappings() {
        // Test that error variants map to appropriate error codes
        let test_cases = vec![
            (
                ContextMcpError::Config("test".to_string()),
                ErrorCode::INVALID_PARAMS,
            ),
            (
                ContextMcpError::Parse("test".to_string()),
                ErrorCode::PARSE_ERROR,
            ),
            (
                ContextMcpError::Database("test".to_string()),
                ErrorCode::INTERNAL_ERROR,
            ),
            (
                ContextMcpError::Indexing("test".to_string()),
                ErrorCode::INTERNAL_ERROR,
            ),
        ];

        for (error, expected_code) in test_cases {
            let error_data: rmcp::ErrorData = error.into();
            assert_eq!(error_data.code, expected_code);
        }
    }
}
