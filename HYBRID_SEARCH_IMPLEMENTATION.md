# Hybrid Search Engine Implementation

## Overview

The Hybrid Search Engine combines BM25 keyword-based search with vector similarity search to provide the best of both worlds:

- **BM25**: Precise keyword matching for exact term queries
- **Vector Search**: Semantic understanding for conceptual similarity

This implementation is part of Task 10.7 in the Context-MCP Rust migration project.

## Architecture

### Components

1. **HybridSearchEngine** (`src/search/hybrid_engine.rs`)
   - Main engine that orchestrates hybrid search
   - Combines BM25Engine, MilvusClient, and EmbeddingEngine
   - Implements score normalization and result merging

2. **Type Definitions** (`src/search/types.rs`)
   - `HybridConfig`: Configuration for hybrid search parameters
   - `HybridResult`: Search result with combined scores
   - `NormalizationType`: Score normalization methods

3. **Score Normalization Functions**
   - `normalize_min_max()`: Min-max normalization to [0, 1]
   - `normalize_z_score()`: Z-score normalization (mean=0, std=1)
   - `normalize_scores()`: Dispatcher for normalization methods

## Algorithm

The hybrid search algorithm works as follows:

```
1. Generate query embedding: vec = embed(query)
2. BM25 search: bm25_results = bm25.search(query, bm25_top_k)
3. Vector search: vector_results = milvus.search(vec, vector_top_k)
4. Normalize scores:
   - norm_bm25 = normalize(bm25_scores)
   - norm_vec = normalize(vec_scores)
5. Combine scores:
   - hybrid_score = alpha * norm_bm25 + (1-alpha) * norm_vec
6. Merge results by ID, sort by hybrid_score, return top_k
```

### Score Normalization

Normalization is crucial because BM25 and vector similarity scores have different scales:

- **BM25 scores**: Typically range from 0 to 10+ (unbounded)
- **Vector similarity (cosine)**: Range from -1 to 1 (bounded)

Three normalization methods are supported:

#### 1. Min-Max Normalization (Default)

Formula: `(x - min) / (max - min)`

- Normalizes scores to [0, 1] range
- Simple and intuitive
- Good for most use cases
- Sensitive to outliers

```rust
let scores = vec![1.0, 2.0, 3.0, 4.0, 5.0];
let normalized = normalize_min_max(&scores);
// Result: [0.0, 0.25, 0.5, 0.75, 1.0]
```

#### 2. Z-Score Normalization

Formula: `(x - mean) / std_dev`

- Normalizes to mean=0, std_dev=1
- Less sensitive to outliers
- Better for skewed distributions
- Scores can be negative

```rust
let scores = vec![2.0, 4.0, 6.0, 8.0, 10.0];
let normalized = normalize_z_score(&scores);
// Result: approximately [-1.41, -0.71, 0.0, 0.71, 1.41]
```

#### 3. No Normalization

- Uses raw scores
- Only recommended when BM25 and vector scores are already comparable
- Rarely used in practice

### Alpha Parameter

The `alpha` parameter controls the balance between BM25 and vector search:

- **alpha = 0.0**: Pure vector search (100% semantic)
- **alpha = 0.3**: Default (30% keyword, 70% semantic)
- **alpha = 0.5**: Equal weight (50% keyword, 50% semantic)
- **alpha = 0.8**: Keyword-heavy (80% keyword, 20% semantic)
- **alpha = 1.0**: Pure BM25 search (100% keyword)

**Choosing alpha:**

| Use Case | Recommended Alpha | Reason |
|----------|------------------|---------|
| Code search with specific function names | 0.6 - 0.8 | Exact names are important |
| Conceptual code search | 0.2 - 0.4 | Semantic understanding is key |
| Documentation search | 0.2 - 0.3 | Natural language benefits from semantics |
| Error message search | 0.5 - 0.7 | Mix of exact strings and concepts |
| General purpose | 0.3 | Balanced, favoring semantics |

## Usage

### Basic Usage

```rust
use context_mcp::search::{BM25Engine, HybridSearchEngine};
use context_mcp::storage::MilvusClient;
use context_mcp::embedding::EmbeddingEngine;
use std::path::Path;

// Initialize components
let bm25 = BM25Engine::new(Path::new("index.db"))?;
let milvus = MilvusClient::new("http://localhost:19530").await?;
let embedding = EmbeddingEngine::new(Default::default()).await?;

// Create hybrid engine
let hybrid = HybridSearchEngine::new(bm25, milvus, embedding);

// Search with default configuration (alpha=0.3, top_k=10)
let results = hybrid.search(
    "parse configuration file",
    "code_vectors",
    10
).await?;

// Print results
for (i, result) in results.iter().enumerate() {
    println!("{}. {} (score: {:.4})", i + 1, result.id, result.score);
    println!("   BM25: {:?}, Vector: {:?}", result.bm25_score, result.vector_score);
    println!("   Matched terms: {:?}", result.matched_terms);
}
```

### Custom Configuration

```rust
use context_mcp::search::{HybridConfig, NormalizationType};

// Create custom configuration
let config = HybridConfig::new(0.4, 20)  // 40% keyword, 60% semantic, top 20 results
    .with_bm25_top_k(100)                // Fetch 100 BM25 candidates
    .with_vector_top_k(80)                // Fetch 80 vector candidates
    .with_normalization(NormalizationType::ZScore);

// Search with custom configuration
let results = hybrid.search_with_config(
    "error handling in HTTP requests",
    "code_vectors",
    config
).await?;
```

### Configuration Options

#### HybridConfig Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `alpha` | f32 | 0.3 | BM25 weight (0.0 to 1.0) |
| `top_k` | usize | 10 | Number of final results |
| `bm25_top_k` | usize | 30 | Candidates from BM25 |
| `vector_top_k` | usize | 30 | Candidates from vector search |
| `normalization` | NormalizationType | MinMax | Score normalization method |

**Why fetch more candidates?**

Fetching more candidates (e.g., 3x `top_k`) from each source improves recall:

- Some documents may rank high in BM25 but low in vector search (or vice versa)
- Fetching more candidates ensures we don't miss relevant results
- The hybrid combination may elevate items that were mid-ranked in both sources

## Result Interpretation

### HybridResult Structure

```rust
pub struct HybridResult {
    pub id: String,                    // Document ID
    pub score: f32,                    // Combined hybrid score
    pub bm25_score: Option<f32>,       // BM25 component (if found)
    pub vector_score: Option<f32>,     // Vector component (if found)
    pub record: VectorRecord,          // Full record data
    pub matched_terms: Vec<String>,    // BM25 matched terms
}
```

### Result Categories

1. **Hybrid Results** (`is_hybrid() == true`)
   - Found by both BM25 and vector search
   - Has both `bm25_score` and `vector_score`
   - Usually the most relevant results
   - Score: `alpha * norm_bm25 + (1-alpha) * norm_vec`

2. **BM25-Only Results** (`has_bm25() && !has_vector()`)
   - Found only by keyword search
   - Has `bm25_score`, no `vector_score`
   - Strong keyword matches
   - Score: `alpha * norm_bm25`

3. **Vector-Only Results** (`has_vector() && !has_bm25()`)
   - Found only by semantic search
   - Has `vector_score`, no `bm25_score`
   - Semantically similar but different keywords
   - Score: `(1-alpha) * norm_vec`

### Example Results Analysis

```
Query: "parse configuration file"

Rank  File               Score   BM25    Vector  Type
------------------------------------------------------------
1.    config_parser.rs   0.9234  0.856   0.945   Hybrid (best of both)
2.    file_reader.rs     0.8123  0.723   0.834   Hybrid
3.    settings_loader.rs 0.7456  -       0.912   Vector-only (semantic match)
4.    parse_utils.rs     0.6789  0.945   -       BM25-only (keyword match)
```

## Performance Considerations

### Time Complexity

- **BM25 search**: O(n * m) where n = unique query terms, m = documents
- **Vector search**: O(log n) with HNSW index
- **Score normalization**: O(k) where k = number of candidates
- **Result merging**: O(k) with HashMap

**Total**: Dominated by search operations, typically < 100ms for thousands of documents

### Memory Usage

- BM25 index: ~100 bytes per document (SQLite)
- Vector index: ~1.5KB per document (384-dim vectors)
- Runtime: Minimal, only stores top_k results

### Optimization Tips

1. **Tune candidate fetch size**
   - Start with 3x `top_k` (default)
   - Increase if recall is insufficient
   - Decrease if performance is an issue

2. **Choose appropriate normalization**
   - MinMax: Faster, good for most cases
   - Z-Score: Better for skewed distributions

3. **Adjust alpha based on query type**
   - Programmatically detect query patterns
   - Use higher alpha for queries with code-like tokens
   - Use lower alpha for natural language queries

4. **Cache embeddings**
   - Cache query embeddings for repeated searches
   - Reduces embedding computation overhead

## Testing

### Unit Tests

The implementation includes comprehensive unit tests:

```bash
# Run all tests
cargo test

# Run only hybrid search tests
cargo test hybrid

# Run with output
cargo test -- --nocapture
```

### Test Coverage

- ✅ Min-max normalization (normal, single, equal, empty)
- ✅ Z-score normalization (normal, single, equal, empty)
- ✅ Score normalization dispatcher
- ✅ HybridConfig validation
- ✅ HybridConfig builder pattern
- ✅ Result type checking (is_hybrid, has_bm25, has_vector)

### Example Usage Test

```bash
# Run the hybrid search example
cargo run --example hybrid_search_usage

# Prerequisites:
# - Milvus running at localhost:19530
# - ONNX model at ./models/all-MiniLM-L6-v2.onnx
# - Tokenizer at ./models/tokenizer.json
```

## Edge Cases

### Handling Empty Results

```rust
// If BM25 returns no results but vector search does
// - Only vector scores contribute
// - Final score = (1-alpha) * norm_vec

// If vector search returns no results but BM25 does
// - Only BM25 scores contribute
// - Final score = alpha * norm_bm25

// If both return no results
// - Empty result set returned
```

### Handling Single-Source Results

```rust
// Document appears in only one source
if has_bm25() && !has_vector() {
    score = alpha * normalized_bm25_score;
}
if has_vector() && !has_bm25() {
    score = (1.0 - alpha) * normalized_vector_score;
}
```

### Score Range Edge Cases

- **All scores identical**: Normalized to 1.0 (MinMax) or 0.0 (Z-Score)
- **Single score**: Normalized to 1.0 (MinMax) or 0.0 (Z-Score)
- **Empty score list**: Returns empty vector

## Integration with Context-MCP

The Hybrid Search Engine integrates with the MCP server through the `search_code` tool:

```rust
// In MCP tool handler
async fn handle_search_code(
    query: String,
    project_id: String,
    top_k: usize,
) -> Result<Vec<SearchResult>> {
    let hybrid_engine = get_hybrid_engine();

    // Use default configuration or load from user preferences
    let results = hybrid_engine
        .search(&query, "code_vectors", top_k)
        .await?;

    // Convert HybridResult to MCP SearchResult format
    convert_to_mcp_results(results)
}
```

## Future Enhancements

1. **Adaptive Alpha**
   - Automatically adjust alpha based on query characteristics
   - Learn optimal alpha from user feedback

2. **Query Expansion**
   - Expand queries with synonyms for better recall
   - Use BM25 to identify important query terms

3. **Re-ranking**
   - Apply additional re-ranking based on metadata
   - Consider recency, file type, project structure

4. **Caching**
   - Cache normalized scores for frequently searched terms
   - Cache query embeddings

5. **Parallel Search**
   - Execute BM25 and vector search in parallel
   - Reduce total search latency

## References

- **BM25 Algorithm**: Robertson et al., "Okapi at TREC-3" (1994)
- **Hybrid Search**: "Best of Both Worlds: Keyword and Semantic Search" (Elastic)
- **Score Normalization**: "Combining Heterogeneous Sources" (Manning et al.)
- **Context-MCP Design**: `docs/design.md` Component 7

## Contributing

When contributing to the hybrid search engine:

1. Maintain backward compatibility with existing configurations
2. Add comprehensive tests for new features
3. Update this documentation with changes
4. Benchmark performance impact of changes
5. Follow Rust best practices and project style guide

## License

This implementation is part of the Context-MCP project, licensed under MIT License.

## Authors

- Context-MCP Contributors
- Implemented as part of Task 10.7 (Rust Migration)

---

**Last Updated**: 2025-11-16
**Version**: 1.0.0
