use super::types::{Embedding, EmbeddingConfig, ModelInfo};
use crate::error::{ContextMcpError, Result};
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use parking_lot::Mutex;
use std::path::Path;
use std::sync::Arc;
use tokenizers::Tokenizer;
use tracing::{debug, info, warn};

/// Embedding engine using ONNX Runtime for local inference
///
/// This engine loads an ONNX model (typically all-MiniLM-L6-v2) and generates
/// embeddings for text inputs. It uses the HuggingFace tokenizers library for
/// text preprocessing.
///
/// # Example
///
/// ```no_run
/// use context_mcp::embedding::{EmbeddingEngine, EmbeddingConfig};
/// use std::path::PathBuf;
///
/// # async fn example() -> anyhow::Result<()> {
/// let config = EmbeddingConfig {
///     model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
///     tokenizer_path: PathBuf::from("./models/tokenizer.json"),
///     max_length: 256,
///     batch_size: 32,
/// };
///
/// let engine = EmbeddingEngine::new(config).await?;
/// let embedding = engine.embed("Hello, world!").await?;
/// println!("Embedding dimension: {}", embedding.dimension());
/// # Ok(())
/// # }
/// ```
pub struct EmbeddingEngine {
    /// ONNX Runtime session
    session: Mutex<Session>,

    /// Tokenizer for text preprocessing
    tokenizer: Arc<Mutex<Tokenizer>>,

    /// Configuration
    config: EmbeddingConfig,

    /// Model information
    model_info: ModelInfo,
}

impl EmbeddingEngine {
    /// Create a new embedding engine with the given configuration
    ///
    /// # Arguments
    ///
    /// * `config` - Configuration for the embedding engine
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - The model file cannot be found or loaded
    /// - The tokenizer file cannot be found or loaded
    /// - ONNX Runtime initialization fails
    pub async fn new(config: EmbeddingConfig) -> Result<Self> {
        info!("Initializing EmbeddingEngine");
        debug!("Model path: {:?}", config.model_path);
        debug!("Tokenizer path: {:?}", config.tokenizer_path);

        // Validate paths
        if !config.model_path.exists() {
            return Err(ContextMcpError::Embedding(format!(
                "Model file not found: {:?}",
                config.model_path
            )));
        }

        if !config.tokenizer_path.exists() {
            return Err(ContextMcpError::Embedding(format!(
                "Tokenizer file not found: {:?}",
                config.tokenizer_path
            )));
        }

        // Create session
        let session = Self::create_session(&config.model_path)?;

        // Load tokenizer
        let tokenizer = Tokenizer::from_file(&config.tokenizer_path)
            .map_err(|e| ContextMcpError::Embedding(format!("Failed to load tokenizer: {}", e)))?;

        // Create model info
        let model_info = ModelInfo::all_mini_lm_l6_v2(config.model_path.clone(), config.max_length);

        info!("EmbeddingEngine initialized successfully");
        info!("Model: {} v{}", model_info.name, model_info.version);
        info!("Embedding dimension: {}", model_info.dimension);

        Ok(Self {
            session: Mutex::new(session),
            tokenizer: Arc::new(Mutex::new(tokenizer)),
            config,
            model_info,
        })
    }

    /// Create ONNX Runtime session with optimizations
    fn create_session(model_path: &Path) -> Result<Session> {
        debug!("Creating ONNX session");

        let session = Session::builder()
            .map_err(|e| {
                ContextMcpError::Embedding(format!("Failed to create session builder: {}", e))
            })?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| {
                ContextMcpError::Embedding(format!("Failed to set optimization level: {}", e))
            })?
            .with_intra_threads(4)
            .map_err(|e| ContextMcpError::Embedding(format!("Failed to set intra threads: {}", e)))?
            .commit_from_file(model_path)
            .map_err(|e| ContextMcpError::Embedding(format!("Failed to load model: {}", e)))?;

        debug!("ONNX session created successfully");
        Ok(session)
    }

    /// Generate embedding for a single text
    ///
    /// # Arguments
    ///
    /// * `text` - The input text to embed
    ///
    /// # Returns
    ///
    /// Returns an `Embedding` containing the normalized embedding vector
    ///
    /// # Errors
    ///
    /// Returns an error if tokenization or inference fails
    pub async fn embed(&self, text: &str) -> Result<Embedding> {
        debug!("Embedding single text (length: {})", text.len());

        let embeddings = self.embed_batch(&[text]).await?;

        embeddings
            .into_iter()
            .next()
            .ok_or_else(|| ContextMcpError::Embedding("No embedding generated".to_string()))
    }

    /// Generate embeddings for multiple texts in batch
    ///
    /// This is more efficient than calling `embed` multiple times for
    /// multiple texts.
    ///
    /// # Arguments
    ///
    /// * `texts` - Slice of text inputs to embed
    ///
    /// # Returns
    ///
    /// Returns a vector of `Embedding` objects, one for each input text
    ///
    /// # Errors
    ///
    /// Returns an error if tokenization or inference fails
    pub async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Embedding>> {
        debug!("Embedding batch of {} texts", texts.len());

        if texts.is_empty() {
            return Ok(Vec::new());
        }

        // Tokenize texts
        let encodings = {
            let tokenizer = self.tokenizer.lock();
            tokenizer
                .encode_batch(texts.to_vec(), true)
                .map_err(|e| ContextMcpError::Embedding(format!("Tokenization failed: {}", e)))?
        };

        // Prepare input tensors
        let batch_size = texts.len();
        let max_len = self.config.max_length;

        // Create input_ids, attention_mask, and token_type_ids
        let mut input_ids = Vec::with_capacity(batch_size * max_len);
        let mut attention_mask = Vec::with_capacity(batch_size * max_len);
        let mut token_type_ids = Vec::with_capacity(batch_size * max_len);

        for encoding in &encodings {
            let ids = encoding.get_ids();
            let mask = encoding.get_attention_mask();
            let type_ids = encoding.get_type_ids();

            // Pad or truncate to max_length
            for i in 0..max_len {
                input_ids.push(if i < ids.len() { ids[i] as i64 } else { 0 });
                attention_mask.push(if i < mask.len() { mask[i] as i64 } else { 0 });
                token_type_ids.push(if i < type_ids.len() {
                    type_ids[i] as i64
                } else {
                    0
                });
            }
        }

        // Create ONNX tensors
        let input_ids_array = ndarray::Array2::from_shape_vec((batch_size, max_len), input_ids)
            .map_err(|e| {
                ContextMcpError::Embedding(format!("Failed to create input_ids tensor: {}", e))
            })?;

        let attention_mask_array = ndarray::Array2::from_shape_vec(
            (batch_size, max_len),
            attention_mask,
        )
        .map_err(|e| {
            ContextMcpError::Embedding(format!("Failed to create attention_mask tensor: {}", e))
        })?;

        let token_type_ids_array = ndarray::Array2::from_shape_vec(
            (batch_size, max_len),
            token_type_ids,
        )
        .map_err(|e| {
            ContextMcpError::Embedding(format!("Failed to create token_type_ids tensor: {}", e))
        })?;

        // Create input tensors
        let input_ids_tensor = Tensor::from_array(input_ids_array).map_err(|e| {
            ContextMcpError::Embedding(format!("Failed to create input_ids tensor: {}", e))
        })?;
        let attention_mask_tensor = Tensor::from_array(attention_mask_array).map_err(|e| {
            ContextMcpError::Embedding(format!("Failed to create attention_mask tensor: {}", e))
        })?;
        let token_type_ids_tensor = Tensor::from_array(token_type_ids_array).map_err(|e| {
            ContextMcpError::Embedding(format!("Failed to create token_type_ids tensor: {}", e))
        })?;

        // Run inference
        let mut session = self.session.lock();
        let outputs = session
            .run(ort::inputs![
                "input_ids" => input_ids_tensor,
                "attention_mask" => attention_mask_tensor,
                "token_type_ids" => token_type_ids_tensor
            ])
            .map_err(|e| ContextMcpError::Embedding(format!("ONNX inference failed: {}", e)))?;

        // Extract embeddings from output
        let output_tensor = outputs
            .get("last_hidden_state")
            .or_else(|| outputs.get("output"))
            .or_else(|| outputs.get("logits"))
            .ok_or_else(|| ContextMcpError::Embedding("No output from model".to_string()))?;

        let embeddings_data = output_tensor.try_extract_tensor::<f32>().map_err(|e| {
            ContextMcpError::Embedding(format!("Failed to extract output tensor: {}", e))
        })?;

        let (shape, data) = embeddings_data;

        if shape.len() != 2 || shape[0] as usize != batch_size {
            return Err(ContextMcpError::Embedding(format!(
                "Unexpected output shape: {:?}, expected [{}, {}]",
                shape, batch_size, self.model_info.dimension
            )));
        }

        let embedding_dim = shape[1] as usize;

        // Extract and normalize embeddings
        let mut results = Vec::with_capacity(batch_size);

        for (i, (text, encoding)) in texts.iter().zip(encodings.iter()).enumerate() {
            let start_idx = i * embedding_dim;
            let end_idx = start_idx + embedding_dim;

            let raw_embedding = data.get(start_idx..end_idx).ok_or_else(|| {
                ContextMcpError::Embedding(format!(
                    "Invalid embedding range: {}..{}",
                    start_idx, end_idx
                ))
            })?;

            // Normalize embedding (L2 normalization)
            let normalized = Self::normalize_vector(raw_embedding);

            results.push(Embedding::new(
                normalized,
                text.to_string(),
                encoding.get_ids().len(),
            ));
        }

        debug!("Successfully generated {} embeddings", results.len());

        Ok(results)
    }

    /// Normalize a vector using L2 normalization
    fn normalize_vector(vector: &[f32]) -> Vec<f32> {
        let norm = vector.iter().map(|x| x * x).sum::<f32>().sqrt();

        if norm < 1e-10 {
            // Avoid division by zero
            warn!("Vector norm is too small, returning zero vector");
            return vec![0.0; vector.len()];
        }

        vector.iter().map(|x| x / norm).collect()
    }

    /// Get model information
    pub fn model_info(&self) -> &ModelInfo {
        &self.model_info
    }

    /// Get the embedding dimension
    pub fn dimension(&self) -> usize {
        self.model_info.dimension
    }

    /// Get the configuration
    pub fn config(&self) -> &EmbeddingConfig {
        &self.config
    }
}

// Ensure EmbeddingEngine is Send + Sync for use in async contexts
unsafe impl Send for EmbeddingEngine {}
unsafe impl Sync for EmbeddingEngine {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_vector() {
        let vector = vec![3.0, 4.0];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        assert_eq!(normalized.len(), 2);
        assert!((normalized[0] - 0.6).abs() < 1e-5);
        assert!((normalized[1] - 0.8).abs() < 1e-5);

        // Check L2 norm is 1
        let norm: f32 = normalized.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_normalize_zero_vector() {
        let vector = vec![0.0, 0.0];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        assert_eq!(normalized, vec![0.0, 0.0]);
    }
}
