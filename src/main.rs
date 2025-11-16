use anyhow::Result;
use context_mcp::ContextMcpServer;
use rmcp::ServiceExt;
use tokio::io::{stdin, stdout};
use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("Context-MCP Server starting...");
    info!("Version: {}", env!("CARGO_PKG_VERSION"));
    info!("Rust implementation with MCP protocol support");

    // Create MCP server instance
    let server = ContextMcpServer::new();

    // Initialize server state
    if let Err(e) = server.initialize().await {
        error!("Failed to initialize server: {}", e);
        return Err(e.into());
    }

    info!("MCP server initialized successfully");

    // Create stdio transport (standard MCP communication channel)
    let transport = (stdin(), stdout());

    info!("Starting MCP server on stdio...");

    // Start MCP server with stdio transport
    let service = server.serve(transport).await?;

    info!("MCP server running. Waiting for requests...");

    // Wait for server shutdown
    service.wait().await?;

    info!("MCP server shutdown complete");

    Ok(())
}
