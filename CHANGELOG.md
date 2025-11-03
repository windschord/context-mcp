# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- npx経由での実行サポート（`npx lsp-mcp`で直接実行可能）
- CLI用のヘルプメッセージ（`--help`, `--version`オプション）
- `bin/lsp-mcp.js`エントリーポイント

### Changed
- README.mdとCLAUDE_CODE_INTEGRATION.mdにnpx使用例を追加（推奨方法として）
- package.jsonに`files`フィールドを追加（配布ファイルを明示化）
- Claude Code設定例を`npx lsp-mcp`使用に更新

## [0.1.0] - 2025-01-03

### Added

#### MCP Server & Core Infrastructure
- MCP server implementation with @modelcontextprotocol/sdk
- Configuration file management system (.lsp-mcp.json)
- File system scanner with .gitignore and .mcpignore support
- Comprehensive logging system with rotation and sensitive data sanitization
- Error handling with detailed error messages and suggestions

#### AST Parsing & Code Analysis
- Tree-sitter integration for 6 programming languages:
  - TypeScript/JavaScript
  - Python
  - Go
  - Rust
  - Java
  - C/C++/Arduino
- Symbol extraction (functions, classes, variables) with scope information
- Comment and docstring extraction (JSDoc, Python docstrings, etc.)
- TODO/FIXME/NOTE marker detection
- Arduino/PlatformIO project support (.ino files, platformio.ini)

#### Document Processing
- Markdown parser with heading structure extraction
- Code block extraction with language tags
- Link and file path reference detection
- Document-code relationship analysis

#### Vector Database Integration
- Plugin-based architecture for multiple vector databases
- Milvus plugin (local Docker + Zilliz Cloud support)
- Chroma plugin (lightweight, Docker-free alternative)
- Automatic Docker Compose management for Milvus standalone
- Collection creation and management
- Vector insertion, update, and deletion

#### Embedding Engines
- Local embedding with Transformers.js (all-MiniLM-L6-v2)
- Cloud embedding support (OpenAI, VoyageAI)
- Batch embedding processing
- Embedding cache for query optimization
- Mode switching (local/cloud) with privacy-first defaults

#### Search Functionality
- BM25 full-text search with SQLite inverted index
- Hybrid search (BM25 + vector similarity)
- Configurable score weighting (α parameter)
- Filtering by file type, language, and metadata
- Query cache for performance optimization

#### MCP Tools
- `index_project`: Index entire project with progress tracking
- `search_code`: Semantic code search with hybrid scoring
- `get_symbol`: Symbol definition and reference lookup
- `find_related_docs`: Find documentation related to code
- `get_index_status`: Get indexing statistics and status
- `clear_index`: Clear all indexed data

#### Incremental Updates
- File watcher with chokidar
- Debounced file change detection (500ms)
- Incremental re-indexing for modified files
- Background update tasks with worker threads
- Priority queue management

#### Performance Optimizations
- Parser pool for Tree-sitter parser reuse
- Query cache with LRU eviction
- Cached embedding engine
- Parallel processing with Promise.all
- Memory-efficient streaming

#### Testing & Quality Assurance
- 32 test suites with 535 unit tests
- E2E integration tests with sample projects
- Performance benchmarking framework
- GitHub Actions CI/CD pipeline
- Test coverage reporting

#### Documentation
- Comprehensive README with quick start guide
- Detailed setup guide (SETUP.md)
- Configuration reference (CONFIGURATION.md)
- Troubleshooting guide (TROUBLESHOOTING.md)
- Architecture documentation (ARCHITECTURE.md)
- Plugin development guide (PLUGIN_DEVELOPMENT.md)
- MCP tools API reference (MCP_TOOLS_API.md)
- Claude Code integration guide (CLAUDE_CODE_INTEGRATION.md)
- Security checklist (security-checklist.md)
- Optimization report (optimization-report.md)

### Known Issues

#### Moderate Security Vulnerabilities
- @grpc/grpc-js dependency (CVSS 5.3) - Required by Milvus SDK
  - Workaround: Use Chroma plugin instead
  - Status: Monitoring for upstream fix

#### Test Coverage
- Current coverage: ~60% (target: 80%)
- Low coverage areas:
  - parser/comment-extractor.ts (6.36%)
  - parser/symbol-extractor.ts (29.31%)
  - parser/ast-engine.ts (47.5%)
  - storage layer (49.84%)
  - services layer (69.63%)

#### Performance Testing
- Performance benchmarks created but not yet executed
- NFR validation pending:
  - NFR-001: Indexing time (10,000 files / 5 minutes)
  - NFR-002: Search response time (2 seconds)
  - NFR-003: Memory usage (2GB limit)
  - NFR-004: Incremental update (100ms)

#### Features Not Yet Implemented
- `indexingService.removeFile` method (required for full incremental update)
- Advanced parameter validation in `hybridSearchEngine.search`
- Automatic CHANGELOG update script (scripts/update-changelog.js)

### Notes

#### Privacy-First Design
- Default mode is fully local (no external API calls)
- Sensitive file patterns automatically excluded
- API keys sanitized from logs
- TLS/SSL required for cloud mode connections

#### Performance Considerations
- Recommended: 8GB RAM minimum for Milvus + Transformers.js
- Docker required for Milvus (or use Chroma as alternative)
- Initial indexing may take several minutes for large projects
- Query cache significantly improves repeated search performance

#### Claude Code Integration
- MCP server runs as stdio transport
- Full support for all 6 MCP tools
- Detailed integration guide available in docs/
- Tested with Claude Code MCP protocol

## [Unreleased]

### Planned
- Increase test coverage to 80%+
- Execute performance benchmarks and optimize based on results
- Implement `indexingService.removeFile` for full incremental updates
- Add automatic CHANGELOG update script
- Support additional vector databases (Qdrant, Weaviate)
- Support additional embedding providers (Cohere, HuggingFace)
- Add multi-language support for documentation
- Implement query history and analytics

---

[0.1.0]: https://github.com/your-org/lsp-mcp/releases/tag/v0.1.0
