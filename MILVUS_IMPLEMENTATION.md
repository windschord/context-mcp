# Milvus Implementation Guide

This document provides comprehensive guidance on using the Milvus Rust SDK integration in Context-MCP.

## Table of Contents

1. [Overview](#overview)
2. [Connection Setup](#connection-setup)
3. [Collection Schema Design](#collection-schema-design)
4. [Vector Insertion and Search](#vector-insertion-and-search)
5. [Metadata Filtering](#metadata-filtering)
6. [Performance Considerations](#performance-considerations)
7. [Error Handling](#error-handling)
8. [Examples](#examples)

## Overview

Context-MCP uses Milvus as its vector database backend for storing and querying code embeddings. The integration supports both:

- **Local Milvus**: Standalone instance via Docker Compose (default)
- **Zilliz Cloud**: Managed Milvus service for production deployments

### Key Features

- **Collection Management**: Create, drop, and check collection existence
- **Vector Operations**: Insert, delete, and search vector records
- **Metadata Storage**: Store rich metadata alongside vectors (file paths, symbols, etc.)
- **Filtering**: Query with metadata filters using Milvus expression syntax
- **Batch Operations**: Efficient batch insertion and search
- **Index Support**: Multiple index types (IVF_FLAT, HNSW, etc.)

## Connection Setup

### Local Milvus (Default)

#### 1. Start Milvus with Docker Compose

```bash
# From project root
docker-compose up -d

# Verify Milvus is running
docker-compose ps
```

#### 2. Connect to Milvus

```rust
use context_mcp::storage::MilvusClient;

#[tokio::main]
async fn main() -> context_mcp::Result<()> {
    // Connect to local Milvus
    let client = MilvusClient::new("http://localhost:19530").await?;

    println!("Connected to Milvus successfully!");
    Ok(())
}
```

### Zilliz Cloud (Production)

#### 1. Set up Zilliz Cloud

1. Create an account at [Zilliz Cloud](https://cloud.zilliz.com/)
2. Create a cluster
3. Get your cluster endpoint and API token

#### 2. Connect with Authentication

```rust
use context_mcp::storage::MilvusClient;

#[tokio::main]
async fn main() -> context_mcp::Result<()> {
    let address = "https://your-instance.zilliz.cloud:19530";
    let token = std::env::var("ZILLIZ_TOKEN")
        .expect("ZILLIZ_TOKEN not set");

    let client = MilvusClient::new_with_token(address, &token).await?;

    println!("Connected to Zilliz Cloud!");
    Ok(())
}
```

#### 3. Environment Variables

```bash
# Add to .env file
ZILLIZ_TOKEN=your_api_token_here
LSP_MCP_VECTOR_BACKEND=zilliz
LSP_MCP_VECTOR_ADDRESS=https://your-instance.zilliz.cloud:19530
```

## Collection Schema Design

### Code Vectors Schema

The `code_vectors` collection stores embeddings with rich metadata about code symbols.

#### Field Definitions

| Field | Type | Max Length | Description |
|-------|------|-----------|-------------|
| `id` | VARCHAR | 256 | Primary key (format: `file_path:line_start`) |
| `vector` | FLOAT_VECTOR | dimension | Embedding vector (384-dim for all-MiniLM-L6-v2) |
| `project_id` | VARCHAR | 128 | Project identifier |
| `file_path` | VARCHAR | 512 | Source file path |
| `language` | VARCHAR | 32 | Programming language |
| `symbol_type` | VARCHAR | 32 | Symbol type (function, class, variable, etc.) |
| `symbol_name` | VARCHAR | 128 | Name of the symbol |
| `line_start` | INT64 | - | Starting line number |
| `line_end` | INT64 | - | Ending line number |
| `snippet` | VARCHAR | 2048 | Code snippet |
| `docstring` | VARCHAR | 4096 | Documentation string or comments |
| `metadata` | VARCHAR | 2048 | Additional metadata as JSON |

### Creating a Collection

```rust
use context_mcp::storage::{CollectionConfig, MilvusClient};

async fn create_collection(client: &MilvusClient) -> context_mcp::Result<()> {
    // Create default configuration for code vectors
    let config = CollectionConfig::code_vectors(384);

    client.create_collection(config).await?;

    println!("Collection created with COSINE index");
    Ok(())
}
```

### Custom Collection Configuration

```rust
use context_mcp::storage::{
    CollectionConfig, IndexConfig, IndexType, MetricType
};
use std::collections::HashMap;

async fn create_custom_collection(client: &MilvusClient) -> context_mcp::Result<()> {
    // Custom HNSW index configuration
    let mut index_params = HashMap::new();
    index_params.insert("M".to_string(), "16".to_string());
    index_params.insert("efConstruction".to_string(), "256".to_string());

    let index_config = IndexConfig {
        index_type: IndexType::Hnsw,
        metric_type: MetricType::L2,
        params: index_params,
    };

    let mut config = CollectionConfig::code_vectors(768); // 768-dim vectors
    config.name = "large_code_vectors".to_string();
    config.index_config = index_config;

    client.create_collection(config).await?;

    Ok(())
}
```

### Index Types and Parameters

#### IVF_FLAT (Default)

- **Best for**: Moderate dataset size, good accuracy
- **Parameters**:
  - `nlist`: Number of cluster units (default: 1024)
  - `nprobe`: Number of clusters to search (default: 10)

```rust
let mut params = HashMap::new();
params.insert("nlist".to_string(), "1024".to_string());

let index_config = IndexConfig {
    index_type: IndexType::IvfFlat,
    metric_type: MetricType::Cosine,
    params,
};
```

#### HNSW

- **Best for**: High-performance search, lower latency
- **Parameters**:
  - `M`: Maximum connections per layer (default: 16)
  - `efConstruction`: Build-time search depth (default: 256)

```rust
let mut params = HashMap::new();
params.insert("M".to_string(), "16".to_string());
params.insert("efConstruction".to_string(), "256".to_string());

let index_config = IndexConfig {
    index_type: IndexType::Hnsw,
    metric_type: MetricType::Cosine,
    params,
};
```

### Metric Types

- **COSINE**: Cosine similarity (range: -1 to 1, higher is more similar)
  - Best for normalized vectors
  - Default for code embeddings

- **L2**: Euclidean distance (range: 0 to ∞, lower is more similar)
  - Best for absolute distances

- **IP**: Inner product (range: -∞ to ∞, higher is more similar)
  - Best for dot product similarity

## Vector Insertion and Search

### Inserting Records

#### Single Record

```rust
use context_mcp::storage::VectorRecord;

async fn insert_single(client: &MilvusClient) -> context_mcp::Result<()> {
    let record = VectorRecord::new(
        "main.rs:10".to_string(),
        vec![0.1; 384], // 384-dimensional vector
        "my_project".to_string(),
        "src/main.rs".to_string(),
        "rust".to_string(),
        "function".to_string(),
        "main".to_string(),
        10,
        25,
        "fn main() { /* ... */ }".to_string(),
        "Application entry point".to_string(),
    )
    .with_metadata("visibility".to_string(), "public".to_string());

    let ids = client.insert("code_vectors", vec![record]).await?;
    println!("Inserted record: {:?}", ids);

    Ok(())
}
```

#### Batch Insertion

```rust
async fn batch_insert(client: &MilvusClient, records: Vec<VectorRecord>) -> context_mcp::Result<()> {
    // Insert in batches of 100
    let batch_size = 100;

    for (i, chunk) in records.chunks(batch_size).enumerate() {
        let ids = client.insert("code_vectors", chunk.to_vec()).await?;
        println!("Batch {} inserted: {} records", i, ids.len());
    }

    // Flush to persist data
    client.flush("code_vectors").await?;

    Ok(())
}
```

### Searching Vectors

#### Basic Search

```rust
use context_mcp::storage::SearchQuery;

async fn search(client: &MilvusClient, query_vector: Vec<f32>) -> context_mcp::Result<()> {
    let query = SearchQuery::new(query_vector, 10); // Top 10 results

    let results = client.search("code_vectors", query).await?;

    for result in results {
        println!("ID: {}", result.id);
        println!("Score: {:.4}", result.score);
        println!("Symbol: {} ({})",
            result.record.symbol_name,
            result.record.symbol_type);
        println!("Snippet: {}\n", result.record.snippet);
    }

    Ok(())
}
```

#### Search with Filters

```rust
async fn filtered_search(client: &MilvusClient, query_vector: Vec<f32>) -> context_mcp::Result<()> {
    let query = SearchQuery::new(query_vector, 20)
        .with_filter("language == 'rust' && symbol_type == 'function'".to_string());

    let results = client.search("code_vectors", query).await?;

    println!("Found {} Rust functions", results.len());

    Ok(())
}
```

#### Custom Output Fields

```rust
async fn custom_fields_search(client: &MilvusClient, query_vector: Vec<f32>) -> context_mcp::Result<()> {
    let query = SearchQuery::new(query_vector, 10)
        .with_output_fields(vec![
            "id".to_string(),
            "symbol_name".to_string(),
            "file_path".to_string(),
        ]);

    let results = client.search("code_vectors", query).await?;

    // Results will only contain specified fields
    Ok(())
}
```

### Deleting Records

```rust
async fn delete_records(client: &MilvusClient) -> context_mcp::Result<()> {
    let ids_to_delete = vec![
        "main.rs:10".to_string(),
        "lib.rs:5".to_string(),
    ];

    client.delete("code_vectors", ids_to_delete).await?;

    Ok(())
}
```

## Metadata Filtering

Milvus uses a custom expression syntax for filtering. Here are common patterns:

### Comparison Operators

```rust
// Equality
"language == 'rust'"

// Inequality
"line_start > 100"
"line_end <= 500"

// Range
"line_start >= 10 && line_start <= 100"
```

### Logical Operators

```rust
// AND
"language == 'rust' && symbol_type == 'function'"

// OR
"language == 'rust' || language == 'python'"

// NOT
"language != 'javascript'"
```

### List Operations

```rust
// IN
"symbol_type in ['function', 'method', 'class']"

// NOT IN
"language not in ['c', 'cpp']"
```

### String Operations

```rust
// Pattern matching (if supported by Milvus version)
"file_path like '%test%'"

// Prefix matching
"file_path like 'src/%'"
```

### Complex Filters

```rust
async fn complex_filter_example(client: &MilvusClient, query_vector: Vec<f32>) -> context_mcp::Result<()> {
    let filter = r#"
        (language == 'rust' || language == 'python') &&
        symbol_type in ['function', 'class'] &&
        line_start > 10 &&
        project_id == 'main_project'
    "#.to_string();

    let query = SearchQuery::new(query_vector, 15)
        .with_filter(filter);

    let results = client.search("code_vectors", query).await?;

    Ok(())
}
```

## Performance Considerations

### Index Optimization

#### Choosing the Right Index

| Index Type | Build Time | Search Speed | Recall | Memory | Use Case |
|-----------|------------|--------------|--------|--------|----------|
| FLAT | Fast | Slow | 100% | High | Small datasets (<10k) |
| IVF_FLAT | Medium | Medium | Good | Medium | Medium datasets (10k-1M) |
| HNSW | Slow | Fast | Good | High | Large datasets, low latency |
| IVF_PQ | Slow | Fast | Lower | Low | Very large datasets, memory-constrained |

#### Index Parameter Tuning

**IVF_FLAT**:
- Increase `nlist` for larger datasets (1024-16384)
- Increase `nprobe` for better recall at cost of speed (10-256)

```rust
// High accuracy configuration
let mut params = HashMap::new();
params.insert("nlist".to_string(), "4096".to_string());

let mut search_params = HashMap::new();
search_params.insert("nprobe".to_string(), "128".to_string());
```

**HNSW**:
- Increase `M` for better recall (8-64)
- Increase `efConstruction` for better build quality (64-512)
- Set `ef` (search param) for search accuracy (search time linear with ef)

```rust
// High performance configuration
let mut params = HashMap::new();
params.insert("M".to_string(), "32".to_string());
params.insert("efConstruction".to_string(), "512".to_string());

let mut search_params = HashMap::new();
search_params.insert("ef".to_string(), "256".to_string());
```

### Batch Operations

Always use batch operations for better performance:

```rust
// BAD: Insert one by one
for record in records {
    client.insert("code_vectors", vec![record]).await?;
}

// GOOD: Batch insert
client.insert("code_vectors", records).await?;
```

### Flushing Strategy

```rust
// After bulk insertions
client.insert("code_vectors", large_batch).await?;
client.flush("code_vectors").await?;

// For incremental updates, flush periodically
let mut count = 0;
for record in records {
    client.insert("code_vectors", vec![record]).await?;
    count += 1;

    if count % 100 == 0 {
        client.flush("code_vectors").await?;
    }
}
```

### Connection Pooling

The MilvusClient internally manages connections. Reuse the client instance:

```rust
// GOOD: Single client instance
let client = Arc::new(MilvusClient::new("http://localhost:19530").await?);

// Share across multiple async tasks
let client_clone = Arc::clone(&client);
tokio::spawn(async move {
    client_clone.search("code_vectors", query).await
});
```

### Memory Management

Monitor collection statistics:

```rust
let stats = client.get_collection_stats("code_vectors").await?;
println!("Entity count: {}", stats.entity_count);
println!("Memory size: {} MB", stats.memory_size / 1024 / 1024);
```

## Error Handling

### Common Errors

1. **Connection Errors**
   - Milvus not running
   - Wrong address
   - Network issues

2. **Schema Errors**
   - Collection already exists
   - Dimension mismatch
   - Invalid field types

3. **Data Errors**
   - Vector dimension mismatch
   - Invalid field values
   - Duplicate IDs

### Error Handling Pattern

```rust
use context_mcp::error::ContextMcpError;

async fn robust_insert(client: &MilvusClient, records: Vec<VectorRecord>) -> context_mcp::Result<()> {
    match client.insert("code_vectors", records).await {
        Ok(ids) => {
            println!("Inserted {} records", ids.len());
            Ok(())
        }
        Err(ContextMcpError::Database(msg)) => {
            eprintln!("Database error: {}", msg);
            // Retry logic or fallback
            Err(ContextMcpError::Database(msg))
        }
        Err(e) => {
            eprintln!("Unexpected error: {}", e);
            Err(e)
        }
    }
}
```

### Retry Logic

```rust
use tokio::time::{sleep, Duration};

async fn insert_with_retry(
    client: &MilvusClient,
    records: Vec<VectorRecord>,
    max_retries: u32,
) -> context_mcp::Result<Vec<String>> {
    let mut retries = 0;

    loop {
        match client.insert("code_vectors", records.clone()).await {
            Ok(ids) => return Ok(ids),
            Err(e) if retries < max_retries => {
                retries += 1;
                eprintln!("Insert failed (attempt {}): {}", retries, e);
                sleep(Duration::from_secs(2u64.pow(retries))).await; // Exponential backoff
            }
            Err(e) => return Err(e),
        }
    }
}
```

## Examples

### Complete Workflow

```rust
use context_mcp::storage::{CollectionConfig, MilvusClient, SearchQuery, VectorRecord};

#[tokio::main]
async fn main() -> context_mcp::Result<()> {
    // 1. Connect
    let client = MilvusClient::new("http://localhost:19530").await?;

    // 2. Create collection
    let config = CollectionConfig::code_vectors(384);
    client.create_collection(config).await?;

    // 3. Prepare data
    let records = vec![
        VectorRecord::new(
            "main.rs:1".to_string(),
            vec![0.1; 384],
            "my_project".to_string(),
            "src/main.rs".to_string(),
            "rust".to_string(),
            "function".to_string(),
            "main".to_string(),
            1, 10,
            "fn main() {}".to_string(),
            "Entry point".to_string(),
        ),
    ];

    // 4. Insert
    let ids = client.insert("code_vectors", records).await?;
    client.flush("code_vectors").await?;

    // 5. Search
    let query = SearchQuery::new(vec![0.1; 384], 10);
    let results = client.search("code_vectors", query).await?;

    for result in results {
        println!("{}: {:.4}", result.id, result.score);
    }

    // 6. Cleanup
    client.drop_collection("code_vectors").await?;

    Ok(())
}
```

### Integration with Embedding Engine

```rust
use context_mcp::embedding::EmbeddingEngine;
use context_mcp::storage::{MilvusClient, VectorRecord};

async fn index_code_snippet(
    embedding_engine: &EmbeddingEngine,
    milvus_client: &MilvusClient,
    code: &str,
    file_path: &str,
) -> context_mcp::Result<()> {
    // Generate embedding
    let vector = embedding_engine.embed(code).await?;

    // Create record
    let record = VectorRecord::new(
        format!("{}:1", file_path),
        vector,
        "project".to_string(),
        file_path.to_string(),
        "rust".to_string(),
        "snippet".to_string(),
        "code".to_string(),
        1, 1,
        code.to_string(),
        String::new(),
    );

    // Insert into Milvus
    milvus_client.insert("code_vectors", vec![record]).await?;

    Ok(())
}
```

## Troubleshooting

### Milvus Not Starting

```bash
# Check logs
docker-compose logs milvus-standalone

# Restart services
docker-compose restart

# Clean restart
docker-compose down -v
docker-compose up -d
```

### Connection Refused

- Ensure Milvus is running: `docker-compose ps`
- Check port mapping: `docker-compose port milvus-standalone 19530`
- Verify firewall settings

### Dimension Mismatch

```rust
// Ensure vector dimension matches collection configuration
let config = CollectionConfig::code_vectors(384);
let vector = vec![0.0; 384]; // Must be 384-dimensional
```

### Search Returns No Results

1. Verify data is inserted: `client.get_collection_stats("code_vectors").await?`
2. Check if collection is loaded: Collections are auto-loaded on creation
3. Verify filter syntax: Test without filters first
4. Check metric type: COSINE expects normalized vectors

## Best Practices

1. **Always flush after batch inserts** to ensure data persistence
2. **Use appropriate index types** based on dataset size
3. **Monitor collection statistics** to track growth
4. **Implement retry logic** for production deployments
5. **Use connection pooling** by reusing client instances
6. **Test filters separately** before combining complex conditions
7. **Normalize vectors** when using COSINE metric
8. **Clean up test collections** to avoid resource leaks

## References

- [Milvus Official Documentation](https://milvus.io/docs)
- [Milvus Rust SDK](https://github.com/milvus-io/milvus-sdk-rust)
- [Zilliz Cloud](https://zilliz.com/cloud)
- [Vector Index Types](https://milvus.io/docs/index.md)
- [Metric Types](https://milvus.io/docs/metric.md)
