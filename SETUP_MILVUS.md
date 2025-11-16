# Milvus Setup Guide

This guide helps you set up the development environment for Context-MCP with Milvus integration.

## Prerequisites

### System Dependencies

The `milvus` Rust crate requires OpenSSL development libraries. Install them based on your operating system:

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y pkg-config libssl-dev
```

#### Fedora/RHEL/CentOS
```bash
sudo yum install -y pkg-config openssl-devel
```

#### macOS
```bash
brew install pkg-config openssl

# Set environment variable for OpenSSL location
export OPENSSL_DIR=$(brew --prefix openssl)
```

#### Arch Linux
```bash
sudo pacman -S pkg-config openssl
```

### Verify Installation

After installing the dependencies, verify they're available:

```bash
pkg-config --version
pkg-config --libs --cflags openssl
```

## Building the Project

Once system dependencies are installed:

```bash
# Clean build
cargo clean

# Build the project
cargo build

# Run tests (requires running Milvus instance)
cargo test --lib storage::milvus_client -- --ignored
```

## Running Milvus Locally

### Using Docker Compose (Recommended)

The project includes a `docker-compose.yml` file for running Milvus standalone:

```bash
# Start Milvus
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f milvus-standalone

# Stop Milvus
docker-compose down

# Stop and remove all data
docker-compose down -v
```

### Verify Milvus is Running

```bash
# Check if Milvus is accepting connections
curl http://localhost:19530/healthz

# Or use grpcurl (if installed)
grpcurl -plaintext localhost:19530 list
```

## Troubleshooting

### OpenSSL Not Found

**Error:**
```
Could not find directory of OpenSSL installation
```

**Solution:**
1. Install OpenSSL development packages (see Prerequisites above)
2. If already installed, set the `OPENSSL_DIR` environment variable:
   ```bash
   export OPENSSL_DIR=/usr/lib/ssl  # Ubuntu/Debian
   # or
   export OPENSSL_DIR=/usr/local/opt/openssl  # macOS with Homebrew
   ```

### pkg-config Not Found

**Error:**
```
Could not run `pkg-config --libs --cflags openssl`
```

**Solution:**
Install pkg-config for your system (see Prerequisites above).

### Milvus Connection Refused

**Error:**
```
Failed to connect to Milvus: connection refused
```

**Solution:**
1. Ensure Milvus is running: `docker-compose ps`
2. Check if port 19530 is available: `netstat -an | grep 19530`
3. Restart Milvus: `docker-compose restart`
4. Check Milvus logs: `docker-compose logs milvus-standalone`

### Collection Already Exists

**Error:**
```
Failed to create collection: collection already exists
```

**Solution:**
Drop the existing collection first:
```rust
client.drop_collection("code_vectors").await?;
```

Or use the Milvus CLI:
```bash
# Connect to Milvus container
docker-compose exec milvus-standalone bash

# Inside container, use milvus_cli (if available)
```

### Search Returns No Results

**Possible causes:**
1. Collection is not loaded into memory
2. Data was not flushed after insertion
3. Incorrect filter syntax
4. Vector dimension mismatch

**Solution:**
```rust
// Ensure data is flushed
client.flush("code_vectors").await?;

// Verify data exists
let stats = client.get_collection_stats("code_vectors").await?;
println!("Entity count: {}", stats.entity_count);

// Test search without filters first
let query = SearchQuery::new(vector, 10);
let results = client.search("code_vectors", query).await?;
```

## Development Workflow

### 1. Start Milvus
```bash
docker-compose up -d
```

### 2. Run Tests
```bash
# Unit tests (don't require Milvus)
cargo test --lib storage::types

# Integration tests (require Milvus)
cargo test --lib storage::milvus_client -- --ignored
```

### 3. Run Examples
```bash
cargo run --example milvus_usage
```

### 4. Development Iteration
```bash
# Watch mode for auto-recompilation
cargo watch -x 'check --lib'

# Or use cargo-make
cargo make dev
```

## Production Deployment

### Using Zilliz Cloud

1. **Create Account**: Sign up at [Zilliz Cloud](https://cloud.zilliz.com/)

2. **Create Cluster**:
   - Choose a region
   - Select cluster size
   - Note the endpoint URL

3. **Get API Token**:
   - Go to Settings → API Keys
   - Create a new API key
   - Save the token securely

4. **Configure Environment**:
   ```bash
   export LSP_MCP_VECTOR_BACKEND=zilliz
   export LSP_MCP_VECTOR_ADDRESS=https://your-instance.zilliz.cloud:19530
   export ZILLIZ_TOKEN=your_api_token
   ```

5. **Update Code**:
   ```rust
   let client = MilvusClient::new_with_token(
       &std::env::var("LSP_MCP_VECTOR_ADDRESS")?,
       &std::env::var("ZILLIZ_TOKEN")?,
   ).await?;
   ```

### Self-Hosted Milvus

For production self-hosted deployment, see:
- [Milvus Installation Guide](https://milvus.io/docs/install_standalone-docker.md)
- [Milvus Cluster Deployment](https://milvus.io/docs/install_cluster-docker.md)

Recommended for production:
- Use Milvus cluster mode (not standalone)
- Set up proper backup and disaster recovery
- Configure monitoring and alerting
- Use persistent storage volumes
- Enable authentication and TLS

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LSP_MCP_VECTOR_BACKEND` | Vector DB backend (`milvus` or `zilliz`) | `milvus` |
| `LSP_MCP_VECTOR_ADDRESS` | Milvus/Zilliz endpoint | `http://localhost:19530` |
| `ZILLIZ_TOKEN` | Zilliz Cloud API token | - |
| `OPENSSL_DIR` | OpenSSL installation directory (if not auto-detected) | System-dependent |

## Performance Tuning

### Connection Pool
The MilvusClient manages connections internally. Reuse the client instance:

```rust
let client = Arc::new(MilvusClient::new("http://localhost:19530").await?);
```

### Batch Size
Optimal batch size for insertions: 100-1000 records

```rust
for chunk in records.chunks(100) {
    client.insert("code_vectors", chunk.to_vec()).await?;
}
client.flush("code_vectors").await?;
```

### Index Configuration
- Use HNSW for low-latency searches
- Use IVF_FLAT for balanced performance
- Tune `nprobe` and `ef` parameters based on dataset size

See [MILVUS_IMPLEMENTATION.md](./MILVUS_IMPLEMENTATION.md) for detailed performance tuning.

## Resources

- [Milvus Documentation](https://milvus.io/docs)
- [Milvus Rust SDK](https://github.com/milvus-io/milvus-sdk-rust)
- [Zilliz Cloud](https://zilliz.com/cloud)
- [Context-MCP Milvus Implementation Guide](./MILVUS_IMPLEMENTATION.md)
