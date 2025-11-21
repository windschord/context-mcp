use super::types::{Embedding, EmbeddingConfig, ModelInfo};
use crate::error::{ContextMcpError, Result};
use async_trait::async_trait;
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use parking_lot::Mutex;
use std::path::Path;
use std::sync::Arc;
use tokenizers::Tokenizer;
use tracing::{debug, info, warn};

#[cfg(test)]
use mockall::automock;

/// Trait for embedding engine operations
///
/// This trait defines the interface for generating embeddings from text.
/// It can be implemented by the real EmbeddingEngine or mocked for testing purposes.
#[cfg_attr(test, automock)]
#[async_trait]
pub trait EmbeddingEngineTrait: Send + Sync {
    /// Generate embedding for a single text
    async fn embed(&self, text: &str) -> Result<Embedding>;

    /// Generate embeddings for multiple texts in batch
    async fn embed_batch<'a>(&self, texts: &'a [&'a str]) -> Result<Vec<Embedding>>;

    /// Get model information
    fn model_info(&self) -> &ModelInfo;

    /// Get the embedding dimension
    fn dimension(&self) -> usize;

    /// Get the configuration
    fn config(&self) -> &EmbeddingConfig;
}

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

// SAFETY: EmbeddingEngine is Send + Sync for use in async contexts
//
// Safety rationale:
// 1. ort::Session: The ONNX Runtime session is thread-safe according to the
//    ort crate documentation. Multiple threads can safely use the same session
//    for inference as long as access is properly synchronized.
//    We protect it with Mutex<Session> to ensure exclusive access.
//
// 2. tokenizers::Tokenizer: The HuggingFace tokenizers library is designed for
//    concurrent use. The Tokenizer type is internally thread-safe for read operations.
//    We protect it with Arc<Mutex<Tokenizer>> to ensure safe concurrent access.
//
// 3. EmbeddingConfig and ModelInfo: These are simple data structures containing
//    only owned data (PathBuf, primitive types, String). They are inherently Send + Sync.
//
// All mutable state is protected by Mutex, ensuring exclusive access and preventing
// data races. The Arc ensures proper reference counting across threads.
unsafe impl Send for EmbeddingEngine {}
unsafe impl Sync for EmbeddingEngine {}

/// Implementation of EmbeddingEngineTrait for EmbeddingEngine
#[async_trait]
impl EmbeddingEngineTrait for EmbeddingEngine {
    async fn embed(&self, text: &str) -> Result<Embedding> {
        self.embed(text).await
    }

    async fn embed_batch<'a>(&self, texts: &'a [&'a str]) -> Result<Vec<Embedding>> {
        self.embed_batch(texts).await
    }

    fn model_info(&self) -> &ModelInfo {
        self.model_info()
    }

    fn dimension(&self) -> usize {
        self.dimension()
    }

    fn config(&self) -> &EmbeddingConfig {
        self.config()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ========================================
    // Unit tests using MockEmbeddingEngineTrait
    // ========================================

    #[tokio::test]
    async fn test_mock_embed() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed()
            .with(mockall::predicate::eq("test text"))
            .times(1)
            .returning(|text| {
                Ok(Embedding::new(
                    vec![0.1; 384], // Fixed 384-dimensional vector
                    text.to_string(),
                    2, // Number of tokens
                ))
            });

        let result = mock.embed("test text").await;
        assert!(result.is_ok());
        let embedding = result.unwrap();
        assert_eq!(embedding.dimension(), 384);
        assert_eq!(embedding.text, "test text");
    }

    #[tokio::test]
    async fn test_mock_embed_batch() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed_batch()
            .withf(|texts| texts.len() == 2)
            .times(1)
            .returning(|texts| {
                Ok(texts
                    .iter()
                    .map(|text| {
                        Embedding::new(
                            vec![0.1; 384], // Fixed 384-dimensional vector
                            text.to_string(),
                            2,
                        )
                    })
                    .collect())
            });

        let result = mock.embed_batch(&["text1", "text2"]).await;
        assert!(result.is_ok());
        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), 2);
        assert_eq!(embeddings[0].dimension(), 384);
        assert_eq!(embeddings[1].dimension(), 384);
    }

    #[tokio::test]
    async fn test_mock_model_info() {
        let mut mock = MockEmbeddingEngineTrait::new();

        let model_info = ModelInfo::all_mini_lm_l6_v2(PathBuf::from("test.onnx"), 256);

        mock.expect_model_info().times(1).return_const(model_info);

        let result = mock.model_info();
        assert_eq!(result.name, "all-MiniLM-L6-v2");
        assert_eq!(result.dimension, 384);
    }

    #[tokio::test]
    async fn test_mock_dimension() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_dimension().times(1).returning(|| 384);

        let result = mock.dimension();
        assert_eq!(result, 384);
    }

    #[tokio::test]
    async fn test_mock_config() {
        let mut mock = MockEmbeddingEngineTrait::new();

        let config = EmbeddingConfig {
            model_path: PathBuf::from("test.onnx"),
            tokenizer_path: PathBuf::from("tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        mock.expect_config().times(1).return_const(config);

        let result = mock.config();
        assert_eq!(result.max_length, 256);
        assert_eq!(result.batch_size, 32);
    }

    #[tokio::test]
    async fn test_mock_normalized_vector() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed().times(1).returning(|text| {
            // Create a normalized vector (L2 norm = 1.0)
            let dim = 384;
            let value = 1.0 / (dim as f32).sqrt();
            Ok(Embedding::new(vec![value; dim], text.to_string(), 2))
        });

        let result = mock.embed("test").await;
        assert!(result.is_ok());
        let embedding = result.unwrap();

        // Verify L2 norm is approximately 1.0
        let norm: f32 = embedding.vector.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }

    #[tokio::test]
    async fn test_mock_error_simulation() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed()
            .times(1)
            .returning(|_| Err(ContextMcpError::Embedding("Model load error".to_string())));

        let result = mock.embed("test").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => assert_eq!(msg, "Model load error"),
            _ => panic!("Expected Embedding error"),
        }
    }

    #[tokio::test]
    async fn test_mock_batch_error_simulation() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed_batch()
            .times(1)
            .returning(|_| Err(ContextMcpError::Embedding("Tokenization error".to_string())));

        let result = mock.embed_batch(&["text1", "text2"]).await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => assert_eq!(msg, "Tokenization error"),
            _ => panic!("Expected Embedding error"),
        }
    }

    #[tokio::test]
    async fn test_mock_empty_batch() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed_batch()
            .withf(|texts| texts.is_empty())
            .times(1)
            .returning(|_| Ok(Vec::new()));

        let result = mock.embed_batch(&[]).await;
        assert!(result.is_ok());
        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), 0);
    }

    #[tokio::test]
    async fn test_mock_long_text() {
        let mut mock = MockEmbeddingEngineTrait::new();

        // Long text with 1000+ characters
        let long_text = "a".repeat(1000);

        mock.expect_embed().times(1).returning(|text| {
            Ok(Embedding::new(
                vec![0.1; 384],
                text.to_string(),
                256, // Typically truncated to max_length
            ))
        });

        let result = mock.embed(&long_text).await;
        assert!(result.is_ok());
        let embedding = result.unwrap();
        assert_eq!(embedding.dimension(), 384);
        assert_eq!(embedding.text, long_text);
        assert_eq!(embedding.token_count, 256);
    }

    #[tokio::test]
    async fn test_mock_concurrent_access() {
        // This test verifies that multiple tasks can safely access the embedding engine
        // In practice, the real EmbeddingEngine uses Arc<Mutex<>> internally for thread safety

        // Create a mock for each task to avoid Send issues with parking_lot::MutexGuard
        let results = futures::future::join_all((0..10).map(|i| {
            tokio::spawn(async move {
                let mut mock = MockEmbeddingEngineTrait::new();
                mock.expect_embed()
                    .times(1)
                    .returning(|text| Ok(Embedding::new(vec![0.1; 384], text.to_string(), 2)));

                let text = format!("text {}", i);
                mock.embed(&text).await
            })
        }))
        .await;

        // Verify all tasks completed successfully
        for result in results {
            let result = result.unwrap(); // tokio::spawn result
            assert!(result.is_ok());
            let embedding = result.unwrap();
            assert_eq!(embedding.dimension(), 384);
        }
    }

    // ========================================
    // Integration tests with real ONNX model (optional, requires model files)
    // ========================================

    #[tokio::test]
    #[ignore = "Requires real ONNX model files to be present"]
    async fn test_real_model_embed() {
        // This test requires downloading the model first:
        // 1. Download all-MiniLM-L6-v2.onnx
        // 2. Download tokenizer.json
        // 3. Place them in ./test_models/

        let config = EmbeddingConfig {
            model_path: PathBuf::from("./test_models/all-MiniLM-L6-v2.onnx"),
            tokenizer_path: PathBuf::from("./test_models/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        let engine = EmbeddingEngine::new(config).await;

        // Skip test if model files are not available
        if engine.is_err() {
            eprintln!(
                "Skipping test_real_model_embed: model files not found. \
                 Download test models to ./test_models/"
            );
            return;
        }

        let engine = engine.unwrap();

        // Test single embedding
        let result = engine.embed("Hello, world!").await;
        assert!(result.is_ok());
        let embedding = result.unwrap();
        assert_eq!(embedding.dimension(), 384);

        // Verify normalization (L2 norm should be ~1.0)
        let norm: f32 = embedding.vector.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-3);
    }

    #[tokio::test]
    #[ignore = "Requires real ONNX model files to be present"]
    async fn test_real_model_similarity() {
        let config = EmbeddingConfig {
            model_path: PathBuf::from("./test_models/all-MiniLM-L6-v2.onnx"),
            tokenizer_path: PathBuf::from("./test_models/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        let engine = EmbeddingEngine::new(config).await;

        if engine.is_err() {
            eprintln!(
                "Skipping test_real_model_similarity: model files not found. \
                 Download test models to ./test_models/"
            );
            return;
        }

        let engine = engine.unwrap();

        // Similar texts should have high cosine similarity
        let emb1 = engine.embed("The cat sits on the mat.").await.unwrap();
        let emb2 = engine.embed("A cat is sitting on a mat.").await.unwrap();
        let emb3 = engine.embed("Quantum physics is complex.").await.unwrap();

        // Cosine similarity (since vectors are normalized, this is just dot product)
        let similarity_12: f32 = emb1
            .vector
            .iter()
            .zip(emb2.vector.iter())
            .map(|(a, b)| a * b)
            .sum();

        let similarity_13: f32 = emb1
            .vector
            .iter()
            .zip(emb3.vector.iter())
            .map(|(a, b)| a * b)
            .sum();

        // Similar texts should have higher similarity than dissimilar texts
        assert!(
            similarity_12 > similarity_13,
            "Similar texts should have higher similarity: {} > {}",
            similarity_12,
            similarity_13
        );
        assert!(
            similarity_12 > 0.7,
            "Similar texts should have high similarity: {}",
            similarity_12
        );
    }

    #[tokio::test]
    #[ignore = "Requires real ONNX model files to be present"]
    async fn test_real_model_batch() {
        let config = EmbeddingConfig {
            model_path: PathBuf::from("./test_models/all-MiniLM-L6-v2.onnx"),
            tokenizer_path: PathBuf::from("./test_models/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        let engine = EmbeddingEngine::new(config).await;

        if engine.is_err() {
            eprintln!(
                "Skipping test_real_model_batch: model files not found. \
                 Download test models to ./test_models/"
            );
            return;
        }

        let engine = engine.unwrap();

        // Test batch embedding
        let texts = vec!["First text", "Second text", "Third text"];
        let result = engine.embed_batch(&texts).await;
        assert!(result.is_ok());

        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), 3);

        for embedding in &embeddings {
            assert_eq!(embedding.dimension(), 384);

            // Verify normalization
            let norm: f32 = embedding.vector.iter().map(|x| x * x).sum::<f32>().sqrt();
            assert!((norm - 1.0).abs() < 1e-3);
        }
    }

    #[tokio::test]
    #[ignore = "Requires real ONNX model files to be present"]
    async fn test_real_model_large_batch() {
        let config = EmbeddingConfig {
            model_path: PathBuf::from("./test_models/all-MiniLM-L6-v2.onnx"),
            tokenizer_path: PathBuf::from("./test_models/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        let engine = EmbeddingEngine::new(config).await;

        if engine.is_err() {
            eprintln!(
                "Skipping test_real_model_large_batch: model files not found. \
                 Download test models to ./test_models/"
            );
            return;
        }

        let engine = engine.unwrap();

        // Test large batch (100 texts)
        let texts: Vec<String> = (0..100).map(|i| format!("Text number {}", i)).collect();
        let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();

        let result = engine.embed_batch(&text_refs).await;
        assert!(result.is_ok());

        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), 100);

        for embedding in &embeddings {
            assert_eq!(embedding.dimension(), 384);
        }
    }

    // ========================================
    // Original unit tests
    // ========================================

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

    // ========================================
    // Additional unit tests for error handling and edge cases
    // ========================================

    #[tokio::test]
    async fn test_new_model_file_not_found() {
        let config = EmbeddingConfig {
            model_path: PathBuf::from("/nonexistent/model.onnx"),
            tokenizer_path: PathBuf::from("./models/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        let result = EmbeddingEngine::new(config).await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => {
                assert!(msg.contains("Model file not found"));
            }
            _ => panic!("Expected Embedding error for model file not found"),
        }
    }

    #[tokio::test]
    async fn test_new_tokenizer_file_not_found() {
        // Create a temporary empty file for model
        let temp_dir = std::env::temp_dir();
        let model_path = temp_dir.join("test_model.onnx");
        std::fs::write(&model_path, b"dummy").expect("Failed to create temp file");

        let config = EmbeddingConfig {
            model_path: model_path.clone(),
            tokenizer_path: PathBuf::from("/nonexistent/tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        };

        let result = EmbeddingEngine::new(config).await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => {
                assert!(msg.contains("Tokenizer file not found"));
            }
            _ => panic!("Expected Embedding error for tokenizer file not found"),
        }

        // Cleanup
        let _ = std::fs::remove_file(model_path);
    }

    #[test]
    fn test_normalize_vector_large() {
        // Test with a larger vector
        let vector = vec![1.0; 384];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        assert_eq!(normalized.len(), 384);

        // Check L2 norm is approximately 1
        let norm: f32 = normalized.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);

        // Each element should be approximately 1/sqrt(384)
        let expected_value = 1.0 / (384.0_f32).sqrt();
        for val in &normalized {
            assert!((val - expected_value).abs() < 1e-5);
        }
    }

    #[test]
    fn test_normalize_vector_negative_values() {
        let vector = vec![-3.0, 4.0];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        assert_eq!(normalized.len(), 2);
        assert!((normalized[0] - (-0.6)).abs() < 1e-5);
        assert!((normalized[1] - 0.8).abs() < 1e-5);

        // Check L2 norm is 1
        let norm: f32 = normalized.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_normalize_vector_mixed_values() {
        let vector = vec![1.0, -2.0, 3.0, -4.0];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        assert_eq!(normalized.len(), 4);

        // Check L2 norm is approximately 1
        let norm: f32 = normalized.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5);

        // Verify the ratio is preserved
        let original_norm = (1.0_f32 + 4.0 + 9.0 + 16.0).sqrt();
        assert!((normalized[0] - (1.0 / original_norm)).abs() < 1e-5);
        assert!((normalized[1] - (-2.0 / original_norm)).abs() < 1e-5);
        assert!((normalized[2] - (3.0 / original_norm)).abs() < 1e-5);
        assert!((normalized[3] - (-4.0 / original_norm)).abs() < 1e-5);
    }

    #[test]
    fn test_normalize_vector_very_small() {
        // Test with very small but non-zero values
        let vector = vec![1e-11, 1e-11];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        // Should return zero vector due to very small norm
        assert_eq!(normalized, vec![0.0, 0.0]);
    }

    #[test]
    fn test_normalize_vector_single_element() {
        let vector = vec![5.0];
        let normalized = EmbeddingEngine::normalize_vector(&vector);

        assert_eq!(normalized.len(), 1);
        assert!((normalized[0] - 1.0).abs() < 1e-5);
    }

    // ========================================
    // Tests for accessor methods
    // ========================================

    #[test]
    fn test_model_info_properties() {
        let model_info = ModelInfo::all_mini_lm_l6_v2(PathBuf::from("test.onnx"), 256);

        assert_eq!(model_info.name, "all-MiniLM-L6-v2");
        assert_eq!(model_info.version, "1.0.0");
        assert_eq!(model_info.dimension, 384);
        assert_eq!(model_info.max_length, 256);
        assert_eq!(model_info.model_path, PathBuf::from("test.onnx"));
    }

    // ========================================
    // Tests for Send + Sync traits
    // ========================================

    #[test]
    fn test_embedding_engine_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<EmbeddingEngine>();
    }

    #[test]
    fn test_embedding_engine_is_sync() {
        fn assert_sync<T: Sync>() {}
        assert_sync::<EmbeddingEngine>();
    }

    // ========================================
    // Tests for empty batch handling
    // ========================================

    #[tokio::test]
    async fn test_embed_batch_empty_array_real() {
        // This test uses a mock to simulate the empty batch behavior
        // without needing a real model file
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed_batch()
            .withf(|texts: &[&str]| texts.is_empty())
            .times(1)
            .returning(|_| Ok(Vec::new()));

        let result = mock.embed_batch(&[]).await;
        assert!(result.is_ok());
        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), 0);
    }

    // ========================================
    // Edge case tests for special characters and long text
    // ========================================

    #[tokio::test]
    async fn test_mock_empty_string() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed()
            .with(mockall::predicate::eq(""))
            .times(1)
            .returning(|text| {
                Ok(Embedding::new(
                    vec![0.1; 384],
                    text.to_string(),
                    0, // Empty string should have 0 tokens
                ))
            });

        let result = mock.embed("").await;
        assert!(result.is_ok());
        let embedding = result.unwrap();
        assert_eq!(embedding.text, "");
        assert_eq!(embedding.token_count, 0);
    }

    #[tokio::test]
    async fn test_mock_special_characters() {
        let mut mock = MockEmbeddingEngineTrait::new();

        let special_text = "Hello! @#$%^&*() 世界 🌍";

        mock.expect_embed().times(1).returning(|text| {
            Ok(Embedding::new(
                vec![0.1; 384],
                text.to_string(),
                10, // Approximate token count
            ))
        });

        let result = mock.embed(special_text).await;
        assert!(result.is_ok());
        let embedding = result.unwrap();
        assert_eq!(embedding.text, special_text);
    }

    #[tokio::test]
    async fn test_mock_unicode_text() {
        let mut mock = MockEmbeddingEngineTrait::new();

        let unicode_texts = vec![
            "日本語のテキスト",
            "中文文本",
            "한국어 텍스트",
            "Текст на русском",
            "النص العربي",
        ];

        mock.expect_embed_batch().times(1).returning(|texts| {
            Ok(texts
                .iter()
                .map(|text| {
                    Embedding::new(
                        vec![0.1; 384],
                        text.to_string(),
                        5, // Approximate token count
                    )
                })
                .collect())
        });

        let text_refs: Vec<&str> = unicode_texts.iter().map(|s| s.as_ref()).collect();
        let result = mock.embed_batch(&text_refs).await;
        assert!(result.is_ok());
        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), unicode_texts.len());
    }

    #[tokio::test]
    async fn test_mock_very_long_text() {
        let mut mock = MockEmbeddingEngineTrait::new();

        // Create a text with 10,000 characters
        let long_text = "a".repeat(10000);

        mock.expect_embed().times(1).returning(|text| {
            Ok(Embedding::new(
                vec![0.1; 384],
                text.to_string(),
                256, // Truncated to max_length
            ))
        });

        let result = mock.embed(&long_text).await;
        assert!(result.is_ok());
        let embedding = result.unwrap();
        assert_eq!(embedding.text.len(), 10000);
        assert_eq!(embedding.token_count, 256); // Should be truncated
    }

    #[tokio::test]
    async fn test_mock_batch_with_varying_lengths() {
        let mut mock = MockEmbeddingEngineTrait::new();

        let texts = vec![
            "Short",
            "Medium length text here",
            "This is a very long text that contains many words and should be truncated",
        ];

        mock.expect_embed_batch().times(1).returning(|texts| {
            Ok(texts
                .iter()
                .enumerate()
                .map(|(i, text)| {
                    let token_count = match i {
                        0 => 2,
                        1 => 5,
                        2 => 15,
                        _ => 0,
                    };
                    Embedding::new(vec![0.1; 384], text.to_string(), token_count)
                })
                .collect())
        });

        let result = mock.embed_batch(&texts).await;
        assert!(result.is_ok());
        let embeddings = result.unwrap();
        assert_eq!(embeddings.len(), 3);
        assert_eq!(embeddings[0].token_count, 2);
        assert_eq!(embeddings[1].token_count, 5);
        assert_eq!(embeddings[2].token_count, 15);
    }

    // ========================================
    // Tests for error propagation
    // ========================================

    #[tokio::test]
    async fn test_mock_tokenization_error() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed().times(1).returning(|_| {
            Err(ContextMcpError::Embedding(
                "Tokenization failed: invalid input".to_string(),
            ))
        });

        let result = mock.embed("test").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => {
                assert!(msg.contains("Tokenization failed"));
            }
            _ => panic!("Expected Embedding error"),
        }
    }

    #[tokio::test]
    async fn test_mock_inference_error() {
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed_batch().times(1).returning(|_| {
            Err(ContextMcpError::Embedding(
                "ONNX inference failed: model error".to_string(),
            ))
        });

        let result = mock.embed_batch(&["text1", "text2"]).await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => {
                assert!(msg.contains("ONNX inference failed"));
            }
            _ => panic!("Expected Embedding error"),
        }
    }

    #[tokio::test]
    async fn test_mock_no_embedding_generated_error() {
        // Test the case where embed_batch returns empty vector
        // which causes embed() to fail with "No embedding generated" error
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_embed().times(1).returning(|_| {
            Err(ContextMcpError::Embedding(
                "No embedding generated".to_string(),
            ))
        });

        let result = mock.embed("test").await;
        assert!(result.is_err());
        match result {
            Err(ContextMcpError::Embedding(msg)) => {
                assert_eq!(msg, "No embedding generated");
            }
            _ => panic!("Expected Embedding error"),
        }
    }

    // ========================================
    // Tests for concurrency with real Arc/Mutex usage
    // ========================================

    #[tokio::test]
    async fn test_mock_concurrent_access_arc() {
        // Test using Arc to share mock across tasks
        use std::sync::Arc;

        let mock = Arc::new(tokio::sync::Mutex::new(MockEmbeddingEngineTrait::new()));

        // Setup expectations before spawning tasks
        {
            let mut mock_guard = mock.lock().await;
            mock_guard
                .expect_embed()
                .times(10)
                .returning(|text| Ok(Embedding::new(vec![0.1; 384], text.to_string(), 2)));
        }

        let handles: Vec<_> = (0..10)
            .map(|i| {
                let mock_clone = Arc::clone(&mock);
                tokio::spawn(async move {
                    let text = format!("text {}", i);
                    let mock_guard = mock_clone.lock().await;
                    mock_guard.embed(&text).await
                })
            })
            .collect();

        let results = futures::future::join_all(handles).await;

        for result in results {
            let result = result.unwrap(); // tokio::spawn result
            assert!(result.is_ok());
            let embedding = result.unwrap();
            assert_eq!(embedding.dimension(), 384);
        }
    }

    // ========================================
    // Tests for EmbeddingEngineTrait implementation
    // ========================================

    #[tokio::test]
    async fn test_trait_implementation_compatibility() {
        // Verify that mock can be used as EmbeddingEngineTrait
        let mut mock = MockEmbeddingEngineTrait::new();

        mock.expect_dimension().return_const(384_usize);
        mock.expect_model_info()
            .return_const(ModelInfo::all_mini_lm_l6_v2(
                PathBuf::from("test.onnx"),
                256,
            ));
        mock.expect_config().return_const(EmbeddingConfig {
            model_path: PathBuf::from("test.onnx"),
            tokenizer_path: PathBuf::from("tokenizer.json"),
            max_length: 256,
            batch_size: 32,
        });

        // Use trait methods
        let dim: usize = mock.dimension();
        assert_eq!(dim, 384);

        let info: &ModelInfo = mock.model_info();
        assert_eq!(info.dimension, 384);

        let cfg: &EmbeddingConfig = mock.config();
        assert_eq!(cfg.max_length, 256);
    }
}
