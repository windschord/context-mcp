/// Context-MCP: Model Context Protocol plugin for Claude Code
///
/// This library provides semantic code search and AST analysis through the MCP protocol.

pub mod embedding;
pub mod error;
pub mod parser;
pub mod server;
pub mod storage;
pub mod tools;

pub use error::{ContextMcpError, Result};
pub use server::ContextMcpServer;
