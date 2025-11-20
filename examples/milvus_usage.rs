/// Example usage of MilvusClient for vector storage and retrieval
///
/// This example demonstrates:
/// 1. Connecting to Milvus (local or Zilliz Cloud)
/// 2. Creating a collection with proper schema
/// 3. Inserting vector records
/// 4. Performing similarity search
/// 5. Managing collection lifecycle
///
/// Run with: cargo run --example milvus_usage
///
/// Prerequisites:
/// - Milvus running at localhost:19530 (or update the address)
/// - Start Milvus with: docker-compose up -d
use context_mcp::storage::{CollectionConfig, MilvusClient, SearchQuery, VectorRecord};
use std::collections::HashMap;

#[tokio::main]
async fn main() -> context_mcp::Result<()> {
    // Initialize tracing for logging
    tracing_subscriber::fmt()
        .with_env_filter("info,context_mcp=debug")
        .init();

    println!("=== Milvus Client Usage Example ===\n");

    // Example 1: Connect to local Milvus
    println!("1. Connecting to Milvus...");
    let client = MilvusClient::new("http://localhost:19530").await?;
    println!("   ✓ Connected successfully\n");

    // Example 2: Create a collection
    println!("2. Creating collection...");
    let collection_name = "example_code_vectors";
    let mut config = CollectionConfig::code_vectors(384); // 384-dimensional vectors
    config.name = collection_name.to_string();

    client.create_collection(config).await?;
    println!("   ✓ Collection '{}' created\n", collection_name);

    // Example 3: Insert vector records
    println!("3. Inserting vector records...");

    let records = vec![
        create_sample_record(
            "example.rs:10",
            vec![0.1; 384], // Dummy 384-dim vector
            "example.rs",
            "rust",
            "function",
            "parse_config",
            10,
            25,
            "pub fn parse_config(path: &str) -> Result<Config>",
            "Parse configuration from file path",
        ),
        create_sample_record(
            "example.rs:30",
            vec![0.2; 384],
            "example.rs",
            "rust",
            "struct",
            "Config",
            30,
            45,
            "pub struct Config { /* fields */ }",
            "Configuration structure",
        ),
        create_sample_record(
            "main.rs:5",
            vec![0.3; 384],
            "main.rs",
            "rust",
            "function",
            "main",
            5,
            15,
            "fn main() { /* implementation */ }",
            "Main entry point",
        ),
    ];

    let inserted_ids = client.insert(collection_name, records).await?;
    println!("   ✓ Inserted {} records", inserted_ids.len());
    for id in &inserted_ids {
        println!("     - {}", id);
    }
    println!();

    // Flush to ensure data is persisted
    println!("4. Flushing collection...");
    client.flush(collection_name).await?;
    println!("   ✓ Collection flushed\n");

    // Example 4: Get collection statistics
    println!("5. Getting collection statistics...");
    let stats = client.get_collection_stats(collection_name).await?;
    println!("   Collection: {}", stats.name);
    println!("   Entity count: {}", stats.entity_count);
    println!("   Indexed: {}", stats.indexed);
    println!();

    // Example 5: Perform similarity search
    println!("6. Performing similarity search...");

    // Create a query vector (similar to first record)
    let query_vector = vec![0.1; 384];
    let search_query =
        SearchQuery::new(query_vector, 5).with_filter("language == 'rust'".to_string());

    let results = client.search(collection_name, search_query).await?;
    println!("   ✓ Found {} results", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("   {}. {} (score: {:.4})", i + 1, result.id, result.score);
        println!(
            "      Symbol: {} ({})",
            result.record.symbol_name, result.record.symbol_type
        );
        println!("      Snippet: {}", result.record.snippet);
    }
    println!();

    // Example 6: Search with specific output fields
    println!("7. Searching with custom output fields...");
    let custom_query = SearchQuery::new(vec![0.2; 384], 3).with_output_fields(vec![
        "id".to_string(),
        "symbol_name".to_string(),
        "symbol_type".to_string(),
    ]);

    let custom_results = client.search(collection_name, custom_query).await?;
    println!(
        "   ✓ Found {} results with custom fields",
        custom_results.len()
    );
    println!();

    // Example 7: Delete specific records
    println!("8. Deleting records...");
    let ids_to_delete = vec!["example.rs:30".to_string()];
    client
        .delete(collection_name, ids_to_delete.clone())
        .await?;
    println!("   ✓ Deleted records: {:?}", ids_to_delete);
    println!();

    // Example 8: Clean up - drop collection
    println!("9. Cleaning up...");
    client.drop_collection(collection_name).await?;
    println!("   ✓ Collection '{}' dropped\n", collection_name);

    println!("=== Example completed successfully! ===");

    Ok(())
}

/// Helper function to create a sample VectorRecord
fn create_sample_record(
    id: &str,
    vector: Vec<f32>,
    file_path: &str,
    language: &str,
    symbol_type: &str,
    symbol_name: &str,
    line_start: i64,
    line_end: i64,
    snippet: &str,
    docstring: &str,
) -> VectorRecord {
    let mut metadata = HashMap::new();
    metadata.insert("example".to_string(), "true".to_string());

    VectorRecord::new(
        id.to_string(),
        vector,
        "example_project".to_string(),
        file_path.to_string(),
        language.to_string(),
        symbol_type.to_string(),
        symbol_name.to_string(),
        line_start,
        line_end,
        snippet.to_string(),
        docstring.to_string(),
    )
    .with_metadata("source".to_string(), "example".to_string())
}

// Alternative: Example for Zilliz Cloud connection
#[allow(dead_code)]
async fn connect_to_zilliz_cloud() -> context_mcp::Result<MilvusClient> {
    // For Zilliz Cloud, use HTTPS endpoint and token
    let address = "https://your-instance.zilliz.cloud:19530";
    let token = std::env::var("ZILLIZ_TOKEN").expect("ZILLIZ_TOKEN environment variable not set");

    let client = MilvusClient::new_with_token(address, &token).await?;
    println!("Connected to Zilliz Cloud");

    Ok(client)
}

// Example: Batch operations
#[allow(dead_code)]
async fn batch_insert_example(
    client: &MilvusClient,
    collection_name: &str,
) -> context_mcp::Result<()> {
    println!("Batch insert example...");

    // Create a large batch of records
    let mut records = Vec::new();
    for i in 0..1000 {
        let record = VectorRecord::new(
            format!("batch_{}:10", i),
            vec![0.1 * i as f32; 384],
            "batch_project".to_string(),
            format!("file_{}.rs", i),
            "rust".to_string(),
            "function".to_string(),
            format!("func_{}", i),
            10,
            20,
            format!("fn func_{}() {{}}", i),
            format!("Function {}", i),
        );
        records.push(record);
    }

    // Insert in batches
    let batch_size = 100;
    for (i, chunk) in records.chunks(batch_size).enumerate() {
        let ids = client.insert(collection_name, chunk.to_vec()).await?;
        println!("  Batch {} inserted: {} records", i, ids.len());
    }

    client.flush(collection_name).await?;
    println!("✓ Batch insert completed");

    Ok(())
}

// Example: Advanced filtering
#[allow(dead_code)]
async fn advanced_filtering_example(
    client: &MilvusClient,
    collection_name: &str,
) -> context_mcp::Result<()> {
    println!("Advanced filtering example...");

    // Complex filter expression
    let filter = "language == 'rust' && symbol_type in ['function', 'struct'] && line_start > 10";

    let query = SearchQuery::new(vec![0.1; 384], 10).with_filter(filter.to_string());

    let results = client.search(collection_name, query).await?;
    println!("✓ Found {} results with advanced filter", results.len());

    Ok(())
}
