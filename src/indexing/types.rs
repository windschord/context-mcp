/// Type definitions for the indexing service
///
/// This module defines configuration options, progress tracking, and result types
/// for the indexing service.
use crate::parser::Language;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Configuration for indexing a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexConfig {
    /// Root path of the project to index
    pub root_path: PathBuf,

    /// Target languages (empty means all languages)
    #[serde(default)]
    pub languages: Vec<Language>,

    /// Exclude patterns (.gitignore format)
    #[serde(default)]
    pub exclude_patterns: Vec<String>,

    /// Include Markdown documentation files
    #[serde(default = "default_true")]
    pub include_documents: bool,

    /// Batch size for database writes (default: 32)
    #[serde(default = "default_batch_size")]
    pub batch_size: usize,

    /// Maximum parallel tasks (default: CPU count)
    #[serde(default = "default_max_parallel")]
    pub max_parallel: usize,

    /// Project ID (for multi-project support)
    #[serde(default = "default_project_id")]
    pub project_id: String,
}

fn default_true() -> bool {
    true
}

fn default_batch_size() -> usize {
    32
}

fn default_max_parallel() -> usize {
    num_cpus::get()
}

fn default_project_id() -> String {
    "default".to_string()
}

impl IndexConfig {
    /// Create a new index configuration
    pub fn new(root_path: PathBuf) -> Self {
        Self {
            root_path,
            languages: Vec::new(),
            exclude_patterns: Vec::new(),
            include_documents: true,
            batch_size: 32,
            max_parallel: num_cpus::get(),
            project_id: "default".to_string(),
        }
    }

    /// Set target languages
    pub fn with_languages(mut self, languages: Vec<Language>) -> Self {
        self.languages = languages;
        self
    }

    /// Set exclude patterns
    pub fn with_exclude_patterns(mut self, patterns: Vec<String>) -> Self {
        self.exclude_patterns = patterns;
        self
    }

    /// Set whether to include documents
    pub fn with_include_documents(mut self, include: bool) -> Self {
        self.include_documents = include;
        self
    }

    /// Set batch size
    pub fn with_batch_size(mut self, size: usize) -> Self {
        self.batch_size = size;
        self
    }

    /// Set maximum parallel tasks
    pub fn with_max_parallel(mut self, max: usize) -> Self {
        self.max_parallel = max;
        self
    }

    /// Set project ID
    pub fn with_project_id(mut self, id: String) -> Self {
        self.project_id = id;
        self
    }
}

/// Configuration for file scanning
#[derive(Debug, Clone)]
pub struct ScanConfig {
    /// Target languages (empty means all languages)
    pub languages: Vec<Language>,

    /// Exclude patterns (.gitignore format)
    pub exclude_patterns: Vec<String>,

    /// Include Markdown documentation files
    pub include_documents: bool,
}

impl From<&IndexConfig> for ScanConfig {
    fn from(config: &IndexConfig) -> Self {
        Self {
            languages: config.languages.clone(),
            exclude_patterns: config.exclude_patterns.clone(),
            include_documents: config.include_documents,
        }
    }
}

/// Error that occurred during indexing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexError {
    /// File path where the error occurred
    pub file_path: String,

    /// Error message
    pub message: String,

    /// Error kind
    pub kind: ErrorKind,
}

impl IndexError {
    /// Create a new index error
    pub fn new(file_path: String, message: String, kind: ErrorKind) -> Self {
        Self {
            file_path,
            message,
            kind,
        }
    }

    /// Create a parse error
    pub fn parse(file_path: String, message: String) -> Self {
        Self::new(file_path, message, ErrorKind::Parse)
    }

    /// Create an embedding error
    pub fn embedding(file_path: String, message: String) -> Self {
        Self::new(file_path, message, ErrorKind::Embedding)
    }

    /// Create a storage error
    pub fn storage(file_path: String, message: String) -> Self {
        Self::new(file_path, message, ErrorKind::Storage)
    }

    /// Create an I/O error
    pub fn io(file_path: String, message: String) -> Self {
        Self::new(file_path, message, ErrorKind::Io)
    }
}

/// Kind of indexing error
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ErrorKind {
    /// AST parsing error
    Parse,
    /// Embedding generation error
    Embedding,
    /// Storage/database error
    Storage,
    /// I/O error
    Io,
    /// Other error
    Other,
}

/// Progress tracker for indexing
///
/// This struct uses atomic operations for thread-safe progress tracking
/// across parallel indexing tasks.
#[derive(Debug, Clone)]
pub struct IndexProgress {
    /// Total number of files to process
    total_files: Arc<AtomicUsize>,

    /// Number of files processed so far
    processed_files: Arc<AtomicUsize>,

    /// Total number of symbols extracted
    total_symbols: Arc<AtomicUsize>,

    /// Errors encountered during indexing
    errors: Arc<Mutex<Vec<IndexError>>>,

    /// Start time of indexing
    start_time: Instant,
}

impl IndexProgress {
    /// Create a new progress tracker
    pub fn new(total_files: usize) -> Self {
        Self {
            total_files: Arc::new(AtomicUsize::new(total_files)),
            processed_files: Arc::new(AtomicUsize::new(0)),
            total_symbols: Arc::new(AtomicUsize::new(0)),
            errors: Arc::new(Mutex::new(Vec::new())),
            start_time: Instant::now(),
        }
    }

    /// Get total number of files
    pub fn total_files(&self) -> usize {
        self.total_files.load(Ordering::Relaxed)
    }

    /// Get number of processed files
    pub fn processed_files(&self) -> usize {
        self.processed_files.load(Ordering::Relaxed)
    }

    /// Get total number of symbols
    pub fn total_symbols(&self) -> usize {
        self.total_symbols.load(Ordering::Relaxed)
    }

    /// Get elapsed time
    pub fn elapsed(&self) -> Duration {
        self.start_time.elapsed()
    }

    /// Increment processed files counter
    pub fn increment_processed(&self) {
        self.processed_files.fetch_add(1, Ordering::Relaxed);
    }

    /// Add symbols to the total count
    pub fn add_symbols(&self, count: usize) {
        self.total_symbols.fetch_add(count, Ordering::Relaxed);
    }

    /// Add an error
    pub fn add_error(&self, error: IndexError) {
        self.errors.lock().push(error);
    }

    /// Get all errors
    pub fn errors(&self) -> Vec<IndexError> {
        self.errors.lock().clone()
    }

    /// Get error count
    pub fn error_count(&self) -> usize {
        self.errors.lock().len()
    }

    /// Generate a progress report string
    pub fn report(&self) -> String {
        let processed = self.processed_files();
        let total = self.total_files();
        let symbols = self.total_symbols();
        let errors = self.error_count();
        let elapsed = self.elapsed();
        let percentage = if total > 0 {
            processed as f64 / total as f64 * 100.0
        } else {
            0.0
        };

        format!(
            "Progress: {}/{} files ({:.1}%), {} symbols, {} errors, elapsed: {:.2}s",
            processed,
            total,
            percentage,
            symbols,
            errors,
            elapsed.as_secs_f64()
        )
    }
}

/// Result of indexing a single file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileIndexResult {
    /// File path
    pub file_path: String,

    /// Whether indexing was successful
    pub success: bool,

    /// Number of symbols extracted
    pub symbol_count: usize,

    /// Error if indexing failed
    pub error: Option<IndexError>,

    /// Processing time in milliseconds
    pub processing_time_ms: u64,
}

impl FileIndexResult {
    /// Create a success result
    pub fn success(file_path: String, symbol_count: usize, processing_time_ms: u64) -> Self {
        Self {
            file_path,
            success: true,
            symbol_count,
            error: None,
            processing_time_ms,
        }
    }

    /// Create an error result
    pub fn error(file_path: String, error: IndexError, processing_time_ms: u64) -> Self {
        Self {
            file_path,
            success: false,
            symbol_count: 0,
            error: Some(error),
            processing_time_ms,
        }
    }
}

/// Result of indexing operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexResult {
    /// Whether the overall indexing was successful
    pub success: bool,

    /// Total number of files discovered
    pub total_files: usize,

    /// Number of files successfully indexed
    pub indexed_files: usize,

    /// Total number of symbols extracted
    pub total_symbols: usize,

    /// Errors encountered during indexing
    pub errors: Vec<IndexError>,

    /// Total processing time
    pub duration: Duration,
}

impl IndexResult {
    /// Create a new index result
    pub fn new(
        success: bool,
        total_files: usize,
        indexed_files: usize,
        total_symbols: usize,
        errors: Vec<IndexError>,
        duration: Duration,
    ) -> Self {
        Self {
            success,
            total_files,
            indexed_files,
            total_symbols,
            errors,
            duration,
        }
    }

    /// Create result from progress tracker
    pub fn from_progress(progress: &IndexProgress) -> Self {
        let total_files = progress.total_files();
        let processed_files = progress.processed_files();
        let total_symbols = progress.total_symbols();
        let errors = progress.errors();
        let duration = progress.elapsed();

        let indexed_files = processed_files - errors.len();
        let success = errors.is_empty() && processed_files == total_files;

        Self::new(
            success,
            total_files,
            indexed_files,
            total_symbols,
            errors,
            duration,
        )
    }

    /// Get success rate as percentage
    pub fn success_rate(&self) -> f64 {
        if self.total_files == 0 {
            0.0
        } else {
            (self.indexed_files as f64 / self.total_files as f64) * 100.0
        }
    }

    /// Get indexing throughput (files per second)
    pub fn throughput(&self) -> f64 {
        let seconds = self.duration.as_secs_f64();
        if seconds > 0.0 {
            self.indexed_files as f64 / seconds
        } else {
            0.0
        }
    }

    /// Generate a summary report
    pub fn summary(&self) -> String {
        format!(
            "Indexing completed: {}/{} files ({:.1}%), {} symbols, {} errors, {:.2}s ({:.1} files/s)",
            self.indexed_files,
            self.total_files,
            self.success_rate(),
            self.total_symbols,
            self.errors.len(),
            self.duration.as_secs_f64(),
            self.throughput(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_config_creation() {
        let config = IndexConfig::new(PathBuf::from("/test/project"));
        assert_eq!(config.root_path, PathBuf::from("/test/project"));
        assert!(config.languages.is_empty());
        assert!(config.include_documents);
        assert_eq!(config.batch_size, 32);
    }

    #[test]
    fn test_index_config_builder() {
        let config = IndexConfig::new(PathBuf::from("/test"))
            .with_languages(vec![Language::Rust])
            .with_exclude_patterns(vec!["*.test".to_string()])
            .with_batch_size(64)
            .with_project_id("test-project".to_string());

        assert_eq!(config.languages.len(), 1);
        assert_eq!(config.exclude_patterns.len(), 1);
        assert_eq!(config.batch_size, 64);
        assert_eq!(config.project_id, "test-project");
    }

    #[test]
    fn test_index_error_creation() {
        let error = IndexError::parse("/test/file.rs".to_string(), "Parse failed".to_string());

        assert_eq!(error.file_path, "/test/file.rs");
        assert_eq!(error.message, "Parse failed");
        assert_eq!(error.kind, ErrorKind::Parse);
    }

    #[test]
    fn test_index_progress() {
        let progress = IndexProgress::new(100);

        assert_eq!(progress.total_files(), 100);
        assert_eq!(progress.processed_files(), 0);
        assert_eq!(progress.total_symbols(), 0);

        progress.increment_processed();
        assert_eq!(progress.processed_files(), 1);

        progress.add_symbols(10);
        assert_eq!(progress.total_symbols(), 10);

        progress.add_error(IndexError::parse(
            "test.rs".to_string(),
            "error".to_string(),
        ));
        assert_eq!(progress.error_count(), 1);
    }

    #[test]
    fn test_file_index_result() {
        let success = FileIndexResult::success("/test/file.rs".to_string(), 5, 100);
        assert!(success.success);
        assert_eq!(success.symbol_count, 5);
        assert!(success.error.is_none());

        let error = FileIndexResult::error(
            "/test/bad.rs".to_string(),
            IndexError::parse("bad.rs".to_string(), "error".to_string()),
            50,
        );
        assert!(!error.success);
        assert_eq!(error.symbol_count, 0);
        assert!(error.error.is_some());
    }

    #[test]
    fn test_index_result_from_progress() {
        let progress = IndexProgress::new(10);
        progress.increment_processed();
        progress.increment_processed();
        progress.add_symbols(20);

        let result = IndexResult::from_progress(&progress);
        assert_eq!(result.total_files, 10);
        assert_eq!(result.indexed_files, 2);
        assert_eq!(result.total_symbols, 20);
    }

    #[test]
    fn test_index_result_metrics() {
        let result = IndexResult::new(true, 100, 90, 500, Vec::new(), Duration::from_secs(10));

        assert_eq!(result.success_rate(), 90.0);
        assert_eq!(result.throughput(), 9.0);
    }
}
