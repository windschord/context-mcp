# BM25 Full-Text Search Engine Implementation

## Overview

This document describes the BM25 (Best Matching 25) full-text search engine implementation for the Context-MCP project. The BM25 engine provides keyword-based search capabilities that will be combined with vector search to create a hybrid search system.

## Table of Contents

- [BM25 Algorithm](#bm25-algorithm)
- [Architecture](#architecture)
- [Implementation Details](#implementation-details)
- [Indexing Process](#indexing-process)
- [Search and Ranking](#search-and-ranking)
- [Performance Characteristics](#performance-characteristics)
- [Integration with Hybrid Search](#integration-with-hybrid-search)
- [API Reference](#api-reference)
- [Examples](#examples)

## BM25 Algorithm

### Overview

BM25 (Best Matching 25) is a probabilistic ranking function used for document retrieval. It's an improvement over TF-IDF that addresses the problem of term frequency saturation and document length normalization.

### Formula

The BM25 score for a document D given query Q is:

```
score(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
```

Where:
- **D** = document being scored
- **Q** = query
- **qi** = i-th term in the query
- **f(qi, D)** = frequency of term qi in document D
- **|D|** = length of document D (number of terms)
- **avgdl** = average document length in the collection
- **k1** = term frequency saturation parameter (default: 1.2)
- **b** = length normalization parameter (default: 0.75)

The IDF (Inverse Document Frequency) is calculated as:

```
IDF(qi) = log((N - df(qi) + 0.5) / (df(qi) + 0.5) + 1)
```

Where:
- **N** = total number of documents in the collection
- **df(qi)** = number of documents containing term qi

### Parameters

#### k1 (Term Frequency Saturation)
- **Range**: [0, ∞)
- **Default**: 1.2
- **Effect**: Controls how quickly term frequency saturates
  - Higher values give more weight to term frequency
  - Lower values saturate faster, limiting the impact of very high term frequencies
  - k1 = 0 makes the model binary (presence/absence only)

#### b (Length Normalization)
- **Range**: [0, 1]
- **Default**: 0.75
- **Effect**: Controls document length normalization
  - b = 0: No length normalization (all documents treated equally)
  - b = 1: Full length normalization (longer documents penalized proportionally)
  - Typical values: 0.75 for general text, lower for code (0.5-0.7)

## Architecture

### Module Structure

```
src/search/
├── mod.rs              # Module exports and documentation
├── types.rs            # Type definitions (Document, BM25Result, BM25Config, etc.)
├── tokenizer.rs        # Text tokenization and normalization
└── bm25_engine.rs      # BM25 engine implementation
```

### Components

#### 1. BM25Engine
The main search engine that manages indexing and search operations.

**Key Responsibilities:**
- Database connection and schema management
- Document indexing and deletion
- BM25 score calculation
- Result ranking and retrieval

#### 2. Tokenizer
Handles text-to-terms conversion with code-aware features.

**Features:**
- camelCase splitting: `getUserById` → `["get", "user", "by", "id"]`
- snake_case splitting: `get_user_by_id` → `["get", "user", "by", "id"]`
- PascalCase handling: `HTTPServer` → `["HTTP", "Server"]`
- Lowercase normalization
- Term length filtering
- Configurable for code vs. natural language

#### 3. Type System
Strongly-typed interfaces for all operations.

**Key Types:**
- `Document`: Input document with ID, text, and metadata
- `BM25Result`: Search result with score and matched terms
- `BM25Config`: Algorithm configuration (k1, b)
- `SearchOptions`: Search customization (top_k, min_score, etc.)
- `IndexStats`: Index statistics (document count, term count, etc.)

### Database Schema

```sql
-- Documents table
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    length INTEGER NOT NULL,        -- Number of terms in document
    text TEXT NOT NULL,              -- Full document text
    metadata TEXT DEFAULT '{}'       -- JSON-encoded metadata
);

-- Inverted index table
CREATE TABLE inverted_index (
    term TEXT NOT NULL,              -- Normalized term
    doc_id TEXT NOT NULL,            -- Reference to document
    frequency INTEGER NOT NULL,      -- Term frequency in document
    PRIMARY KEY (term, doc_id),
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_term ON inverted_index(term);
CREATE INDEX idx_doc_id ON inverted_index(doc_id);
```

## Implementation Details

### Storage Backend: SQLite

**Why SQLite?**
- Zero-configuration: No separate server process required
- ACID compliance: Data consistency guaranteed
- Excellent query performance for small-to-medium datasets
- Built-in full-text search extensions available (not used, but good to have)
- Cross-platform compatibility
- Embeddable: Single file, easy to distribute

**Optimizations:**
- Prepared statements for repeated queries
- Transaction batching for bulk operations
- Foreign key constraints for data integrity
- Indexes on term and doc_id columns
- Optional: Write-ahead logging (WAL) for concurrency

### Code-Aware Tokenization

The tokenizer is specifically designed for source code, handling common programming conventions:

#### camelCase Splitting
```rust
"getUserById" → ["get", "user", "by", "id"]
"HTTPServer" → ["HTTP", "Server"]
"getHTTPResponseCode" → ["get", "HTTP", "Response", "Code"]
```

#### snake_case Splitting
```rust
"get_user_by_id" → ["get", "user", "by", "id"]
"HTTP_SERVER" → ["HTTP", "SERVER"]
"__private" → ["private"]
```

#### Mixed Conventions
```rust
"parse_HTTPRequest" → ["parse", "HTTP", "Request"]
```

This ensures that searches for "user", "getUser", or "get_user" will all match relevant code.

### Normalization Pipeline

1. **Extraction**: Extract alphanumeric sequences and underscores
2. **Splitting**: Apply camelCase and snake_case splitting
3. **Lowercase**: Convert to lowercase (configurable)
4. **Filtering**: Remove terms shorter than min_term_length
5. **Deduplication**: For unique term extraction

## Indexing Process

### Single Document Indexing

```rust
let mut engine = BM25Engine::new(Path::new("index.db"))?;
engine.index_document("file.rs:10", "pub fn parse_config() {}")?;
```

**Steps:**
1. Remove existing document with same ID (if exists)
2. Tokenize document text
3. Calculate term frequencies
4. Serialize metadata (if any)
5. Insert document into `documents` table
6. Insert term frequencies into `inverted_index` table
7. Invalidate cached average document length

**Transaction Safety:**
All operations within a single `index_document` call are atomic. If any step fails, the entire operation is rolled back.

### Batch Indexing

```rust
let docs = vec![
    ("doc1".to_string(), "text 1".to_string()),
    ("doc2".to_string(), "text 2".to_string()),
];
engine.index_documents(docs)?;
```

**Optimization Opportunities:**
- Future: Implement transaction batching for bulk inserts
- Future: Parallel tokenization using rayon
- Future: Bulk insert statements for better performance

### Incremental Updates

To update a document:
```rust
// Re-index with same ID - old version is automatically removed
engine.index_document("doc1", "new content")?;
```

The engine automatically handles:
- Removing old inverted index entries
- Updating document text and metadata
- Recalculating term frequencies
- Maintaining index consistency

## Search and Ranking

### Search Flow

```rust
let results = engine.search("parse config", 10)?;
```

**Steps:**
1. **Query Tokenization**: Tokenize query → `["parse", "config"]`
2. **IDF Calculation**: Calculate IDF for each query term
3. **Candidate Retrieval**: Get all documents containing at least one query term
4. **Scoring**: Calculate BM25 score for each candidate document
5. **Filtering**: Apply minimum score threshold (if specified)
6. **Ranking**: Sort by score (descending)
7. **Truncation**: Return top-k results

### Score Calculation

For each candidate document:

```rust
fn calculate_bm25_score(
    doc_id: &str,
    query_terms: &[String],
    term_idfs: &HashMap<String, f32>,
    avg_doc_length: f32,
) -> f32 {
    let mut score = 0.0;

    for term in query_terms {
        let idf = term_idfs[term];
        let tf = get_term_frequency(doc_id, term);
        let doc_length = get_document_length(doc_id);

        // BM25 formula
        let numerator = tf * (k1 + 1.0);
        let denominator = tf + k1 * (1.0 - b + b * doc_length / avg_doc_length);
        score += idf * (numerator / denominator);
    }

    score
}
```

### Result Structure

```rust
pub struct BM25Result {
    pub id: String,                      // Document ID
    pub score: f32,                      // BM25 score
    pub matched_terms: Vec<String>,      // Query terms that matched
    pub text: String,                    // Document text (optional)
    pub metadata: HashMap<String, String>, // Document metadata (optional)
}
```

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Indexing (single) | O(n) | n = document length (tokens) |
| Indexing (batch) | O(N * n) | N = number of docs, n = avg length |
| Search (query) | O(m * k + k log k) | m = query terms, k = candidates |
| Delete | O(t) | t = unique terms in document |
| Clear | O(1) | SQLite DELETE is fast |

### Space Complexity

- **Documents table**: O(N * L) where N = documents, L = avg length
- **Inverted index**: O(V * D) where V = vocabulary size, D = avg docs per term
- **Total**: Approximately 2-3x the size of raw text

### Scalability

**Current Implementation:**
- Optimized for: 1,000 - 100,000 documents
- Suitable for: Single codebase indexing
- Document size: Up to ~100KB per document

**Performance Benchmarks (estimated):**
- Index 10,000 files: ~2-5 seconds
- Search query: <100ms
- Memory usage: ~10-50MB (depending on index size)

**Future Optimizations:**
- Batch insert/update with single transaction
- Parallel tokenization
- Bloom filters for term existence checks
- Compressed inverted index
- SQLite FTS5 integration for even faster queries

## Integration with Hybrid Search

The BM25 engine is designed to work seamlessly with vector search in a hybrid configuration.

### Hybrid Search Formula

```
final_score = α * BM25_score + (1-α) * vector_similarity_score
```

Where:
- **α** = weighting factor (default: 0.3)
- Higher α: More weight on keyword matching (BM25)
- Lower α: More weight on semantic similarity (vector)

### Integration Points

```rust
// BM25 search
let bm25_results = bm25_engine.search(query, 100)?;

// Vector search
let vector_results = vector_engine.search(query_embedding, 100)?;

// Merge results
let hybrid_results = merge_results(bm25_results, vector_results, alpha=0.3);
```

### Use Cases

**When BM25 is better:**
- Exact keyword matches (function names, variable names)
- Code symbol search
- Short queries with specific terms
- Domain-specific terminology

**When Vector Search is better:**
- Semantic similarity ("how to parse JSON" → JSON parsing code)
- Conceptual queries
- Paraphrased queries
- Cross-language search

**Hybrid combines both:**
- Best of both worlds
- Robust to different query types
- Better overall ranking quality

## API Reference

### BM25Engine

#### Constructor

```rust
// File-backed database
pub fn new(db_path: &Path) -> Result<Self>

// In-memory database (testing)
pub fn new_in_memory() -> Result<Self>
```

#### Configuration

```rust
// Set custom tokenizer
pub fn with_tokenizer(mut self, tokenizer: Tokenizer) -> Self

// Set custom BM25 config
pub fn with_config(mut self, config: BM25Config) -> Result<Self>
```

#### Indexing

```rust
// Index single document
pub fn index_document(&mut self, id: &str, text: &str) -> Result<()>

// Index with metadata
pub fn index_document_with_metadata(&mut self, doc: Document) -> Result<()>

// Batch index
pub fn index_documents(&mut self, docs: Vec<(String, String)>) -> Result<()>

// Batch index with metadata
pub fn index_documents_batch(&mut self, docs: Vec<Document>) -> Result<()>
```

#### Search

```rust
// Basic search
pub fn search(&self, query: &str, top_k: usize) -> Result<Vec<BM25Result>>

// Search with options
pub fn search_with_options(&self, query: &str, options: SearchOptions) -> Result<Vec<BM25Result>>
```

#### Management

```rust
// Remove document
pub fn remove_document(&mut self, id: &str) -> Result<()>

// Clear all documents
pub fn clear(&mut self) -> Result<()>

// Get document count
pub fn document_count(&self) -> Result<usize>

// Get statistics
pub fn get_stats(&self) -> Result<IndexStats>
```

### Tokenizer

```rust
// Constructors
pub fn new() -> Self                  // Default tokenizer
pub fn code() -> Self                 // Code-optimized
pub fn text() -> Self                 // Natural language optimized

// Configuration
pub fn with_lowercase(mut self, lowercase: bool) -> Self
pub fn with_split_camel_case(mut self, split: bool) -> Self
pub fn with_split_snake_case(mut self, split: bool) -> Self
pub fn with_min_term_length(mut self, length: usize) -> Self

// Tokenization
pub fn tokenize(&self, text: &str) -> Vec<String>
pub fn get_unique_terms(&self, text: &str) -> Vec<String>
```

### BM25Config

```rust
// Constructor
pub fn new(k1: f32, b: f32) -> Self
pub fn default() -> Self              // k1=1.2, b=0.75

// Validation
pub fn validate(&self) -> Result<(), String>
```

### SearchOptions

```rust
// Constructor
pub fn new() -> Self

// Builder methods
pub fn with_top_k(mut self, top_k: usize) -> Self
pub fn with_min_score(mut self, min_score: f32) -> Self
pub fn with_include_text(mut self, include_text: bool) -> Self
pub fn with_include_metadata(mut self, include_metadata: bool) -> Self
```

## Examples

### Basic Usage

```rust
use context_mcp::search::BM25Engine;
use std::path::Path;

// Create engine
let mut engine = BM25Engine::new(Path::new("index.db"))?;

// Index documents
engine.index_document("file1.rs", "pub fn parse_config() {}")?;
engine.index_document("file2.rs", "struct Config { /* ... */ }")?;

// Search
let results = engine.search("parse config", 10)?;
for result in results {
    println!("{}: {:.4}", result.id, result.score);
}
```

### With Metadata

```rust
use context_mcp::search::{BM25Engine, Document};
use std::collections::HashMap;

let mut engine = BM25Engine::new_in_memory()?;

let mut metadata = HashMap::new();
metadata.insert("language".to_string(), "rust".to_string());
metadata.insert("type".to_string(), "function".to_string());

let doc = Document::with_metadata(
    "file.rs:10".to_string(),
    "pub fn validate(input: &str) -> bool".to_string(),
    metadata,
);

engine.index_document_with_metadata(doc)?;

let results = engine.search("validate", 5)?;
println!("Language: {}", results[0].metadata["language"]);
```

### Custom Configuration

```rust
use context_mcp::search::{BM25Config, BM25Engine, Tokenizer};

// Custom BM25 parameters
let config = BM25Config::new(1.5, 0.9);

// Custom tokenizer
let tokenizer = Tokenizer::code()
    .with_min_term_length(3);

let mut engine = BM25Engine::new_in_memory()?
    .with_tokenizer(tokenizer)
    .with_config(config)?;
```

### Advanced Search

```rust
use context_mcp::search::SearchOptions;

let options = SearchOptions::new()
    .with_top_k(20)
    .with_min_score(1.0)
    .with_include_text(true)
    .with_include_metadata(true);

let results = engine.search_with_options("query", options)?;
```

## Future Enhancements

### Short-term
- [ ] Phrase query support ("exact phrase matching")
- [ ] Boolean operators (AND, OR, NOT)
- [ ] Field-specific search (search only in function names, etc.)
- [ ] Snippet extraction with highlighted matches

### Medium-term
- [ ] Parallel indexing using rayon
- [ ] Incremental indexing optimizations
- [ ] Query expansion (synonyms, stemming)
- [ ] Relevance feedback

### Long-term
- [ ] Distributed indexing for very large codebases
- [ ] Real-time indexing with minimal latency
- [ ] Machine learning ranking signals
- [ ] Personalized search results

## References

- [BM25 Wikipedia](https://en.wikipedia.org/wiki/Okapi_BM25)
- [BM25 Paper - Robertson & Zaragoza (2009)](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf)
- [Elasticsearch BM25](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-modules-similarity.html)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
