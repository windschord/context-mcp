# BM25 Search Engine - Quick Reference

## 30-Second Start

```rust
use context_mcp::search::BM25Engine;
use std::path::Path;

let mut engine = BM25Engine::new(Path::new("index.db"))?;
engine.index_document("doc1", "fn parse_config() {}")?;
let results = engine.search("parse", 10)?;
```

## Common Patterns

### In-Memory (Testing/Development)
```rust
let mut engine = BM25Engine::new_in_memory()?;
```

### Persistent Database
```rust
let mut engine = BM25Engine::new(Path::new("/path/to/index.db"))?;
```

### Batch Indexing
```rust
let docs = vec![
    ("id1".to_string(), "text1".to_string()),
    ("id2".to_string(), "text2".to_string()),
];
engine.index_documents(docs)?;
```

### Search with Options
```rust
use context_mcp::search::SearchOptions;

let options = SearchOptions::new()
    .with_top_k(20)
    .with_min_score(0.5);

let results = engine.search_with_options("query", options)?;
```

### Custom Configuration
```rust
use context_mcp::search::{BM25Config, Tokenizer};

let config = BM25Config::new(1.5, 0.9);  // k1, b
let tokenizer = Tokenizer::code().with_min_term_length(3);

let engine = BM25Engine::new_in_memory()?
    .with_tokenizer(tokenizer)
    .with_config(config)?;
```

### With Metadata
```rust
use context_mcp::search::Document;
use std::collections::HashMap;

let mut metadata = HashMap::new();
metadata.insert("lang".to_string(), "rust".to_string());

let doc = Document::with_metadata(
    "file.rs".to_string(),
    "fn main() {}".to_string(),
    metadata,
);

engine.index_document_with_metadata(doc)?;
```

### Update Document
```rust
// Re-index with same ID (old version auto-removed)
engine.index_document("doc1", "new content")?;
```

### Remove Document
```rust
engine.remove_document("doc1")?;
```

### Clear All
```rust
engine.clear()?;
```

### Get Statistics
```rust
let stats = engine.get_stats()?;
println!("Documents: {}", stats.document_count);
println!("Terms: {}", stats.term_count);
println!("Avg length: {:.2}", stats.avg_doc_length);
```

## Tokenizer Types

```rust
// Code-aware (default): splits camelCase, snake_case
let code_tokenizer = Tokenizer::code();

// Natural language: no splitting
let text_tokenizer = Tokenizer::text();

// Custom
let custom = Tokenizer::new()
    .with_lowercase(true)
    .with_split_camel_case(true)
    .with_split_snake_case(true)
    .with_min_term_length(2);
```

## Tokenization Examples

```rust
let tokenizer = Tokenizer::code();

// camelCase
tokenizer.tokenize("getUserById")
// → ["get", "user", "by", "id"]

// snake_case
tokenizer.tokenize("get_user_by_id")
// → ["get", "user", "by", "id"]

// PascalCase
tokenizer.tokenize("HTTPServer")
// → ["http", "server"]
```

## Result Structure

```rust
pub struct BM25Result {
    pub id: String,                    // Document ID
    pub score: f32,                    // BM25 score (higher = better)
    pub matched_terms: Vec<String>,    // Matched query terms
    pub text: String,                  // Document text
    pub metadata: HashMap<String, String>, // Metadata
}
```

## BM25 Parameters

### k1 (Term Frequency Saturation)
- **Default**: 1.2
- **Range**: [0, ∞)
- **Effect**: Higher = more weight to term frequency
- **Typical**: 1.2 - 2.0

### b (Length Normalization)
- **Default**: 0.75
- **Range**: [0, 1]
- **Effect**: Higher = more penalty for long documents
- **Typical**: 0.5 - 0.9 for code, 0.75 - 0.85 for text

## Error Handling

```rust
match engine.search("query", 10) {
    Ok(results) => {
        for result in results {
            println!("{}: {:.4}", result.id, result.score);
        }
    },
    Err(e) => {
        eprintln!("Search error: {}", e);
    }
}
```

## Performance Tips

1. **Batch index** multiple documents instead of one-by-one
2. **Reuse engine** instead of creating new instances
3. **Use top_k** to limit results (faster)
4. **Set min_score** to filter low-quality results
5. **Use with_include_text(false)** if text not needed

## Common Use Cases

### Code Search
```rust
// Search for function names
let results = engine.search("parseConfig", 10)?;

// Search for concepts
let results = engine.search("database connection", 10)?;
```

### Symbol Lookup
```rust
// Find where "Config" appears
let results = engine.search("Config", 100)?;
```

### Documentation Search
```rust
// Index documentation
engine.index_document("README.md", readme_content)?;
engine.index_document("API.md", api_content)?;

// Search docs and code together
let results = engine.search("how to configure", 10)?;
```

## Testing

```rust
#[test]
fn test_basic_search() {
    let mut engine = BM25Engine::new_in_memory().unwrap();
    engine.index_document("doc1", "hello world").unwrap();

    let results = engine.search("hello", 10).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "doc1");
}
```

## Integration with Vector Search (Task 10.7)

```rust
// BM25 search
let bm25_results = bm25_engine.search(query, 100)?;

// Vector search (placeholder - to be implemented)
let vector_results = vector_engine.search(embedding, 100)?;

// Hybrid scoring
let alpha = 0.3;
for (bm25, vector) in bm25_results.iter().zip(vector_results.iter()) {
    let hybrid_score = alpha * bm25.score + (1.0 - alpha) * vector.score;
    println!("{}: {:.4}", bm25.id, hybrid_score);
}
```

## Troubleshooting

### Issue: No results found
- Check tokenization: `tokenizer.tokenize(query)`
- Verify documents are indexed: `engine.document_count()?`
- Try broader query or lower min_score

### Issue: Poor ranking
- Adjust k1 and b parameters
- Check if documents have similar lengths
- Consider using hybrid search

### Issue: Slow search
- Reduce top_k
- Add min_score threshold
- Check database size: `engine.get_stats()?`

## Documentation

- **Full docs**: `BM25_IMPLEMENTATION.md`
- **Module docs**: `src/search/README.md`
- **Examples**: `examples/bm25_usage.rs`
- **Tests**: Run `cargo test search`
