//! Example of using the EmbeddingEngine for text embedding generation
//!
//! This example demonstrates how to:
//! 1. Initialize the embedding engine
//! 2. Generate embeddings for single texts
//! 3. Generate embeddings in batch
//! 4. Access model information
//!
//! # Running this example
//!
//! Before running, ensure you have:
//! 1. Downloaded the ONNX model and tokenizer files (see EMBEDDING_IMPLEMENTATION.md)
//! 2. Placed them in the ./models directory
//!
//! ```bash
//! cargo run --example embedding_usage
//! ```

use context_mcp::embedding::{EmbeddingConfig, EmbeddingEngine};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("=== Embedding Engine Usage Example ===\n");

    // Configure the embedding engine
    let config = EmbeddingConfig {
        model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
        tokenizer_path: PathBuf::from("./models/tokenizer.json"),
        max_length: 256,
        batch_size: 32,
    };

    // Initialize the engine
    println!("Initializing embedding engine...");
    let engine = EmbeddingEngine::new(config).await?;

    // Display model information
    let model_info = engine.model_info();
    println!("\nModel Information:");
    println!("  Name: {}", model_info.name);
    println!("  Version: {}", model_info.version);
    println!("  Dimension: {}", model_info.dimension);
    println!("  Max Length: {}", model_info.max_length);
    println!("  Tokenizer: {}", model_info.tokenizer_type);

    // Example 1: Single text embedding
    println!("\n--- Example 1: Single Text Embedding ---");
    let text = "This is a sample text for embedding generation.";
    println!("Text: \"{}\"", text);

    let embedding = engine.embed(text).await?;
    println!("Embedding dimension: {}", embedding.dimension());
    println!("Token count: {}", embedding.token_count);
    println!("Is normalized: {}", embedding.is_normalized());
    println!("First 5 values: {:?}", &embedding.vector[..5]);

    // Example 2: Batch embedding
    println!("\n--- Example 2: Batch Embedding ---");
    let texts = vec![
        "Machine learning is fascinating.",
        "Deep learning models require lots of data.",
        "Natural language processing enables computers to understand text.",
        "Semantic search improves information retrieval.",
    ];

    println!("Embedding {} texts in batch...", texts.len());
    let embeddings = engine.embed_batch(&texts).await?;

    for (i, (text, embedding)) in texts.iter().zip(embeddings.iter()).enumerate() {
        println!(
            "\nText {}: \"{}\"",
            i + 1,
            text
        );
        println!("  Dimension: {}", embedding.dimension());
        println!("  Tokens: {}", embedding.token_count);
        println!("  Normalized: {}", embedding.is_normalized());
    }

    // Example 3: Computing similarity
    println!("\n--- Example 3: Computing Cosine Similarity ---");
    if embeddings.len() >= 2 {
        let sim = cosine_similarity(&embeddings[0].vector, &embeddings[1].vector);
        println!(
            "Similarity between \"{}\" and \"{}\"",
            texts[0], texts[1]
        );
        println!("  Cosine similarity: {:.4}", sim);

        let sim2 = cosine_similarity(&embeddings[0].vector, &embeddings[2].vector);
        println!(
            "\nSimilarity between \"{}\" and \"{}\"",
            texts[0], texts[2]
        );
        println!("  Cosine similarity: {:.4}", sim2);
    }

    // Example 4: Code-related embeddings
    println!("\n--- Example 4: Code Embeddings ---");
    let code_texts = vec![
        "function to parse JSON data",
        "async function parseJSON(data: string): Promise<any>",
        "class JSONParser { parse(input: string): object }",
    ];

    println!("Embedding code-related texts...");
    let code_embeddings = engine.embed_batch(&code_texts).await?;

    for (i, (text, embedding)) in code_texts.iter().zip(code_embeddings.iter()).enumerate() {
        println!(
            "\nCode text {}: \"{}\"",
            i + 1,
            text
        );
        println!("  Tokens: {}", embedding.token_count);
    }

    // Compute similarities between code descriptions and implementations
    if code_embeddings.len() >= 2 {
        let sim = cosine_similarity(&code_embeddings[0].vector, &code_embeddings[1].vector);
        println!(
            "\nSimilarity between description and implementation:"
        );
        println!("  \"{}\"\n  vs\n  \"{}\"",
            code_texts[0], code_texts[1]
        );
        println!("  Cosine similarity: {:.4}", sim);
    }

    println!("\n=== Example completed successfully ===");

    Ok(())
}

/// Compute cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "Vectors must have the same length");

    // For normalized vectors, cosine similarity is just the dot product
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| x * y)
        .sum()
}
