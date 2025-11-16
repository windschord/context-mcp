# Quick Hybrid Search Guide

## Basic Usage

```rust
use context_mcp::search::{BM25Engine, HybridSearchEngine};
use context_mcp::storage::MilvusClient;
use context_mcp::embedding::EmbeddingEngine;

// Initialize
let bm25 = BM25Engine::new(Path::new("index.db"))?;
let milvus = MilvusClient::new("localhost:19530").await?;
let embedding = EmbeddingEngine::new(Default::default()).await?;
let hybrid = HybridSearchEngine::new(bm25, milvus, embedding);

// Search
let results = hybrid.search("parse config file", "code_vectors", 10).await?;
```

## Custom Configuration

```rust
use context_mcp::search::{HybridConfig, NormalizationType};

let config = HybridConfig::new(0.4, 20)  // 40% keyword, 60% semantic
    .with_normalization(NormalizationType::ZScore);

let results = hybrid.search_with_config("query", "code_vectors", config).await?;
```

## Alpha Values

- `alpha = 0.0`: Pure semantic search
- `alpha = 0.3`: Default (30% keyword, 70% semantic)
- `alpha = 0.5`: Balanced
- `alpha = 0.8`: Keyword-heavy
- `alpha = 1.0`: Pure keyword search

## Interpreting Results

```rust
for result in results {
    println!("{}: {:.4}", result.id, result.score);
    
    if result.is_hybrid() {
        println!("  Found by both BM25 and vector search");
    } else if result.has_bm25() {
        println!("  Found by keyword search only");
    } else {
        println!("  Found by semantic search only");
    }
    
    println!("  Matched terms: {:?}", result.matched_terms);
}
```

## See Also

- Full documentation: `HYBRID_SEARCH_IMPLEMENTATION.md`
- Working example: `examples/hybrid_search_usage.rs`
- Implementation details: `src/search/hybrid_engine.rs`
