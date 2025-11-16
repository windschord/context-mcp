use anyhow::Result;
use context_mcp::{ContextMcpServer, ServerConfig};
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

    // Load configuration
    info!("Loading configuration...");
    let config = ServerConfig::load_with_fallback()?;
    info!("Configuration loaded: {}", config.summary());

    // Create MCP server instance
    info!("Creating MCP server...");
    let server = ContextMcpServer::with_config(config);

    // Initialize server state
    info!("Initializing server components...");
    info!("This may take a few moments on first run...");

    if let Err(e) = server.initialize().await {
        error!("Failed to initialize server: {}", e);
        error!("");
        error!("Common issues and solutions:");
        error!("  1. Milvus not running:");
        error!("     → docker-compose up -d");
        error!("");
        error!("  2. Missing ONNX model files:");
        error!("     → Download all-MiniLM-L6-v2 model to ./models/");
        error!("     → https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2");
        error!("");
        error!("  3. OpenSSL development libraries not installed:");
        error!("     → Ubuntu/Debian: sudo apt-get install libssl-dev pkg-config");
        error!("     → Fedora/RHEL: sudo dnf install openssl-devel");
        error!("     → macOS: brew install openssl");
        error!("");
        error!("  4. Milvus connection refused:");
        error!("     → Check Milvus is running: docker ps");
        error!("     → Check address in config: {}",
               std::env::var("MILVUS_ADDRESS").unwrap_or_else(|_| "localhost:19530".to_string()));
        error!("");
        return Err(e.into());
    }

    info!("MCP server initialized successfully");
    info!("");
    info!("Available MCP tools:");
    info!("  1. index_project      - Index a project directory for semantic search");
    info!("  2. search_code        - Search code using natural language queries");
    info!("  3. get_symbol         - Find symbol definitions and references");
    info!("  4. find_related_docs  - Find related documentation files");
    info!("  5. get_index_status   - Get indexing status and statistics");
    info!("  6. clear_index        - Clear indexed data");
    info!("");

    // Create stdio transport (standard MCP communication channel)
    let transport = (stdin(), stdout());

    info!("Starting MCP server on stdio...");
    info!("Server is ready to receive MCP protocol messages");
    info!("Waiting for client connection...");

    // Start MCP server with stdio transport
    let service = server.serve(transport).await?;

    info!("MCP server running. Processing client requests...");

    // Wait for server shutdown
    service.waiting().await?;

    info!("MCP server shutdown complete");

    Ok(())
}
