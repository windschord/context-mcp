/// Example usage of BM25 full-text search engine
///
/// This example demonstrates:
/// 1. Creating a BM25 search engine
/// 2. Indexing code documents
/// 3. Performing searches with ranking
/// 4. Using metadata for filtering/context
/// 5. Batch indexing operations
/// 6. Custom tokenizer and BM25 configuration
///
/// Run with: cargo run --example bm25_usage
use context_mcp::search::{BM25Config, BM25Engine, Document, SearchOptions, Tokenizer};
use std::collections::HashMap;

fn main() -> context_mcp::Result<()> {
    // Initialize tracing for logging
    tracing_subscriber::fmt()
        .with_env_filter("info,context_mcp=debug")
        .init();

    println!("=== BM25 Full-Text Search Engine Example ===\n");

    // Example 1: Basic usage with in-memory database
    println!("1. Creating in-memory BM25 engine...");
    let engine = BM25Engine::new_in_memory()?;
    println!("   ✓ Engine created\n");

    // Example 2: Index some code documents
    println!("2. Indexing code documents...");

    engine.index_document(
        "src/parser.rs:10",
        "pub fn parse_config(path: &str) -> Result<Config>",
    )?;
    engine.index_document(
        "src/config.rs:20",
        "pub struct Config { database_url: String, port: u16 }",
    )?;
    engine.index_document(
        "src/main.rs:5",
        "fn main() { let config = parse_config('config.toml'); }",
    )?;
    engine.index_document(
        "src/server.rs:15",
        "pub fn start_server(config: Config) -> Result<()>",
    )?;
    engine.index_document(
        "src/db.rs:30",
        "fn connect_database(url: &str) -> Result<Connection>",
    )?;

    println!("   ✓ Indexed {} documents\n", engine.document_count()?);

    // Example 3: Basic search
    println!("3. Searching for 'config'...");
    let results = engine.search("config", 5)?;
    println!("   ✓ Found {} results", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("   {}. {} (score: {:.4})", i + 1, result.id, result.score);
        println!("      Matched terms: {:?}", result.matched_terms);
        println!(
            "      Snippet: {}",
            &result.text[..result.text.len().min(60)]
        );
    }
    println!();

    // Example 4: Search with camelCase/snake_case handling
    println!("4. Searching for 'parseConfig' (tests camelCase splitting)...");
    let results = engine.search("parseConfig", 5)?;
    println!("   ✓ Found {} results", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("   {}. {} (score: {:.4})", i + 1, result.id, result.score);
    }
    println!();

    // Example 5: Multi-term search
    println!("5. Searching for 'start server'...");
    let results = engine.search("start server", 5)?;
    println!("   ✓ Found {} results", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("   {}. {} (score: {:.4})", i + 1, result.id, result.score);
        println!("      Matched terms: {:?}", result.matched_terms);
    }
    println!();

    // Example 6: Search with custom options
    println!("6. Searching with custom options (min_score threshold)...");
    let options = SearchOptions::new().with_top_k(3).with_min_score(0.5);

    let results = engine.search_with_options("database", options)?;
    println!("   ✓ Found {} high-scoring results", results.len());
    for (i, result) in results.iter().enumerate() {
        println!("   {}. {} (score: {:.4})", i + 1, result.id, result.score);
    }
    println!();

    // Example 7: Index statistics
    println!("7. Getting index statistics...");
    let stats = engine.get_stats()?;
    println!("   Documents: {}", stats.document_count);
    println!("   Unique terms: {}", stats.term_count);
    println!(
        "   Average document length: {:.2} terms",
        stats.avg_doc_length
    );
    println!("   Total tokens: {}", stats.total_tokens);
    println!();

    // Example 8: Indexing with metadata
    println!("8. Indexing documents with metadata...");

    let mut metadata1 = HashMap::new();
    metadata1.insert("language".to_string(), "rust".to_string());
    metadata1.insert("type".to_string(), "function".to_string());

    let mut metadata2 = HashMap::new();
    metadata2.insert("language".to_string(), "rust".to_string());
    metadata2.insert("type".to_string(), "struct".to_string());

    let doc1 = Document::with_metadata(
        "src/utils.rs:10".to_string(),
        "pub fn validate_input(input: &str) -> bool".to_string(),
        metadata1,
    );

    let doc2 = Document::with_metadata(
        "src/types.rs:5".to_string(),
        "pub struct ValidationError { message: String }".to_string(),
        metadata2,
    );

    engine.index_document_with_metadata(doc1)?;
    engine.index_document_with_metadata(doc2)?;

    println!("   ✓ Indexed documents with metadata\n");

    // Search and display metadata
    println!("9. Searching 'validation' (with metadata)...");
    let results = engine.search("validation", 5)?;
    for (i, result) in results.iter().enumerate() {
        println!("   {}. {} (score: {:.4})", i + 1, result.id, result.score);
        if let Some(lang) = result.metadata.get("language") {
            println!("      Language: {}", lang);
        }
        if let Some(type_) = result.metadata.get("type") {
            println!("      Type: {}", type_);
        }
    }
    println!();

    // Example 10: Batch indexing
    println!("10. Batch indexing example...");
    batch_indexing_example()?;
    println!();

    // Example 11: Custom tokenizer
    println!("11. Custom tokenizer example...");
    custom_tokenizer_example()?;
    println!();

    // Example 12: Custom BM25 configuration
    println!("12. Custom BM25 configuration example...");
    custom_config_example()?;
    println!();

    // Example 13: Persistent database
    println!("13. Persistent database example...");
    persistent_db_example()?;
    println!();

    println!("=== All examples completed successfully! ===");

    Ok(())
}

/// Example: Batch indexing
fn batch_indexing_example() -> context_mcp::Result<()> {
    let engine = BM25Engine::new_in_memory()?;

    println!("   Creating batch of documents...");

    let docs = vec![
        ("file1.rs".to_string(), "fn process_data() {}".to_string()),
        ("file2.rs".to_string(), "fn validate_data() {}".to_string()),
        ("file3.rs".to_string(), "fn transform_data() {}".to_string()),
        ("file4.rs".to_string(), "fn save_data() {}".to_string()),
        ("file5.rs".to_string(), "fn load_data() {}".to_string()),
    ];

    engine.index_documents(docs)?;

    println!("   ✓ Batch indexed {} documents", engine.document_count()?);

    let results = engine.search("data", 10)?;
    println!("   ✓ Search for 'data' found {} results", results.len());

    Ok(())
}

/// Example: Custom tokenizer for different use cases
fn custom_tokenizer_example() -> context_mcp::Result<()> {
    // Code tokenizer (default)
    let code_tokenizer = Tokenizer::code();
    let code_tokens = code_tokenizer.tokenize("getUserById");
    println!("   Code tokenizer: 'getUserById' -> {:?}", code_tokens);

    // Text tokenizer (no camelCase splitting)
    let text_tokenizer = Tokenizer::text();
    let text_tokens = text_tokenizer.tokenize("getUserById");
    println!("   Text tokenizer: 'getUserById' -> {:?}", text_tokens);

    // Custom tokenizer
    let custom_tokenizer = Tokenizer::new()
        .with_lowercase(true)
        .with_split_camel_case(true)
        .with_split_snake_case(true)
        .with_min_term_length(3);

    let engine = BM25Engine::new_in_memory()?.with_tokenizer(custom_tokenizer);

    engine.index_document("doc1", "getUserById fetchDataFromAPI")?;
    let results = engine.search("user data", 10)?;
    println!(
        "   ✓ Custom tokenizer search found {} results",
        results.len()
    );

    Ok(())
}

/// Example: Custom BM25 configuration
fn custom_config_example() -> context_mcp::Result<()> {
    // Create engine with custom BM25 parameters
    let config = BM25Config::new(1.5, 0.9); // Higher k1 and b values

    let engine = BM25Engine::new_in_memory()?.with_config(config)?;

    engine.index_document("short", "rust")?;
    engine.index_document("medium", "rust programming language")?;
    engine.index_document(
        "long",
        "rust programming language with many features and capabilities",
    )?;

    let results = engine.search("rust", 10)?;
    println!("   ✓ Custom config (k1=1.5, b=0.9) results:");
    for (i, result) in results.iter().enumerate() {
        println!(
            "      {}. {} (score: {:.4})",
            i + 1,
            result.id,
            result.score
        );
    }

    // Compare with default config
    let default_engine = BM25Engine::new_in_memory()?;
    default_engine.index_document("short", "rust")?;
    default_engine.index_document("medium", "rust programming language")?;
    default_engine.index_document(
        "long",
        "rust programming language with many features and capabilities",
    )?;

    let default_results = default_engine.search("rust", 10)?;
    println!("   ✓ Default config (k1=1.2, b=0.75) results:");
    for (i, result) in default_results.iter().enumerate() {
        println!(
            "      {}. {} (score: {:.4})",
            i + 1,
            result.id,
            result.score
        );
    }

    Ok(())
}

/// Example: Using a persistent database file
fn persistent_db_example() -> context_mcp::Result<()> {
    // Create a temporary directory for the database
    let temp_dir = std::env::temp_dir();
    let db_path = temp_dir.join("bm25_example.db");

    println!("   Creating persistent database at {:?}", db_path);

    {
        // Create and populate the database
        let engine = BM25Engine::new(&db_path)?;
        engine.index_document("doc1", "persistent data storage")?;
        engine.index_document("doc2", "database indexing")?;
        println!("   ✓ Indexed 2 documents");
    }

    {
        // Reopen the database and verify data persists
        let engine = BM25Engine::new(&db_path)?;
        println!(
            "   ✓ Reopened database, document count: {}",
            engine.document_count()?
        );

        let results = engine.search("persistent", 5)?;
        println!(
            "   ✓ Search found {} results (data persisted)",
            results.len()
        );
    }

    // Clean up
    std::fs::remove_file(&db_path).ok();
    println!("   ✓ Cleaned up database file");

    Ok(())
}

/// Example: Demonstrating ranking quality
#[allow(dead_code)]
fn ranking_quality_example() -> context_mcp::Result<()> {
    let engine = BM25Engine::new_in_memory()?;

    // Index documents with varying relevance to query "parse config file"
    engine.index_document(
        "highly_relevant",
        "This function parses the configuration file and returns a Config struct. \
         It handles both TOML and JSON config files.",
    )?;

    engine.index_document(
        "somewhat_relevant",
        "Configuration parsing is handled by the parse_config module. \
         Files are validated before parsing.",
    )?;

    engine.index_document(
        "less_relevant",
        "The Config struct contains all application configuration. \
         It can be serialized to various file formats.",
    )?;

    engine.index_document(
        "barely_relevant",
        "File system operations include reading, writing, and deleting files. \
         Error handling is important when working with files.",
    )?;

    let results = engine.search("parse config file", 10)?;

    println!("Ranking quality demonstration:");
    for (i, result) in results.iter().enumerate() {
        println!("{}. {} (score: {:.4})", i + 1, result.id, result.score);
        println!("   Matched: {:?}", result.matched_terms);
    }

    Ok(())
}

/// Example: Update and deletion operations
#[allow(dead_code)]
fn update_delete_example() -> context_mcp::Result<()> {
    let engine = BM25Engine::new_in_memory()?;

    // Index initial document
    engine.index_document("doc1", "old content version 1")?;
    println!("Initial search:");
    let results = engine.search("old", 5)?;
    println!("  Found: {}", results.len());

    // Update by re-indexing (same ID)
    engine.index_document("doc1", "new content version 2")?;
    println!("After update:");
    let results = engine.search("new", 5)?;
    println!("  Found: {}", results.len());

    let results = engine.search("old", 5)?;
    println!("  Old content search: {}", results.len());

    // Delete document
    engine.remove_document("doc1")?;
    println!("After deletion:");
    println!("  Document count: {}", engine.document_count()?);

    Ok(())
}
