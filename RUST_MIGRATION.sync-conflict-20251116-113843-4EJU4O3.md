# Rust Migration Guide

This document tracks the migration from Node.js/TypeScript to Rust for the Context-MCP project.

## Status

**Current Phase**: Phase 10 - Rust Migration
**Task 10.1**: ✅ Rust project initialization and Cargo setup (COMPLETE)

## Why Rust?

- **High Performance**: Native compilation, zero-cost abstractions
- **Memory Safety**: Rust's ownership system prevents data races and memory errors
- **Single Binary Distribution**: No external runtime required (no Node.js dependency)
- **Low Resource Usage**: Significantly reduced memory and CPU usage compared to Node.js
- **Official MCP SDK**: `rmcp` crate with proven performance (4,700+ QPS)
- **Native Library Support**: Tree-sitter, ONNX Runtime, and Milvus all have Rust bindings

## Project Structure

```
context-mcp/
├── src/
│   └── main.rs          # Entry point
├── Cargo.toml           # Rust project configuration
├── rust-toolchain.toml  # Rust version specification (1.80.0)
└── node_modules/        # (Kept for reference during migration)
```

## Dependencies

### Core Dependencies
- **rmcp**: MCP Rust SDK (official)
- **tokio**: Async runtime with full features
- **anyhow/thiserror**: Error handling
- **serde/serde_json**: Serialization

### AST Parsing
- **tree-sitter**: Core AST parsing library
- **tree-sitter-typescript**: TypeScript/JavaScript parser
- **tree-sitter-python**: Python parser
- **tree-sitter-go**: Go parser
- **tree-sitter-rust**: Rust parser
- **tree-sitter-java**: Java parser
- **tree-sitter-c**: C parser
- **tree-sitter-cpp**: C++ parser (for Arduino/PlatformIO)

### Embeddings & Search
- **ort**: ONNX Runtime bindings for local embedding models
- **tokenizers**: HuggingFace tokenizer
- **milvus**: Milvus vector database SDK
- **rusqlite**: SQLite for BM25 full-text search

### Utilities
- **notify**: File system watching
- **tracing/tracing-subscriber**: Logging and tracing
- **config**: Configuration management
- **clap**: CLI argument parsing (optional)

## Development Workflow

### Prerequisites
- Rust 1.75+ (recommended: 1.80+)
- Docker & Docker Compose (for Milvus)

### Building
```bash
# Debug build
cargo build

# Release build
cargo build --release

# Run
cargo run

# Run with environment variables
LOG_LEVEL=DEBUG cargo run
```

### Testing
```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_name

# Run benchmarks
cargo bench
```

### Code Quality
```bash
# Format code
cargo fmt

# Check formatting
cargo fmt -- --check

# Run clippy lints
cargo clippy

# Fix clippy warnings
cargo clippy --fix
```

## Migration Strategy

The migration is happening in the `feature/rust-migration` branch. The existing Node.js/TypeScript code is kept for reference.

### Migration Tasks (from docs/tasks.md)
1. ✅ **Task 10.1**: Rust project initialization (DONE)
2. **Task 10.2**: MCP Rust SDK integration
3. **Task 10.3**: Tree-sitter integration and AST parsing
4. **Task 10.4**: ONNX Runtime integration and embedding engine
5. **Task 10.5**: Milvus Rust SDK integration
6. **Task 10.6**: BM25 full-text search engine
7. **Task 10.7**: Hybrid search engine
8. **Task 10.8**: Indexing service
9. **Task 10.9**: MCP tools implementation
10. **Task 10.10**: File watching and incremental updates
11. **Task 10.11**: Configuration management
12. **Task 10.12**: Test suite
13. **Task 10.13**: Release build optimization
14. **Task 10.14**: Documentation updates

## Configuration

The Rust implementation supports the same configuration as the Node.js version:

### Environment Variables
- `LSP_MCP_MODE`: "local" | "cloud"
- `LSP_MCP_VECTOR_BACKEND`: "milvus" | "zilliz"
- `LSP_MCP_VECTOR_ADDRESS`: Vector DB address (e.g., "localhost:19530")
- `LSP_MCP_VECTOR_TOKEN`: Zilliz Cloud token (cloud mode only)
- `LOG_LEVEL`: "DEBUG" | "INFO" | "WARN" | "ERROR"

### Configuration File
`.context-mcp.json` remains supported with the same schema.

## Next Steps

1. Implement MCP server using `rmcp` crate (Task 10.2)
2. Port AST parsing logic to Rust (Task 10.3)
3. Integrate ONNX Runtime for local embeddings (Task 10.4)
4. Connect to Milvus for vector storage (Task 10.5)

## Notes

- MSRV (Minimum Supported Rust Version): 1.75
- Recommended version: 1.80+
- All existing Node.js code is preserved for reference
- The Rust implementation aims for feature parity with the TypeScript version
