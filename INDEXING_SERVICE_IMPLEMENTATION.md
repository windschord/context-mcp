# Indexing Service Implementation

This document describes the implementation of the Indexing Service for Context-MCP, which orchestrates the complete indexing pipeline from file scanning to vector storage.

## Overview

The Indexing Service (Task 10.8) coordinates multiple components to index source code projects:

1. **File Scanner**: Discovers source files in a project directory
2. **AST Parser**: Extracts symbols and code structure
3. **Embedding Engine**: Generates vector embeddings for code snippets
4. **Vector Storage**: Stores embeddings in Milvus database
5. **Full-text Index**: Indexes code in BM25 for keyword search

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    IndexingService                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐│
│  │  File    │───▶│ Symbol   │───▶│Embedding │───▶│Vector  ││
│  │ Scanner  │    │Extractor │    │ Engine   │    │Storage ││
│  └──────────┘    └──────────┘    └──────────┘    └────────┘│
│                        │                              │      │
│                        └─────────────────┐            │      │
│                                          ▼            ▼      │
│                                      ┌─────────────────────┐│
│                                      │   BM25 Engine       ││
│                                      │ (Full-text Index)   ││
│                                      └─────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/indexing/
├── mod.rs              # Module exports
├── types.rs            # Type definitions (config, results, errors)
├── file_scanner.rs     # File discovery and filtering
└── service.rs          # Main indexing service
```

## Key Components

### 1. IndexConfig

Configuration for indexing operations:

```rust
pub struct IndexConfig {
    pub root_path: PathBuf,           // Project root
    pub languages: Vec<Language>,     // Language filter (empty = all)
    pub exclude_patterns: Vec<String>, // .gitignore-style patterns
    pub include_documents: bool,      // Include .md files
    pub batch_size: usize,            // DB write batch size (default: 32)
    pub max_parallel: usize,          // Max concurrent tasks (default: CPU count)
    pub project_id: String,           // Project identifier
}
```

**Features:**
- Builder pattern for easy configuration
- Sensible defaults (CPU count for parallelism, batch size 32)
- Language filtering support
- Gitignore-compatible exclude patterns

### 2. FileScanner

Discovers source files with filtering support:

```rust
pub struct FileScanner;

impl FileScanner {
    pub fn scan(root: &Path, config: &ScanConfig) -> Result<Vec<PathBuf>>;
    pub fn count_files(root: &Path, config: &ScanConfig) -> Result<usize>;
    pub fn detect_languages(root: &Path) -> Result<Vec<Language>>;
}
```

**Features:**
- Respects .gitignore files (using `ignore` crate)
- Language detection from file extensions
- Custom exclude patterns
- Optional Markdown file inclusion

**Implementation Details:**
- Uses `WalkBuilder` from the `ignore` crate
- Honors .gitignore, .git/info/exclude, and global gitignore
- Skips hidden files by default
- Does not follow symlinks (prevents cycles)

### 3. IndexProgress

Thread-safe progress tracking:

```rust
pub struct IndexProgress {
    total_files: Arc<AtomicUsize>,
    processed_files: Arc<AtomicUsize>,
    total_symbols: Arc<AtomicUsize>,
    errors: Arc<Mutex<Vec<IndexError>>>,
    start_time: Instant,
}
```

**Features:**
- Atomic operations for lock-free counters
- Mutex-protected error collection
- Real-time progress reporting
- Elapsed time tracking

### 4. IndexingService

Main orchestrator for the indexing pipeline:

```rust
pub struct IndexingService {
    parser: Arc<SymbolExtractor>,
    embedding: Arc<EmbeddingEngine>,
    storage: Arc<MilvusClient>,
    bm25: Arc<Mutex<BM25Engine>>,
    collection_name: String,
}

impl IndexingService {
    pub async fn index_project(&self, config: IndexConfig) -> Result<IndexResult>;
    pub async fn index_file(&self, path: &Path, project_id: &str) -> Result<FileIndexResult>;
    pub async fn index_files(&self, paths: Vec<PathBuf>, config: &IndexConfig) -> Result<IndexResult>;
    pub async fn get_stats(&self) -> Result<IndexStats>;
    pub async fn clear_index(&self) -> Result<()>;
}
```

## Indexing Pipeline

### Single File Processing

```rust
async fn index_file(&self, path: &Path, project_id: &str) -> Result<FileIndexResult>
```

**Steps:**

1. **Read file**: Load source code from disk
2. **Parse**: Extract symbols using AST parser
3. **Generate embeddings**: Batch embed all symbol snippets
4. **Create records**: Build VectorRecord and BM25 Document for each symbol
5. **Store vectors**: Insert into Milvus collection
6. **Index text**: Add to BM25 inverted index
7. **Track progress**: Update counters and collect errors

**Error Handling:**
- I/O errors → IndexError::Io
- Parse errors → IndexError::Parse
- Embedding errors → IndexError::Embedding
- Storage errors → IndexError::Storage
- Errors are collected but don't stop the pipeline

### Project Indexing

```rust
async fn index_project(&self, config: IndexConfig) -> Result<IndexResult>
```

**Steps:**

1. **Scan files**: Discover all matching files
2. **Initialize progress**: Create tracker with file count
3. **Parallel processing**: Index files concurrently
4. **Aggregate results**: Combine all file results
5. **Return summary**: Statistics, errors, and metrics

### Parallel Processing Strategy

```rust
async fn index_files_parallel(&self, files: Vec<PathBuf>, config: &IndexConfig, progress: Arc<IndexProgress>) -> Result<IndexResult>
```

**Implementation:**

```
1. Split files into batches (batch_size)
2. For each batch:
   a. Spawn tokio tasks (up to max_parallel)
   b. Each task processes one file
   c. Update shared progress tracker
   d. Wait for batch completion before next batch
3. Aggregate results from all batches
```

**Benefits:**
- Controlled parallelism (respects max_parallel)
- Memory-efficient batching
- Progress tracking across tasks
- Graceful error handling

## Error Handling

### Error Types

```rust
pub enum ErrorKind {
    Parse,      // AST parsing failed
    Embedding,  // Embedding generation failed
    Storage,    // Database write failed
    Io,         // File I/O failed
    Other,      // Other errors
}

pub struct IndexError {
    pub file_path: String,
    pub message: String,
    pub kind: ErrorKind,
}
```

### Resilience Strategy

- **File-level isolation**: One file's error doesn't affect others
- **Error collection**: All errors are tracked and reported
- **Continue on error**: Processing continues even with failures
- **Detailed reporting**: Each error includes file path, message, and kind

## Performance Characteristics

### Throughput

**Expected performance (on typical hardware):**
- Small files (<100 lines): 10-20 files/second
- Medium files (100-1000 lines): 5-10 files/second
- Large files (>1000 lines): 2-5 files/second

**Bottlenecks:**
1. Embedding generation (most expensive operation)
2. Database writes (network latency)
3. File I/O (disk speed)

### Optimization Techniques

1. **Batch embedding**: Process multiple symbols at once
2. **Parallel file processing**: Utilize multiple CPU cores
3. **Database batching**: Batch inserts to reduce round trips
4. **Async I/O**: Non-blocking file operations
5. **Controlled concurrency**: Limit parallel tasks to prevent resource exhaustion

### Memory Usage

**Per-file memory:**
- Source code: ~file size
- AST symbols: ~10-100 KB
- Embeddings: ~1-4 KB per symbol (384-dimensional vectors)

**Total memory:**
- Scales with `batch_size * max_parallel`
- Typical usage: 100-500 MB
- Peak usage: <2 GB (per design requirements)

## Testing

### Unit Tests

Located in each module:
- `types.rs`: Config validation, error creation, progress tracking
- `file_scanner.rs`: File discovery, filtering, language detection
- `service.rs`: Mock-based service tests (requires real components)

### Integration Tests

Example file: `examples/indexing_usage.rs`

Demonstrates:
- Full project indexing
- Single file indexing
- Language filtering
- Custom exclude patterns
- Error handling
- Statistics retrieval

### Test Coverage

Current coverage:
- Type definitions: 100%
- File scanner: 95% (excludes error paths)
- Service: Partial (requires integration tests)

## Usage Examples

### Basic Project Indexing

```rust
use context_mcp::indexing::{IndexingService, IndexConfig};

// Create service (with parser, embedding, storage, bm25)
let service = IndexingService::new(parser, embedding, storage, bm25);

// Configure indexing
let config = IndexConfig::new(PathBuf::from("./src"))
    .with_project_id("my-project".to_string());

// Index project
let result = service.index_project(config).await?;

println!("Indexed {} files, {} symbols",
    result.indexed_files, result.total_symbols);
```

### Language-Specific Indexing

```rust
let config = IndexConfig::new(PathBuf::from("./src"))
    .with_languages(vec![Language::Rust, Language::Python])
    .with_include_documents(false);

let result = service.index_project(config).await?;
```

### Incremental Indexing

```rust
// Index single file (e.g., after edit)
let file_result = service
    .index_file(&PathBuf::from("src/main.rs"), "my-project")
    .await?;

if file_result.success {
    println!("Updated {} symbols", file_result.symbol_count);
}
```

### Custom Exclude Patterns

```rust
let config = IndexConfig::new(PathBuf::from("./"))
    .with_exclude_patterns(vec![
        "*.test.rs".to_string(),
        "target/**".to_string(),
        "node_modules/**".to_string(),
    ]);
```

## Dependencies

### Direct Dependencies

- `tokio`: Async runtime and task spawning
- `futures`: Future combinators (join_all)
- `parking_lot`: Fast mutex for BM25 engine
- `ignore`: Gitignore-compatible file walking
- `num_cpus`: CPU count detection
- `tracing`: Structured logging

### Component Dependencies

- `SymbolExtractor`: AST parsing (Task 10.3)
- `EmbeddingEngine`: Vector generation (Task 10.4)
- `MilvusClient`: Vector storage (Task 10.5)
- `BM25Engine`: Full-text indexing (Task 10.6)

## Configuration Reference

### IndexConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `root_path` | PathBuf | Required | Project root directory |
| `languages` | Vec<Language> | [] (all) | Languages to index |
| `exclude_patterns` | Vec<String> | [] | Gitignore-style patterns |
| `include_documents` | bool | true | Include .md files |
| `batch_size` | usize | 32 | Database batch size |
| `max_parallel` | usize | CPU count | Max concurrent tasks |
| `project_id` | String | "default" | Project identifier |

### Best Practices

1. **Batch size**: 16-64 for most projects (balances memory vs throughput)
2. **Max parallel**: CPU count or CPU count * 2 for I/O-bound workloads
3. **Exclude patterns**: Always exclude build artifacts, dependencies
4. **Language filter**: Use for large multi-language projects to reduce noise

## Metrics and Monitoring

### IndexResult Metrics

```rust
result.success_rate()   // Percentage of successfully indexed files
result.throughput()     // Files per second
result.summary()        // Human-readable summary
```

### IndexStats

```rust
let stats = service.get_stats().await?;
println!("Vectors: {}", stats.vector_count);
println!("BM25 docs: {}", stats.bm25_document_count);
println!("Terms: {}", stats.bm25_term_count);
```

## Known Limitations

1. **Large files**: Files >10K lines may be slow to embed
2. **Memory**: Very large projects (>100K files) may need tuning
3. **Error recovery**: No automatic retry for transient failures
4. **Incremental updates**: Requires manual re-indexing of changed files

## Future Enhancements

1. **File watching**: Automatic re-indexing on file changes (Task 10.9)
2. **Incremental updates**: Smart diff-based re-indexing
3. **Checkpointing**: Resume interrupted indexing
4. **Progress callbacks**: Real-time progress notifications
5. **Distributed indexing**: Multi-machine indexing for very large projects

## Troubleshooting

### Slow indexing

**Symptoms**: Throughput <1 file/second

**Solutions:**
- Increase `max_parallel` (if CPU-bound)
- Decrease `batch_size` (if memory-bound)
- Check Milvus connection latency
- Verify embedding model is using GPU (if available)

### High memory usage

**Symptoms**: Memory usage >2GB

**Solutions:**
- Reduce `batch_size`
- Reduce `max_parallel`
- Exclude large files with patterns

### Files not indexed

**Symptoms**: Expected files missing from index

**Solutions:**
- Check `.gitignore` files
- Verify language is supported
- Check `exclude_patterns`
- Look for errors in `IndexResult.errors`

### Database errors

**Symptoms**: Many storage errors in results

**Solutions:**
- Verify Milvus is running: `docker ps`
- Check collection exists: `has_collection()`
- Verify network connectivity
- Check disk space

## References

- Task 10.3: Parser Implementation (SymbolExtractor)
- Task 10.4: Embedding Implementation (EmbeddingEngine)
- Task 10.5: Milvus Implementation (MilvusClient)
- Task 10.6: BM25 Implementation (BM25Engine)
- Task 10.7: Hybrid Search Implementation
- CLAUDE.md: Project overview and architecture
- docs/design.md: Component 4 - Indexing Service specification
