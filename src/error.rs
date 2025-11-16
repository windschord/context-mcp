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
        use rmcp::ErrorData;

        match err {
            ContextMcpError::Config(msg) => ErrorData {
                code: -32602, // Invalid params
                message: format!("Configuration error: {}", msg),
                data: None,
            },
            ContextMcpError::Mcp(msg) => ErrorData {
                code: -32000, // Server error
                message: msg,
                data: None,
            },
            ContextMcpError::Parse(msg) => ErrorData {
                code: -32700, // Parse error
                message: format!("Parse error: {}", msg),
                data: None,
            },
            ContextMcpError::Database(msg) => ErrorData {
                code: -32000, // Server error
                message: format!("Database error: {}", msg),
                data: None,
            },
            ContextMcpError::Indexing(msg) |
            ContextMcpError::Search(msg) |
            ContextMcpError::Embedding(msg) => ErrorData {
                code: -32000, // Server error
                message: msg,
                data: None,
            },
            ContextMcpError::TreeSitter(msg) => ErrorData {
                code: -32000, // Server error
                message: format!("Tree-sitter error: {}", msg),
                data: None,
            },
            ContextMcpError::FileSystem(msg) => ErrorData {
                code: -32000, // Server error
                message: format!("File system error: {}", msg),
                data: None,
            },
            ContextMcpError::Io(err) => ErrorData {
                code: -32000, // Server error
                message: format!("I/O error: {}", err),
                data: None,
            },
            ContextMcpError::Internal(msg) => ErrorData {
                code: -32603, // Internal error
                message: format!("Internal error: {}", msg),
                data: None,
            },
            ContextMcpError::Other(err) => ErrorData {
                code: -32603, // Internal error
                message: format!("Error: {}", err),
                data: None,
            },
        }
    }
}
