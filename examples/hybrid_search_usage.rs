//! Hybrid Search Engine Usage Example
//!
//! This example demonstrates how to use the HybridSearchEngine to combine
//! BM25 keyword search with vector similarity search for optimal results.
//!
//! Run this example with:
//! ```bash
//! cargo run --example hybrid_search_usage
//! ```
//!
//! Prerequisites:
//! - Milvus server running at localhost:19530
//! - ONNX model and tokenizer files in ./models/
//! - SQLite database for BM25 index

use context_mcp::embedding::{EmbeddingConfig, EmbeddingEngine};
use context_mcp::search::{BM25Engine, HybridConfig, HybridSearchEngine, NormalizationType};
use context_mcp::storage::{CollectionConfig, MilvusClient, VectorRecord};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing for logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("=== Hybrid Search Engine Example ===\n");

    // Step 1: Initialize BM25 engine
    println!("1. Initializing BM25 engine...");
    let bm25 = BM25Engine::new(Path::new("hybrid_example.db"))?;

    // Index some sample documents
    println!("   Indexing sample documents...");
    bm25.index_document(
        "config_parser.rs",
        "pub fn parse_config_file(path: &Path) -> Result<Config> { ... }",
    )?;
    bm25.index_document(
        "file_reader.rs",
        "fn read_configuration(file: &str) -> Config { ... }",
    )?;
    bm25.index_document(
        "http_client.rs",
        "async fn fetch_data(url: &str) -> Result<Response> { ... }",
    )?;
    bm25.index_document(
        "error_handler.rs",
        "pub struct ErrorHandler { /* fields */ }",
    )?;
    bm25.index_document(
        "logger.rs",
        "pub fn setup_logger(level: LogLevel) -> Logger { ... }",
    )?;
    println!("   Indexed {} documents\n", bm25.document_count()?);

    // Step 2: Initialize Milvus client
    println!("2. Connecting to Milvus...");
    let milvus = MilvusClient::new("http://localhost:19530").await?;

    // Create collection if it doesn't exist
    let collection_name = "hybrid_example_vectors";
    if !milvus.collection_exists(collection_name).await? {
        println!("   Creating collection '{}'...", collection_name);
        let config = CollectionConfig::code_vectors(384);
        let config = CollectionConfig {
            name: collection_name.to_string(),
            ..config
        };
        milvus.create_collection(config).await?;
    }
    println!("   Connected to collection '{}'\n", collection_name);

    // Step 3: Initialize embedding engine
    println!("3. Loading embedding model...");
    let embedding_config = EmbeddingConfig {
        model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
        tokenizer_path: PathBuf::from("./models/tokenizer.json"),
        max_length: 256,
        batch_size: 32,
    };
    let embedding = EmbeddingEngine::new(embedding_config).await?;
    println!("   Model loaded successfully\n");

    // Step 4: Insert some vectors into Milvus (simulating indexed code)
    println!("4. Inserting sample vectors...");
    let sample_records = create_sample_records(&embedding).await?;
    milvus.insert(collection_name, sample_records).await?;
    println!("   Vectors inserted\n");

    // Step 5: Create hybrid search engine
    println!("5. Creating hybrid search engine...");
    let hybrid = HybridSearchEngine::new(Arc::new(bm25), Arc::new(milvus), Arc::new(embedding));
    println!("   Engine ready\n");

    // Step 6: Perform searches with different configurations
    println!("=== Search Examples ===\n");

    // Example 1: Default configuration (30% keyword, 70% semantic)
    println!("Example 1: Default hybrid search (alpha=0.3)");
    println!("Query: 'parse configuration file'");
    let results = hybrid
        .search("parse configuration file", collection_name, 5)
        .await?;
    print_results(&results, "Default Hybrid");

    // Example 2: Keyword-heavy search (60% keyword, 40% semantic)
    println!("\nExample 2: Keyword-heavy search (alpha=0.6)");
    println!("Query: 'parse config'");
    let config = HybridConfig::new(0.6, 5);
    let results = hybrid
        .search_with_config("parse config", collection_name, config)
        .await?;
    print_results(&results, "Keyword-Heavy");

    // Example 3: Semantic-heavy search (20% keyword, 80% semantic)
    println!("\nExample 3: Semantic-heavy search (alpha=0.2)");
    println!("Query: 'load settings from disk'");
    let config = HybridConfig::new(0.2, 5);
    let results = hybrid
        .search_with_config("load settings from disk", collection_name, config)
        .await?;
    print_results(&results, "Semantic-Heavy");

    // Example 4: Pure keyword search (alpha=1.0)
    println!("\nExample 4: Pure keyword search (alpha=1.0)");
    println!("Query: 'config'");
    let config = HybridConfig::new(1.0, 5);
    let results = hybrid
        .search_with_config("config", collection_name, config)
        .await?;
    print_results(&results, "Pure Keyword");

    // Example 5: Pure semantic search (alpha=0.0)
    println!("\nExample 5: Pure semantic search (alpha=0.0)");
    println!("Query: 'reading application configuration'");
    let config = HybridConfig::new(0.0, 5);
    let results = hybrid
        .search_with_config("reading application configuration", collection_name, config)
        .await?;
    print_results(&results, "Pure Semantic");

    // Example 6: Z-score normalization
    println!("\nExample 6: Using Z-score normalization");
    println!("Query: 'parse configuration'");
    let config = HybridConfig::new(0.3, 5).with_normalization(NormalizationType::ZScore);
    let results = hybrid
        .search_with_config("parse configuration", collection_name, config)
        .await?;
    print_results(&results, "Z-Score Normalization");

    // Example 7: Fetching more candidates for better recall
    println!("\nExample 7: Fetching more candidates (3x top_k from each source)");
    println!("Query: 'error handling'");
    let config = HybridConfig::new(0.3, 5)
        .with_bm25_top_k(15)
        .with_vector_top_k(15);
    let results = hybrid
        .search_with_config("error handling", collection_name, config)
        .await?;
    print_results(&results, "Extended Candidates");

    println!("\n=== Example Complete ===");
    println!("\nNote: This example demonstrates various hybrid search configurations.");
    println!("In production, you would tune alpha based on your use case:");
    println!("  - Higher alpha (0.5-0.8): When exact keyword matches are important");
    println!("  - Lower alpha (0.2-0.4): When semantic understanding is important");
    println!("  - Default (0.3): Balanced approach favoring semantic search");

    Ok(())
}

/// Create sample vector records for demonstration
async fn create_sample_records(embedding: &EmbeddingEngine) -> anyhow::Result<Vec<VectorRecord>> {
    let samples = [
        (
            "config_parser.rs",
            "pub fn parse_config_file(path: &Path) -> Result<Config>",
            "rust",
            "function",
            "parse_config_file",
        ),
        (
            "file_reader.rs",
            "fn read_configuration(file: &str) -> Config",
            "rust",
            "function",
            "read_configuration",
        ),
        (
            "http_client.rs",
            "async fn fetch_data(url: &str) -> Result<Response>",
            "rust",
            "function",
            "fetch_data",
        ),
        (
            "error_handler.rs",
            "pub struct ErrorHandler",
            "rust",
            "struct",
            "ErrorHandler",
        ),
        (
            "logger.rs",
            "pub fn setup_logger(level: LogLevel) -> Logger",
            "rust",
            "function",
            "setup_logger",
        ),
    ];

    let mut records = Vec::new();

    for (i, (file, snippet, lang, symbol_type, symbol_name)) in samples.iter().enumerate() {
        let embedding_result = embedding.embed(snippet).await?;

        let record = VectorRecord::new(
            format!("{}:{}", file, i * 10),
            embedding_result.vector,
            "example_project".to_string(),
            format!("/src/{}", file),
            lang.to_string(),
            symbol_type.to_string(),
            symbol_name.to_string(),
            (i * 10) as i64,
            (i * 10 + 5) as i64,
            snippet.to_string(),
            "".to_string(),
        );

        records.push(record);
    }

    Ok(records)
}

/// Print search results in a formatted table
fn print_results(results: &[context_mcp::search::HybridResult], label: &str) {
    println!("\n{} Results:", label);
    println!("{:-<100}", "");
    println!(
        "{:<4} {:<30} {:<10} {:<12} {:<12} {:<20}",
        "Rank", "File", "Score", "BM25", "Vector", "Matched Terms"
    );
    println!("{:-<100}", "");

    for (i, result) in results.iter().enumerate() {
        let bm25_str = result
            .bm25_score
            .map(|s| format!("{:.4}", s))
            .unwrap_or_else(|| "-".to_string());
        let vector_str = result
            .vector_score
            .map(|s| format!("{:.4}", s))
            .unwrap_or_else(|| "-".to_string());
        let matched = if result.matched_terms.is_empty() {
            "-".to_string()
        } else {
            result.matched_terms.join(", ")
        };

        println!(
            "{:<4} {:<30} {:<10.4} {:<12} {:<12} {:<20}",
            i + 1,
            result.record.file_path,
            result.score,
            bm25_str,
            vector_str,
            matched
        );
    }

    println!("{:-<100}", "");

    // Print statistics
    let hybrid_count = results.iter().filter(|r| r.is_hybrid()).count();
    let bm25_only = results
        .iter()
        .filter(|r| r.has_bm25() && !r.has_vector())
        .count();
    let vector_only = results
        .iter()
        .filter(|r| r.has_vector() && !r.has_bm25())
        .count();

    println!("Statistics:");
    println!("  Total results: {}", results.len());
    println!("  Hybrid (both sources): {}", hybrid_count);
    println!("  BM25 only: {}", bm25_only);
    println!("  Vector only: {}", vector_only);
}
