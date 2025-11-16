# Milvus Quick Start Guide

Quick reference for getting started with Milvus integration in Context-MCP.

## 1. Install System Dependencies

```bash
# Ubuntu/Debian
sudo apt-get install -y pkg-config libssl-dev

# macOS
brew install pkg-config openssl
export OPENSSL_DIR=$(brew --prefix openssl)
```

## 2. Start Milvus

```bash
# Start Milvus standalone with Docker Compose
docker-compose up -d

# Verify it's running
docker-compose ps
curl http://localhost:19530/healthz
```

## 3. Basic Usage

```rust
use context_mcp::storage::{MilvusClient, CollectionConfig, VectorRecord, SearchQuery};

#[tokio::main]
async fn main() -> context_mcp::Result<()> {
    // 1. Connect
    let client = MilvusClient::new("http://localhost:19530").await?;

    // 2. Create collection
    let config = CollectionConfig::code_vectors(384);
    client.create_collection(config).await?;

    // 3. Insert data
    let record = VectorRecord::new(
        "main.rs:10".to_string(),
        vec![0.1; 384], // Your embedding vector
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

    // 4. Search
    let query = SearchQuery::new(vec![0.1; 384], 10);
    let results = client.search("code_vectors", query).await?;

    for result in results {
        println!("{}: {:.4}", result.id, result.score);
    }

    Ok(())
}
```

## 4. Common Operations

### Insert Multiple Records
```rust
let records = vec![record1, record2, record3];
client.insert("code_vectors", records).await?;
client.flush("code_vectors").await?;
```

### Search with Filters
```rust
let query = SearchQuery::new(query_vector, 20)
    .with_filter("language == 'rust' && symbol_type == 'function'".to_string());

let results = client.search("code_vectors", query).await?;
```

### Delete Records
```rust
let ids = vec!["main.rs:10".to_string()];
client.delete("code_vectors", ids).await?;
```

### Check Collection Stats
```rust
let stats = client.get_collection_stats("code_vectors").await?;
println!("Entity count: {}", stats.entity_count);
```

### Drop Collection
```rust
client.drop_collection("code_vectors").await?;
```

## 5. Run Example

```bash
cargo run --example milvus_usage
```

## 6. Run Tests

```bash
# Unit tests (no Milvus required)
cargo test --lib storage::types

# Integration tests (requires running Milvus)
cargo test --lib storage::milvus_client -- --ignored
```

## Common Filter Expressions

```rust
// Equality
"language == 'rust'"

// Comparison
"line_start > 100"
"line_end <= 500"

// Multiple conditions
"language == 'rust' && symbol_type == 'function'"
"language == 'rust' || language == 'python'"

// List membership
"symbol_type in ['function', 'class', 'struct']"
"language not in ['c', 'cpp']"

// Complex
"(language == 'rust' || language == 'python') && line_start > 10"
```

## Troubleshooting

### Connection Refused
```bash
# Check if Milvus is running
docker-compose ps

# Restart Milvus
docker-compose restart
```

### No Results from Search
```rust
// Ensure data is flushed
client.flush("code_vectors").await?;

// Check if data exists
let stats = client.get_collection_stats("code_vectors").await?;
println!("Entities: {}", stats.entity_count);
```

### Dimension Mismatch
```rust
// Vector dimension must match collection config
let config = CollectionConfig::code_vectors(384);
let vector = vec![0.0; 384]; // Must be 384-dimensional
```

## Resources

- Full documentation: [MILVUS_IMPLEMENTATION.md](./MILVUS_IMPLEMENTATION.md)
- Setup guide: [SETUP_MILVUS.md](./SETUP_MILVUS.md)
- Module docs: [src/storage/README.md](./src/storage/README.md)
- Example code: [examples/milvus_usage.rs](./examples/milvus_usage.rs)
