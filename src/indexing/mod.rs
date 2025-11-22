/// Indexing Service
///
/// This module provides the core indexing service that coordinates:
/// - File scanning and discovery
/// - AST parsing and symbol extraction
/// - Embedding generation
/// - Storage in vector database and BM25 index
///
/// The indexing service is designed for:
/// - Parallel processing of files for maximum throughput
/// - Progress tracking and error collection
/// - Batch operations for efficient database writes
/// - Resilient error handling (single file failures don't stop the whole process)
pub mod file_scanner;
pub mod file_watcher;
pub mod service;
pub mod types;

pub use file_scanner::FileScanner;
pub use file_watcher::{AsyncFileWatcher, FileChangeEvent, FileChangeKind, FileWatcher};
pub use service::IndexingService;
pub use types::{FileIndexResult, IndexConfig, IndexError, IndexProgress, IndexResult, ScanConfig};
