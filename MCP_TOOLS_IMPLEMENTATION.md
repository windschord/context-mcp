# MCP Tools Implementation Documentation

This document describes the complete implementation of all 6 MCP tools for Context-MCP server.

## Overview

The Context-MCP server exposes 6 tools through the MCP (Model Context Protocol) interface:

1. `index_project` - Index a project directory
2. `search_code` - Hybrid semantic search
3. `get_symbol` - Symbol definition/reference lookup
4. `find_related_docs` - Find related documentation
5. `get_index_status` - Get indexing statistics
6. `clear_index` - Clear indexed data

## Architecture

### Server Components

The `ContextMcpServer` integrates all core components:

- **SymbolExtractor**: Tree-sitter AST parsing
- **EmbeddingEngine**: ONNX-based local embeddings (all-MiniLM-L6-v2)
- **MilvusClient**: Vector database storage
- **BM25Engine**: Full-text search index
- **HybridSearchEngine**: Combines BM25 + vector search
- **IndexingService**: Orchestrates indexing pipeline

### Initialization Flow

```rust
1. Load configuration from .context-mcp.json or use defaults
2. Initialize SymbolExtractor for AST parsing
3. Load ONNX embedding model and tokenizer
4. Connect to Milvus vector database
5. Initialize BM25 SQLite index
6. Create HybridSearchEngine
7. Create IndexingService
8. Create or load Milvus collection
```

## Tool Implementations

### 1. index_project

**Purpose**: Index all source files in a project directory

**Parameters**:
```json
{
  "rootPath": "/path/to/project",
  "languages": ["rust", "python"],  // optional
  "excludePatterns": ["target/", "*.test.rs"],  // optional
  "includeDocuments": true,  // optional, default: false
  "projectId": "my-project"  // optional, defaults to directory name
}
```

**Response**:
```json
{
  "totalFiles": 150,
  "codeFiles": 145,
  "documentFiles": 5,
  "totalSymbols": 1250,
  "processingTimeMs": 45200,
  "errors": 2,
  "status": "Indexing completed successfully"
}
```

**Implementation**:
- Scans directory using `FileScanner` with ignore patterns
- Processes files in batches (configurable batch size)
- Extracts symbols using Tree-sitter AST parsing
- Generates embeddings for each symbol
- Stores vectors in Milvus and BM25 index
- Tracks project state for status queries

### 2. search_code

**Purpose**: Semantic code search using natural language queries

**Parameters**:
```json
{
  "query": "parse configuration file",
  "projectId": "my-project",  // optional
  "fileTypes": ["rs", "py"],  // optional
  "topK": 10,  // optional, default: 10
  "scoreThreshold": 0.5  // optional, default: 0.5
}
```

**Response**:
```json
{
  "results": [
    {
      "filePath": "src/config/parser.rs",
      "snippet": "pub fn parse_config_file(path: &Path) -> Result<Config> {...}",
      "score": 0.92,
      "language": "rust",
      "symbolType": "function",
      "symbolName": "parse_config_file",
      "lineRange": [45, 78],
      "metadata": null
    }
  ],
  "totalFound": 15,
  "searchTimeMs": 234
}
```

**Implementation**:
- Generates query embedding
- Performs BM25 keyword search (top 20)
- Performs vector similarity search (top 20)
- Normalizes scores using MinMax or ZScore
- Combines scores: `score = alpha * bm25 + (1-alpha) * vector`
- Applies filters (project_id, file_types, score_threshold)
- Returns top-K results sorted by combined score

### 3. get_symbol

**Purpose**: Find all definitions and references of a symbol

**Parameters**:
```json
{
  "symbolName": "parse_config_file",
  "symbolType": "function",  // optional
  "projectId": "my-project"  // optional
}
```

**Response**:
```json
{
  "definitions": [
    {
      "filePath": "src/config/parser.rs",
      "symbolName": "parse_config_file",
      "symbolType": "function",
      "lineRange": [45, 78],
      "snippet": "pub fn parse_config_file...",
      "isDefinition": true,
      "docstring": "Parse configuration from a file"
    }
  ],
  "references": [
    {
      "filePath": "src/main.rs",
      "symbolName": "parse_config_file",
      "symbolType": "function",
      "lineRange": [23, 23],
      "snippet": "let config = parse_config_file(&path)?;",
      "isDefinition": false,
      "docstring": null
    }
  ],
  "totalCount": 8
}
```

**Implementation**:
- Uses BM25 exact match search for symbol name
- Filters by symbol type if specified
- Separates definitions from references (currently simplified)
- Returns all matching locations

### 4. find_related_docs

**Purpose**: Find documentation files related to code or symbols

**Parameters**:
```json
{
  "filePath": "src/config/parser.rs",  // optional
  "symbolName": "parse_config_file",  // optional
  "topK": 5  // optional, default: 5
}
```

**Response**:
```json
{
  "documents": [
    {
      "filePath": "docs/configuration.md",
      "title": "Configuration File Format",
      "relevanceScore": 0.88,
      "excerpt": "The configuration file uses TOML format...",
      "section": "## Configuration File Format"
    }
  ],
  "totalFound": 3
}
```

**Implementation**:
- Builds search query from file_path or symbol_name
- Performs hybrid search
- Filters results for document files (.md, .txt, .rst)
- Returns documents sorted by relevance score

### 5. get_index_status

**Purpose**: Get statistics about indexed projects

**Parameters**:
```json
{
  "projectId": "my-project"  // optional, returns all if omitted
}
```

**Response**:
```json
{
  "projects": [
    {
      "projectId": "my-project",
      "rootPath": "/path/to/project",
      "status": "indexed",
      "lastIndexedAt": "2025-01-15T10:30:00Z",
      "stats": {
        "totalFiles": 145,
        "codeFiles": 140,
        "documentFiles": 5,
        "totalSymbols": 1250,
        "totalVectors": 1250,
        "indexSizeBytes": 52428800
      }
    }
  ],
  "overallStats": {
    "totalFiles": 145,
    "codeFiles": 140,
    "documentFiles": 5,
    "totalSymbols": 1250,
    "totalVectors": 1250,
    "indexSizeBytes": 52428800
  }
}
```

**Implementation**:
- Retrieves tracked project states from memory
- Queries Milvus and BM25 for accurate statistics
- Filters by project_id if specified
- Aggregates overall statistics

### 6. clear_index

**Purpose**: Remove indexed data

**Parameters**:
```json
{
  "projectId": "my-project",  // optional, clears all if omitted
  "confirm": true  // required safety flag
}
```

**Response**:
```json
{
  "success": true,
  "projectsCleared": 1,
  "vectorsDeleted": 1250,
  "message": "Index cleared successfully"
}
```

**Implementation**:
- Requires confirm=true to prevent accidental deletion
- If project_id specified: removes from tracking (per-project vector deletion not fully implemented)
- If no project_id: clears all projects, drops Milvus collection, clears BM25 index
- Returns deletion statistics

## Configuration

The server is configured via `.context-mcp.json`:

```json
{
  "milvus": {
    "address": "localhost:19530",
    "token": null,
    "shardNum": 2
  },
  "embedding": {
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json",
    "maxLength": 256,
    "batchSize": 32
  },
  "bm25": {
    "dbPath": "./data/bm25_index.db",
    "k1": 1.5,
    "b": 0.75
  },
  "indexing": {
    "batchSize": 32,
    "maxParallel": 8,
    "collectionName": "code_vectors",
    "dimension": 384
  },
  "hybrid": {
    "alpha": 0.3,
    "normalization": "MinMax",
    "bm25TopK": 20,
    "vectorTopK": 20
  }
}
```

### Environment Variable Overrides

- `MILVUS_ADDRESS` - Override Milvus server address
- `MILVUS_TOKEN` - Override Milvus authentication token
- `MODEL_PATH` - Override embedding model path
- `TOKENIZER_PATH` - Override tokenizer path
- `BM25_DB_PATH` - Override BM25 database path

## Error Handling

All tool handlers return `CallToolResult` with appropriate error messages:

- Initialization errors: "Server not initialized"
- Service unavailable: "Service not available"
- Validation errors: Parameter validation messages
- Indexing errors: Detailed error information with partial results
- Search errors: Empty results with error message

## Performance Considerations

### Indexing Performance
- **Batch size**: 32 files per batch (configurable)
- **Parallelism**: 8 concurrent tasks (configurable)
- **Expected rate**: 10,000 files in 5-10 minutes (depends on hardware)

### Search Performance
- **Target latency**: < 2 seconds for search queries
- **Hybrid search overhead**: ~50ms for combining results
- **Vector search**: O(log N) with IVF_FLAT index
- **BM25 search**: O(log N) with SQLite B-tree index

### Memory Usage
- **Embedding model**: ~90MB (all-MiniLM-L6-v2)
- **Per-symbol overhead**: ~1.5KB (vector + metadata)
- **Target**: < 2GB total for typical projects

## Known Limitations

1. **BM25 Engine Sharing**: Currently creates separate in-memory instances for hybrid search and indexing due to SQLite connection limitations. Should be refactored to share the same database connection.

2. **Per-Project Deletion**: The `clear_index` tool doesn't fully support per-project deletion from Milvus. Would require adding delete-by-expression functionality.

3. **Symbol References**: The `get_symbol` tool doesn't distinguish between definitions and references yet. All results are marked as definitions.

4. **Document Tracking**: Document files (.md, .txt) are not tracked separately in statistics.

5. **OpenSSL Dependency**: The project has a dependency on OpenSSL through the milvus crate, which requires OpenSSL development libraries to be installed on the system.

## Testing

### Unit Tests
All components have unit tests. Run with:
```bash
cargo test
```

### Integration Tests
Integration tests require:
- Running Milvus instance (docker-compose up -d)
- Downloaded ONNX model files
- Test project directory

### Manual Testing
Use the example configuration and sample project:
```bash
# Start Milvus
docker-compose up -d

# Run server
cargo run

# Test via MCP client
# (Client implementation depends on MCP SDK)
```

## Future Enhancements

1. **Incremental Updates**: File watching with chokidar for automatic re-indexing
2. **Advanced Symbol Tracking**: Proper definition vs. reference distinction
3. **Cloud Mode**: Support for cloud embedding APIs (OpenAI, Voyage AI)
4. **Multi-Project**: Better isolation and management of multiple projects
5. **Query Cache**: Cache frequently used queries for better performance
6. **Compression**: Reduce vector storage size with quantization
7. **Relevance Feedback**: Learn from user interactions to improve search

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [Milvus Vector Database](https://milvus.io/)
- [BM25 Algorithm](https://en.wikipedia.org/wiki/Okapi_BM25)
- [all-MiniLM-L6-v2 Model](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
