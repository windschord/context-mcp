# BM25 Full-Text Search Module

This module provides a BM25-based full-text search engine optimized for code search. It will be integrated with vector search to create a hybrid search system.

## Features

- **BM25 Ranking Algorithm**: Industry-standard probabilistic ranking
- **Code-Aware Tokenization**: Handles camelCase, snake_case, and PascalCase
- **SQLite Backend**: Persistent storage with ACID guarantees
- **Metadata Support**: Attach arbitrary metadata to documents
- **Batch Operations**: Efficient batch indexing
- **Configurable**: Customize BM25 parameters and tokenization
- **Comprehensive Tests**: Unit tests for all components

## Quick Start

```rust
use context_mcp::search::BM25Engine;
use std::path::Path;

// Create engine
let mut engine = BM25Engine::new(Path::new("index.db"))?;

// Index documents
engine.index_document("file.rs:10", "pub fn parse_config() {}")?;

// Search
let results = engine.search("parse config", 10)?;
```

## Module Structure

```
src/search/
├── mod.rs              # Module exports
├── types.rs            # Core types (Document, BM25Result, etc.)
├── tokenizer.rs        # Code-aware tokenization
└── bm25_engine.rs      # BM25 engine implementation
```

## Core Types

### BM25Engine
Main search engine with indexing and search capabilities.

**Key Methods:**
- `new(db_path)` - Create file-backed engine
- `new_in_memory()` - Create in-memory engine
- `index_document(id, text)` - Index a document
- `search(query, top_k)` - Search documents
- `remove_document(id)` - Remove document
- `clear()` - Clear all documents
- `document_count()` - Get total documents
- `get_stats()` - Get index statistics

### Tokenizer
Code-aware text tokenization.

**Features:**
- camelCase splitting: `getUserById` → `["get", "user", "by", "id"]`
- snake_case splitting: `get_user_by_id` → `["get", "user", "by", "id"]`
- PascalCase: `HTTPServer` → `["HTTP", "Server"]`
- Configurable normalization

**Factory Methods:**
- `Tokenizer::code()` - Optimized for code (default)
- `Tokenizer::text()` - Optimized for natural language
- `Tokenizer::new()` - Custom configuration

### BM25Config
BM25 algorithm parameters.

**Parameters:**
- `k1` (default: 1.2) - Term frequency saturation
- `b` (default: 0.75) - Length normalization

## Examples

### Basic Usage

```rust
let mut engine = BM25Engine::new_in_memory()?;

engine.index_document("doc1", "fn parse_config() {}")?;
engine.index_document("doc2", "struct Config {}")?;

let results = engine.search("config", 10)?;
for result in results {
    println!("{}: {:.4}", result.id, result.score);
}
```

### With Metadata

```rust
use std::collections::HashMap;

let mut metadata = HashMap::new();
metadata.insert("language".to_string(), "rust".to_string());

let doc = Document::with_metadata(
    "file.rs".to_string(),
    "fn main() {}".to_string(),
    metadata,
);

engine.index_document_with_metadata(doc)?;
```

### Custom Configuration

```rust
let config = BM25Config::new(1.5, 0.9);
let tokenizer = Tokenizer::code().with_min_term_length(3);

let engine = BM25Engine::new_in_memory()?
    .with_tokenizer(tokenizer)
    .with_config(config)?;
```

### Search Options

```rust
let options = SearchOptions::new()
    .with_top_k(20)
    .with_min_score(1.0)
    .with_include_text(true);

let results = engine.search_with_options("query", options)?;
```

## Testing

Run tests:
```bash
cargo test search
```

Run example:
```bash
cargo run --example bm25_usage
```

## Performance

- **Indexing**: O(n) per document, n = document length
- **Search**: O(m × k + k log k), m = query terms, k = candidates
- **Typical**: 10,000 files in ~2-5 seconds

## Integration with Hybrid Search

This BM25 engine will be combined with vector search:

```rust
// BM25 results
let bm25_results = bm25_engine.search(query, 100)?;

// Vector results
let vector_results = vector_engine.search(embedding, 100)?;

// Hybrid scoring
final_score = 0.3 × bm25_score + 0.7 × vector_score
```

## Documentation

See [BM25_IMPLEMENTATION.md](../../BM25_IMPLEMENTATION.md) for detailed documentation including:
- BM25 algorithm explanation
- Architecture details
- Database schema
- Performance analysis
- Integration guide

## Future Enhancements

- [ ] Phrase queries ("exact match")
- [ ] Boolean operators (AND, OR, NOT)
- [ ] Field-specific search
- [ ] Snippet extraction with highlighting
- [ ] Parallel indexing
- [ ] Query expansion

## License

MIT
