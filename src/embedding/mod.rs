//! Embedding module for generating text embeddings using ONNX Runtime
//!
//! This module provides local text embedding generation using ONNX models.
//! The default model is all-MiniLM-L6-v2, which generates 384-dimensional
//! embeddings suitable for semantic search.
//!
//! # Features
//!
//! - Local inference using ONNX Runtime (no external API calls)
//! - Support for batch processing
//! - L2-normalized embeddings
//! - HuggingFace tokenizer integration
//!
//! # Example
//!
//! ```no_run
//! use context_mcp::embedding::{EmbeddingEngine, EmbeddingConfig};
//! use std::path::PathBuf;
//!
//! # async fn example() -> anyhow::Result<()> {
//! // Create configuration
//! let config = EmbeddingConfig {
//!     model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
//!     tokenizer_path: PathBuf::from("./models/tokenizer.json"),
//!     max_length: 256,
//!     batch_size: 32,
//! };
//!
//! // Initialize engine
//! let engine = EmbeddingEngine::new(config).await?;
//!
//! // Generate single embedding
//! let embedding = engine.embed("Hello, world!").await?;
//! println!("Dimension: {}", embedding.dimension());
//! println!("Normalized: {}", embedding.is_normalized());
//!
//! // Generate batch embeddings
//! let texts = vec!["First text", "Second text", "Third text"];
//! let embeddings = engine.embed_batch(&texts).await?;
//! println!("Generated {} embeddings", embeddings.len());
//! # Ok(())
//! # }
//! ```

mod engine;
mod types;

pub use engine::{EmbeddingEngine, EmbeddingEngineTrait};
pub use types::{Embedding, EmbeddingConfig, ModelInfo};

#[cfg(test)]
pub use engine::MockEmbeddingEngineTrait;
