/// Example: Using the Indexing Service
///
/// This example demonstrates how to use the IndexingService to index a project.
/// It shows:
/// - Creating and configuring the indexing service
/// - Indexing an entire project with progress tracking
/// - Indexing individual files
/// - Error handling and resilience
/// - Retrieving index statistics
///
/// # Prerequisites
///
/// 1. ONNX model files must be available:
///    - ./models/all-MiniLM-L6-v2.onnx
///    - ./models/tokenizer.json
///
/// 2. Milvus must be running:
///    ```bash
///    docker-compose up -d
///    ```
///
/// 3. BM25 SQLite database path must be writable
///
/// # Running this example
///
/// ```bash
/// cargo run --example indexing_usage
/// ```
use context_mcp::embedding::{EmbeddingConfig, EmbeddingEngine};
use context_mcp::indexing::{IndexConfig, IndexingService};
use context_mcp::parser::SymbolExtractor;
use context_mcp::search::bm25_engine::BM25Engine;
use context_mcp::storage::milvus_client::MilvusClient;
use context_mcp::storage::types::CollectionConfig;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("=== Indexing Service Example ===");
    info!("");

    // Step 1: Create components
    info!("Step 1: Initializing components...");

    // Create symbol extractor (AST parser)
    let parser = SymbolExtractor::new();
    info!("✓ Symbol extractor initialized");

    // Create embedding engine (local ONNX model)
    let embedding_config = EmbeddingConfig {
        model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
        tokenizer_path: PathBuf::from("./models/tokenizer.json"),
        max_length: 256,
        batch_size: 32,
    };

    let embedding = EmbeddingEngine::new(embedding_config).await?;
    info!("✓ Embedding engine initialized");

    // Create Milvus client (vector database)
    let milvus = MilvusClient::new("http://localhost:19530").await?;
    info!("✓ Milvus client connected");

    // Create or verify collection exists
    let collection_name = "code_vectors";
    if !milvus.collection_exists(collection_name).await? {
        info!("Creating collection '{}'", collection_name);
        let collection_config = CollectionConfig::code_vectors(384); // all-MiniLM-L6-v2 dimension
        milvus.create_collection(collection_config).await?;
        info!("✓ Collection created");
    } else {
        info!("✓ Collection '{}' exists", collection_name);
    }

    // Create BM25 engine (full-text search)
    let bm25 = BM25Engine::new(Path::new("./data/bm25_index.db"))?;
    info!("✓ BM25 engine initialized");

    info!("");

    // Step 2: Create indexing service
    info!("Step 2: Creating indexing service...");
    let service = IndexingService::new(
        Arc::new(parser),
        Arc::new(embedding),
        Arc::new(milvus),
        Arc::new(bm25),
    )
    .with_collection_name(collection_name.to_string());
    info!("✓ Indexing service created");
    info!("");

    // Step 3: Index a project
    info!("Step 3: Indexing project...");

    // Configure what to index
    let index_config = IndexConfig::new(PathBuf::from("./src"))
        .with_project_id("context-mcp".to_string())
        .with_batch_size(16)
        .with_max_parallel(4)
        .with_include_documents(true); // Include .md files

    // Start indexing
    info!("Starting indexing of './src'...");
    let result = service.index_project(index_config).await?;

    // Display results
    info!("");
    info!("=== Indexing Results ===");
    info!("{}", result.summary());
    info!("Total files discovered: {}", result.total_files);
    info!("Successfully indexed: {}", result.indexed_files);
    info!("Total symbols extracted: {}", result.total_symbols);
    info!("Errors encountered: {}", result.errors.len());
    info!("Success rate: {:.1}%", result.success_rate());
    info!("Throughput: {:.1} files/second", result.throughput());
    info!("Duration: {:.2} seconds", result.duration.as_secs_f64());

    // Show errors if any
    if !result.errors.is_empty() {
        info!("");
        info!("=== Errors ===");
        for (idx, error) in result.errors.iter().take(5).enumerate() {
            info!(
                "{}. {} - {:?}: {}",
                idx + 1,
                error.file_path,
                error.kind,
                error.message
            );
        }
        if result.errors.len() > 5 {
            info!("... and {} more errors", result.errors.len() - 5);
        }
    }

    info!("");

    // Step 4: Get index statistics
    info!("Step 4: Retrieving index statistics...");
    let stats = service.get_stats().await?;
    info!("{}", stats.summary());
    info!("Vector count: {}", stats.vector_count);
    info!("BM25 documents: {}", stats.bm25_document_count);
    info!("Unique terms: {}", stats.bm25_term_count);

    info!("");

    // Step 5: Index a single file (incremental update)
    info!("Step 5: Indexing a single file (incremental update)...");
    let single_file = PathBuf::from("./src/main.rs");

    if single_file.exists() {
        let file_result = service.index_file(&single_file, "context-mcp").await?;

        if file_result.success {
            info!(
                "✓ Successfully indexed {} ({} symbols, {}ms)",
                file_result.file_path, file_result.symbol_count, file_result.processing_time_ms
            );
        } else {
            info!("✗ Failed to index {}", file_result.file_path);
            if let Some(error) = file_result.error {
                info!("  Error: {:?} - {}", error.kind, error.message);
            }
        }
    } else {
        info!("File not found: {}", single_file.display());
    }

    info!("");

    // Step 6: Demonstrate language filtering
    info!("Step 6: Indexing with language filter...");
    let filtered_config = IndexConfig::new(PathBuf::from("./src"))
        .with_project_id("context-mcp-rust-only".to_string())
        .with_languages(vec![context_mcp::parser::Language::Rust])
        .with_include_documents(false); // Only Rust files, no docs

    info!("Indexing only Rust files...");
    let filtered_result = service.index_project(filtered_config).await?;
    info!("{}", filtered_result.summary());

    info!("");

    // Step 7: Demonstrate batch processing
    info!("Step 7: Batch indexing multiple files...");
    let files_to_index = vec![
        PathBuf::from("./src/lib.rs"),
        PathBuf::from("./src/error.rs"),
    ];

    let batch_config =
        IndexConfig::new(PathBuf::from(".")).with_project_id("context-mcp".to_string());

    let batch_result = service.index_files(files_to_index, &batch_config).await?;
    info!("Batch indexing result: {}", batch_result.summary());

    info!("");

    // Step 8: Advanced configuration example
    info!("Step 8: Advanced configuration...");
    let advanced_config = IndexConfig::new(PathBuf::from("./src"))
        .with_project_id("context-mcp-advanced".to_string())
        .with_languages(vec![
            context_mcp::parser::Language::Rust,
            context_mcp::parser::Language::TypeScript,
        ])
        .with_exclude_patterns(vec!["*.test.rs".to_string(), "target/**".to_string()])
        .with_batch_size(32)
        .with_max_parallel(8)
        .with_include_documents(true);

    info!("Configuration:");
    info!("  Root: {:?}", advanced_config.root_path);
    info!("  Languages: {:?}", advanced_config.languages);
    info!("  Exclude patterns: {:?}", advanced_config.exclude_patterns);
    info!("  Batch size: {}", advanced_config.batch_size);
    info!("  Max parallel: {}", advanced_config.max_parallel);
    info!("  Include documents: {}", advanced_config.include_documents);

    info!("");
    info!("=== Example Complete ===");
    info!("");
    info!("The indexing service has successfully indexed your project.");
    info!("You can now use the search service to query the indexed code.");
    info!("");
    info!("Next steps:");
    info!("1. Run the hybrid_search_usage example to search the indexed code");
    info!("2. Use the MCP tools to integrate with Claude Code");
    info!("3. Monitor index statistics with get_stats()");

    Ok(())
}
