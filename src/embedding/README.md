# Embedding Module

Local text embedding generation using ONNX Runtime.

## Quick Start

```rust
use context_mcp::embedding::{EmbeddingEngine, EmbeddingConfig};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Configure
    let config = EmbeddingConfig {
        model_path: PathBuf::from("./models/all-MiniLM-L6-v2.onnx"),
        tokenizer_path: PathBuf::from("./models/tokenizer.json"),
        max_length: 256,
        batch_size: 32,
    };

    // Initialize
    let engine = EmbeddingEngine::new(config).await?;

    // Generate embedding
    let embedding = engine.embed("Hello, world!").await?;

    println!("Dimension: {}", embedding.dimension());
    println!("Normalized: {}", embedding.is_normalized());

    Ok(())
}
```

## Module Structure

- `types.rs`: Type definitions (Config, ModelInfo, Embedding)
- `engine.rs`: Main EmbeddingEngine implementation
- `mod.rs`: Public API exports

## Key Features

- ✅ Local inference (no external API calls)
- ✅ Privacy-first design
- ✅ Batch processing support
- ✅ L2-normalized embeddings
- ✅ Thread-safe (Send + Sync)
- ✅ Async/await support

## Documentation

See [EMBEDDING_IMPLEMENTATION.md](../../EMBEDDING_IMPLEMENTATION.md) for:
- Complete setup instructions
- Model download guide
- API reference
- Performance tuning
- Troubleshooting

## Example

Run the example:
```bash
cargo run --example embedding_usage
```

## Model Setup

1. Install Python dependencies:
   ```bash
   pip install sentence-transformers optimum[onnxruntime] onnx
   ```

2. Convert model to ONNX:
   ```bash
   python scripts/convert_to_onnx.py
   ```

3. Model files will be in `./models/`:
   - `all-MiniLM-L6-v2.onnx` (ONNX model)
   - `tokenizer.json` (tokenizer config)

## API

### EmbeddingEngine

Main engine for generating embeddings.

**Methods:**
- `new(config: EmbeddingConfig) -> Result<Self>`
- `embed(&self, text: &str) -> Result<Embedding>`
- `embed_batch(&self, texts: &[&str]) -> Result<Vec<Embedding>>`
- `model_info(&self) -> &ModelInfo`
- `dimension(&self) -> usize`

### EmbeddingConfig

Configuration for the embedding engine.

**Fields:**
- `model_path: PathBuf` - Path to ONNX model
- `tokenizer_path: PathBuf` - Path to tokenizer.json
- `max_length: usize` - Max sequence length (default: 256)
- `batch_size: usize` - Batch size (default: 32)

### Embedding

Result of embedding generation.

**Fields:**
- `vector: Vec<f32>` - Normalized embedding vector
- `text: String` - Original text
- `token_count: usize` - Number of tokens

**Methods:**
- `dimension(&self) -> usize`
- `is_normalized(&self) -> bool`

## Integration

### With Indexing Service

```rust
let embedding = engine.embed(code_snippet).await?;
vector_store.upsert(id, embedding.vector, metadata).await?;
```

### With Search Service

```rust
let query_embedding = engine.embed(query).await?;
let results = vector_store.query(query_embedding.vector, 20).await?;
```

## Performance

- **Single text**: ~10-20 ms
- **Batch of 32**: ~50-100 ms (~2-3 ms per text)
- **Memory**: ~100 MB model + ~1-2 KB per text

## License

Apache 2.0 (model license)
