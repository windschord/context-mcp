/// Example: MCP Server Usage
///
/// This example demonstrates how to use the Context-MCP server
/// with all 6 MCP tools.
///
/// # Setup
///
/// 1. Start Milvus:
///    ```bash
///    docker-compose up -d
///    ```
///
/// 2. Download ONNX model files:
///    ```bash
///    mkdir -p models
///    # Download all-MiniLM-L6-v2 ONNX model and tokenizer
///    ```
///
/// 3. Create configuration:
///    ```bash
///    cargo run --example create_config
///    ```
///
/// 4. Run this example:
///    ```bash
///    cargo run --example mcp_server_usage
///    ```

use context_mcp::{ContextMcpServer, ServerConfig, Result};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing subscriber for logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("=== Context-MCP Server Usage Example ===\n");

    // Example 1: Create server with default configuration
    println!("1. Creating server with default configuration...");
    let server = ContextMcpServer::new();
    println!("   Server created\n");

    // Example 2: Create server with custom configuration
    println!("2. Creating server with custom configuration...");
    let config = ServerConfig {
        milvus: context_mcp::config::MilvusConfig {
            address: "localhost:19530".to_string(),
            token: None,
            shard_num: 2,
        },
        embedding: context_mcp::config::EmbeddingConfig {
            model_path: "./models/all-MiniLM-L6-v2.onnx".into(),
            tokenizer_path: "./models/tokenizer.json".into(),
            max_length: 256,
            batch_size: 32,
        },
        bm25: context_mcp::config::BM25Config {
            db_path: "./data/bm25_index.db".into(),
            k1: 1.5,
            b: 0.75,
        },
        indexing: context_mcp::config::IndexingConfig {
            batch_size: 32,
            max_parallel: 8,
            collection_name: "code_vectors".to_string(),
            dimension: 384,
        },
        hybrid: context_mcp::config::HybridConfig {
            alpha: 0.3,
            normalization: "MinMax".to_string(),
            bm25_top_k: 20,
            vector_top_k: 20,
        },
    };

    let server = ContextMcpServer::with_config(config);
    println!("   Server created with custom config\n");

    // Example 3: Initialize server components
    println!("3. Initializing server components...");
    println!("   This will:");
    println!("   - Initialize SymbolExtractor for AST parsing");
    println!("   - Load ONNX embedding model");
    println!("   - Connect to Milvus vector database");
    println!("   - Initialize BM25 search index");
    println!("   - Create hybrid search engine");
    println!("   - Set up indexing service");

    match server.initialize().await {
        Ok(()) => {
            println!("   ✓ All components initialized successfully\n");
        }
        Err(e) => {
            eprintln!("   ✗ Initialization failed: {}", e);
            eprintln!("\n   Common issues:");
            eprintln!("   - Milvus not running: docker-compose up -d");
            eprintln!("   - Missing model files: Download ONNX model");
            eprintln!("   - OpenSSL not installed: apt-get install libssl-dev");
            return Err(e);
        }
    }

    // Example 4: Load configuration from file
    println!("4. Loading configuration from file...");
    println!("   Looking for .context-mcp.json in:");
    println!("   - Current directory");
    println!("   - Home directory");
    println!("   - Fallback to defaults");

    match ServerConfig::load_with_fallback() {
        Ok(config) => {
            println!("   ✓ Configuration loaded");
            println!("   Summary: {}\n", config.summary());
        }
        Err(e) => {
            eprintln!("   ✗ Failed to load config: {}", e);
        }
    }

    // Example 5: Save default configuration
    println!("5. Saving default configuration...");
    match ServerConfig::save_default(".context-mcp.example.json") {
        Ok(()) => {
            println!("   ✓ Default configuration saved to .context-mcp.example.json");
            println!("   You can copy this file to .context-mcp.json and customize it\n");
        }
        Err(e) => {
            eprintln!("   ✗ Failed to save config: {}", e);
        }
    }

    println!("=== MCP Tool Examples ===\n");

    println!("The following tools are available via MCP protocol:");
    println!();
    println!("1. index_project");
    println!("   Index a project directory for semantic search");
    println!("   Example: {{");
    println!("     \"rootPath\": \"/path/to/project\",");
    println!("     \"languages\": [\"rust\", \"python\"],");
    println!("     \"excludePatterns\": [\"target/\", \"*.test.rs\"],");
    println!("     \"includeDocuments\": true");
    println!("   }}");
    println!();

    println!("2. search_code");
    println!("   Search code using natural language queries");
    println!("   Example: {{");
    println!("     \"query\": \"parse configuration file\",");
    println!("     \"topK\": 10,");
    println!("     \"scoreThreshold\": 0.5");
    println!("   }}");
    println!();

    println!("3. get_symbol");
    println!("   Find symbol definitions and references");
    println!("   Example: {{");
    println!("     \"symbolName\": \"parse_config_file\",");
    println!("     \"symbolType\": \"function\"");
    println!("   }}");
    println!();

    println!("4. find_related_docs");
    println!("   Find related documentation files");
    println!("   Example: {{");
    println!("     \"filePath\": \"src/config/parser.rs\",");
    println!("     \"topK\": 5");
    println!("   }}");
    println!();

    println!("5. get_index_status");
    println!("   Get indexing status and statistics");
    println!("   Example: {{");
    println!("     \"projectId\": \"my-project\"");
    println!("   }}");
    println!();

    println!("6. clear_index");
    println!("   Clear indexed data");
    println!("   Example: {{");
    println!("     \"projectId\": \"my-project\",");
    println!("     \"confirm\": true");
    println!("   }}");
    println!();

    println!("=== Running MCP Server ===\n");
    println!("To run the MCP server and make these tools available:");
    println!("1. cargo run");
    println!("2. Server listens on stdio for MCP protocol messages");
    println!("3. Connect using an MCP client (e.g., Claude Code)");
    println!();

    println!("=== Next Steps ===\n");
    println!("1. Customize .context-mcp.json for your setup");
    println!("2. Ensure Milvus is running: docker-compose up -d");
    println!("3. Download ONNX model files to ./models/");
    println!("4. Start the server: cargo run");
    println!("5. Use index_project to index your codebase");
    println!("6. Use search_code to perform semantic searches");
    println!();

    Ok(())
}
