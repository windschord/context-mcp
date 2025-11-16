# Storage Module

This module provides vector database integration for Context-MCP using Milvus.

## Overview

The storage module abstracts vector database operations for storing and querying code embeddings. It provides:

- Collection management (create, drop, check existence)
- Vector operations (insert, delete, search)
- Metadata filtering and querying
- Batch operations for efficiency
- Support for both local Milvus and Zilliz Cloud

## Components

### MilvusClient

Main client for interacting with Milvus vector database.

**Key Methods:**
- `new(address)` - Connect to Milvus
- `create_collection(config)` - Create a new collection
- `insert(collection, records)` - Insert vector records
- `search(collection, query)` - Perform similarity search
- `delete(collection, ids)` - Delete records by ID
- `flush(collection)` - Persist data to disk

### Type Definitions

#### VectorRecord
Represents a code embedding with metadata.

**Fields:**
- `id` - Unique identifier (format: "file_path:line_start")
- `vector` - Embedding vector (Vec<f32>)
- `project_id` - Project identifier
- `file_path` - Source file path
- `language` - Programming language
- `symbol_type` - Type of symbol (function, class, etc.)
- `symbol_name` - Name of the symbol
- `line_start/line_end` - Line range
- `snippet` - Code snippet
- `docstring` - Documentation
- `metadata` - Additional metadata as HashMap

#### SearchQuery
Parameters for vector similarity search.

**Fields:**
- `vector` - Query vector
- `top_k` - Number of results to return
- `filters` - Optional metadata filters (Milvus expression syntax)
- `output_fields` - Fields to include in results
- `search_params` - Index-specific search parameters

#### SearchResult
Result from similarity search.

**Fields:**
- `id` - Record ID
- `score` - Similarity score
- `record` - Full VectorRecord

#### CollectionConfig
Configuration for creating a collection.

**Fields:**
- `name` - Collection name
- `description` - Collection description
- `dimension` - Vector dimension
- `index_config` - Index configuration
- `shard_num` - Number of shards

#### IndexConfig
Index configuration for vector search optimization.

**Fields:**
- `index_type` - Type of index (IVF_FLAT, HNSW, etc.)
- `metric_type` - Similarity metric (COSINE, L2, IP)
- `params` - Index-specific parameters

## Usage Examples

### Basic Usage

```rust
use context_mcp::storage::{MilvusClient, CollectionConfig, VectorRecord, SearchQuery};

#[tokio::main]
async fn main() -> context_mcp::Result<()> {
    // Connect to Milvus
    let client = MilvusClient::new("http://localhost:19530").await?;

    // Create collection
    let config = CollectionConfig::code_vectors(384);
    client.create_collection(config).await?;

    // Insert record
    let record = VectorRecord::new(
        "main.rs:10".to_string(),
        vec![0.1; 384],
        "my_project".to_string(),
        "src/main.rs".to_string(),
        "rust".to_string(),
        "function".to_string(),
        "main".to_string(),
        10, 20,
        "fn main() {}".to_string(),
        "Entry point".to_string(),
    );

    client.insert("code_vectors", vec![record]).await?;
    client.flush("code_vectors").await?;

    // Search
    let query = SearchQuery::new(vec![0.1; 384], 10);
    let results = client.search("code_vectors", query).await?;

    for result in results {
        println!("{}: {:.4}", result.id, result.score);
    }

    Ok(())
}
```

### Advanced Filtering

```rust
// Search for Rust functions only
let query = SearchQuery::new(query_vector, 20)
    .with_filter("language == 'rust' && symbol_type == 'function'".to_string());

let results = client.search("code_vectors", query).await?;
```

### Batch Operations

```rust
// Insert multiple records efficiently
let records: Vec<VectorRecord> = /* ... */;

for chunk in records.chunks(100) {
    client.insert("code_vectors", chunk.to_vec()).await?;
}

client.flush("code_vectors").await?;
```

### Custom Index Configuration

```rust
use context_mcp::storage::{IndexConfig, IndexType, MetricType};
use std::collections::HashMap;

let mut params = HashMap::new();
params.insert("M".to_string(), "16".to_string());
params.insert("efConstruction".to_string(), "256".to_string());

let index_config = IndexConfig {
    index_type: IndexType::Hnsw,
    metric_type: MetricType::Cosine,
    params,
};

let mut config = CollectionConfig::code_vectors(768);
config.index_config = index_config;

client.create_collection(config).await?;
```

## Schema

The default collection schema (`code_vectors`) includes:

| Field | Type | Max Length | Description |
|-------|------|-----------|-------------|
| id | VARCHAR | 256 | Primary key |
| vector | FLOAT_VECTOR | dimension | Embedding |
| project_id | VARCHAR | 128 | Project ID |
| file_path | VARCHAR | 512 | File path |
| language | VARCHAR | 32 | Language |
| symbol_type | VARCHAR | 32 | Symbol type |
| symbol_name | VARCHAR | 128 | Symbol name |
| line_start | INT64 | - | Start line |
| line_end | INT64 | - | End line |
| snippet | VARCHAR | 2048 | Code snippet |
| docstring | VARCHAR | 4096 | Documentation |
| metadata | VARCHAR | 2048 | JSON metadata |

## Filter Syntax

Milvus uses a custom expression syntax for filtering:

```rust
// Comparison operators
"language == 'rust'"
"line_start > 100"
"line_end <= 500"

// Logical operators
"language == 'rust' && symbol_type == 'function'"
"language == 'rust' || language == 'python'"

// List operations
"symbol_type in ['function', 'class', 'struct']"
"language not in ['c', 'cpp']"

// Complex expressions
"(language == 'rust' || language == 'python') && line_start > 10"
```

## Index Types

### IVF_FLAT (Default)
- Best for: Medium-sized datasets
- Parameters: `nlist` (clusters), `nprobe` (search clusters)
- Accuracy: Good
- Speed: Medium

### HNSW
- Best for: Low-latency searches
- Parameters: `M` (connections), `efConstruction` (build depth), `ef` (search depth)
- Accuracy: Good
- Speed: Fast

### IVF_PQ
- Best for: Large datasets, memory-constrained
- Parameters: `nlist`, `m` (subquantizers), `nbits`
- Accuracy: Lower
- Speed: Fast
- Memory: Low

## Metric Types

### COSINE
- Range: -1 to 1 (higher is more similar)
- Best for: Normalized vectors, semantic similarity
- Default for code embeddings

### L2
- Range: 0 to ∞ (lower is more similar)
- Best for: Absolute distances

### IP (Inner Product)
- Range: -∞ to ∞ (higher is more similar)
- Best for: Dot product similarity

## Error Handling

All methods return `context_mcp::Result<T>` which is `Result<T, ContextMcpError>`.

Common error variants:
- `ContextMcpError::Database` - Database operations failed
- `ContextMcpError::Search` - Search failed
- `ContextMcpError::Parse` - Data parsing failed

```rust
use context_mcp::error::ContextMcpError;

match client.insert("code_vectors", records).await {
    Ok(ids) => println!("Inserted: {:?}", ids),
    Err(ContextMcpError::Database(msg)) => {
        eprintln!("Database error: {}", msg);
        // Handle error
    }
    Err(e) => eprintln!("Error: {}", e),
}
```

## Testing

Unit tests are included in each module:

```bash
# Run all tests
cargo test --lib storage

# Run integration tests (requires running Milvus)
cargo test --lib storage::milvus_client -- --ignored
```

## Performance Tips

1. **Batch insertions**: Insert 100-1000 records at a time
2. **Flush periodically**: Call `flush()` after bulk operations
3. **Reuse client**: Share a single MilvusClient instance
4. **Choose right index**: HNSW for speed, IVF_FLAT for balance
5. **Tune parameters**: Adjust `nprobe`, `ef` based on dataset size
6. **Monitor stats**: Use `get_collection_stats()` to track growth

## Integration Points

This module integrates with:

- **Embedding Module** (`src/embedding/`) - Generates vectors for insertion
- **Indexing Service** (future) - Uses storage for bulk indexing
- **Search Service** (future) - Uses storage for semantic search
- **Parser Module** (`src/parser/`) - Provides metadata for VectorRecords

## Future Enhancements

- [ ] Support for other vector databases (Qdrant, Weaviate)
- [ ] Connection pooling optimization
- [ ] Automatic retry with exponential backoff
- [ ] Streaming insertion for large datasets
- [ ] Collection versioning and migration
- [ ] Backup and restore utilities
- [ ] Metrics and monitoring integration

## References

- [Milvus Documentation](https://milvus.io/docs)
- [Milvus Rust SDK](https://github.com/milvus-io/milvus-sdk-rust)
- [MILVUS_IMPLEMENTATION.md](../../MILVUS_IMPLEMENTATION.md) - Detailed implementation guide
- [SETUP_MILVUS.md](../../SETUP_MILVUS.md) - Setup and troubleshooting
