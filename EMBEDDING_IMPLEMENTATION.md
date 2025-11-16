# Embedding Implementation Guide

This document explains how to use the ONNX-based embedding engine in Context-MCP.

## Overview

The embedding engine provides local text embedding generation using ONNX Runtime. This ensures:
- **Privacy**: No data sent to external APIs
- **Performance**: Fast local inference
- **Offline capability**: Works without internet connection
- **Cost**: No API fees

## Model Information

### Default Model: all-MiniLM-L6-v2

- **Source**: [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- **Embedding dimension**: 384
- **Max sequence length**: 256 tokens
- **Model size**: ~23 MB (ONNX format)
- **License**: Apache 2.0

This model is optimized for:
- Semantic similarity search
- Code and documentation embedding
- Fast inference on CPU

## Setup Instructions

### 1. Download the Model Files

You need to download two files:
1. ONNX model file
2. Tokenizer configuration

#### Option A: Manual Download from HuggingFace

```bash
# Create models directory
mkdir -p models

# Download using wget or curl
cd models

# Download ONNX model (you'll need to export it from PyTorch)
# See "Converting to ONNX" section below

# Download tokenizer
wget https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/raw/main/tokenizer.json
```

#### Option B: Using Python (Recommended)

```bash
# Install required packages
pip install sentence-transformers optimum onnx onnxruntime

# Run the conversion script
python scripts/convert_to_onnx.py
```

Create `scripts/convert_to_onnx.py`:

```python
#!/usr/bin/env python3
"""Convert sentence-transformers model to ONNX format"""

from pathlib import Path
from sentence_transformers import SentenceTransformer
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer
import shutil

def main():
    model_name = "sentence-transformers/all-MiniLM-L6-v2"
    output_dir = Path("./models")
    output_dir.mkdir(exist_ok=True)

    print(f"Loading model: {model_name}")

    # Download and convert to ONNX
    model = ORTModelForFeatureExtraction.from_pretrained(
        model_name,
        export=True,
    )

    # Save ONNX model
    onnx_path = output_dir / "all-MiniLM-L6-v2.onnx"
    model.save_pretrained(output_dir)

    # The model is saved as model.onnx, rename it
    if (output_dir / "model.onnx").exists():
        shutil.move(output_dir / "model.onnx", onnx_path)

    print(f"✓ ONNX model saved to: {onnx_path}")

    # Download tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.save_pretrained(output_dir)

    print(f"✓ Tokenizer saved to: {output_dir / 'tokenizer.json'}")
    print("\nSetup complete! Model files are ready to use.")

if __name__ == "__main__":
    main()
```

Run it:

```bash
chmod +x scripts/convert_to_onnx.py
python scripts/convert_to_onnx.py
```

### 2. Verify Model Files

After downloading, your directory structure should look like:

```
context-mcp/
├── models/
│   ├── all-MiniLM-L6-v2.onnx    # ONNX model file
│   └── tokenizer.json            # Tokenizer configuration
├── src/
├── Cargo.toml
└── ...
```

Verify file sizes:
```bash
ls -lh models/
# all-MiniLM-L6-v2.onnx should be ~23 MB
# tokenizer.json should be ~500 KB
```

## Usage

### Basic Usage

```rust
use context_mcp::embedding::{EmbeddingConfig, EmbeddingEngine};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Configure the engine
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
    println!("Is normalized: {}", embedding.is_normalized());

    Ok(())
}
```

### Batch Processing

For better performance when processing multiple texts:

```rust
let texts = vec![
    "First document",
    "Second document",
    "Third document",
];

let embeddings = engine.embed_batch(&texts).await?;

for (text, embedding) in texts.iter().zip(embeddings.iter()) {
    println!("{}: {} dimensions", text, embedding.dimension());
}
```

### Model Information

```rust
let model_info = engine.model_info();

println!("Model: {} v{}", model_info.name, model_info.version);
println!("Dimension: {}", model_info.dimension);
println!("Max length: {}", model_info.max_length);
```

## API Reference

### EmbeddingConfig

Configuration for the embedding engine.

```rust
pub struct EmbeddingConfig {
    pub model_path: PathBuf,      // Path to ONNX model file
    pub tokenizer_path: PathBuf,  // Path to tokenizer.json
    pub max_length: usize,        // Max sequence length (default: 256)
    pub batch_size: usize,        // Batch size (default: 32)
}
```

### EmbeddingEngine

The main embedding engine.

**Methods:**

- `new(config: EmbeddingConfig) -> Result<Self>`
  - Initialize the engine with configuration
  - Loads the ONNX model and tokenizer
  - Returns error if files are missing or invalid

- `embed(&self, text: &str) -> Result<Embedding>`
  - Generate embedding for a single text
  - Returns normalized embedding vector

- `embed_batch(&self, texts: &[&str]) -> Result<Vec<Embedding>>`
  - Generate embeddings for multiple texts
  - More efficient than multiple `embed()` calls
  - Processes texts in batches

- `model_info(&self) -> &ModelInfo`
  - Get model metadata

- `dimension(&self) -> usize`
  - Get embedding dimension (384 for all-MiniLM-L6-v2)

### Embedding

Represents a generated embedding.

```rust
pub struct Embedding {
    pub vector: Vec<f32>,        // Normalized embedding vector
    pub text: String,            // Original text
    pub token_count: usize,      // Number of tokens
}
```

**Methods:**

- `dimension(&self) -> usize` - Get vector dimension
- `is_normalized(&self) -> bool` - Check if L2 norm ≈ 1

### ModelInfo

Metadata about the loaded model.

```rust
pub struct ModelInfo {
    pub name: String,           // Model name
    pub version: String,        // Model version
    pub dimension: usize,       // Embedding dimension
    pub max_length: usize,      // Max sequence length
    pub model_path: PathBuf,    // Path to model file
    pub tokenizer_type: String, // Tokenizer type
}
```

## Performance Considerations

### CPU Optimization

The ONNX Runtime is optimized for CPU inference:

- **Multi-threading**: Uses 4 intra-op threads by default
- **Graph optimization**: Level 3 optimization enabled
- **SIMD**: Utilizes CPU vector instructions when available

### Batch Processing

For best performance:

- Use `embed_batch()` for multiple texts
- Recommended batch size: 16-32 texts
- Larger batches = better throughput, more memory

### Memory Usage

Approximate memory usage:
- Model loading: ~100 MB
- Per text: ~1-2 KB
- Batch of 32: ~50-100 MB peak

### Inference Speed

On a modern CPU (e.g., Intel i7):
- Single text: ~10-20 ms
- Batch of 32: ~50-100 ms (~2-3 ms per text)

## Integration with Context-MCP

### Indexing Service Integration

The embedding engine is used by the Indexing Service to generate embeddings for:
- Code snippets
- Function/class definitions
- Documentation sections

```rust
// Example from indexing service
let code_text = "async fn search_code(query: &str) -> Result<Vec<SearchResult>>";
let embedding = engine.embed(code_text).await?;

// Store in vector database
vector_store.upsert(file_path, embedding.vector, metadata).await?;
```

### Search Service Integration

The search service uses the engine to embed queries:

```rust
// Example from search service
let query = "find async search function";
let query_embedding = engine.embed(query).await?;

// Search in vector database
let results = vector_store.query(query_embedding.vector, top_k).await?;
```

## Troubleshooting

### Model file not found

**Error**: `Model file not found: ./models/all-MiniLM-L6-v2.onnx`

**Solution**: Ensure you've downloaded the model files (see Setup Instructions)

### Tokenizer loading failed

**Error**: `Failed to load tokenizer: No such file or directory`

**Solution**: Download tokenizer.json from HuggingFace

### ONNX Runtime error

**Error**: `Failed to create ONNX environment`

**Solution**:
1. Ensure ONNX Runtime libraries are installed
2. Check that the model file is valid ONNX format
3. Try running with `RUST_LOG=debug` for more details

### Dimension mismatch

**Error**: `Unexpected output shape`

**Solution**:
1. Verify you're using the correct model
2. Check that the model is for sentence embeddings
3. Ensure the ONNX export was successful

## Advanced Topics

### Using Different Models

To use a different sentence-transformer model:

1. Export it to ONNX format using the Python script
2. Update `ModelInfo` in `types.rs` with correct dimensions
3. Update configuration to point to new model file

### Custom Tokenization

If you need custom tokenization:

1. Modify `tokenizer.json` or use a different tokenizer
2. Adjust `max_length` in configuration
3. Consider pre/post-processing requirements

### GPU Acceleration

To enable GPU acceleration:

1. Install ONNX Runtime with GPU support
2. Update `Cargo.toml` to use GPU features
3. Modify session creation to use CUDA/TensorRT execution provider

```rust
// Example (requires CUDA)
.with_execution_providers([ExecutionProvider::CUDA(Default::default())])
```

## References

- [ONNX Runtime Rust API](https://docs.rs/ort/)
- [HuggingFace Tokenizers](https://docs.rs/tokenizers/)
- [all-MiniLM-L6-v2 Model Card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [Sentence Transformers Documentation](https://www.sbert.net/)

## License

The all-MiniLM-L6-v2 model is licensed under Apache 2.0.

---

**Note**: This implementation prioritizes privacy and local execution. All embedding generation happens locally without any external API calls.
