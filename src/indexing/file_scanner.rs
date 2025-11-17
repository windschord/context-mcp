/// File Scanner
///
/// This module provides file discovery functionality with support for:
/// - Language filtering
/// - .gitignore pattern matching
/// - Custom exclude patterns
/// - Markdown documentation inclusion

use crate::error::{ContextMcpError, Result};
use crate::indexing::types::ScanConfig;
use crate::parser::Language;
use ignore::{overrides::OverrideBuilder, WalkBuilder};
use std::path::{Path, PathBuf};
use tracing::{debug, warn};

/// File scanner for discovering source code files
pub struct FileScanner;

impl FileScanner {
    /// Scan a directory for source files
    ///
    /// # Arguments
    /// - `root`: Root directory to scan
    /// - `config`: Scan configuration
    ///
    /// # Returns
    /// List of file paths that match the criteria
    pub fn scan(root: &Path, config: &ScanConfig) -> Result<Vec<PathBuf>> {
        if !root.exists() {
            return Err(ContextMcpError::FileSystem(format!(
                "Root path does not exist: {}",
                root.display()
            )));
        }

        if !root.is_dir() {
            return Err(ContextMcpError::FileSystem(format!(
                "Root path is not a directory: {}",
                root.display()
            )));
        }

        debug!("Scanning directory: {}", root.display());
        debug!("Languages filter: {:?}", config.languages);
        debug!("Include documents: {}", config.include_documents);
        debug!("Exclude patterns: {:?}", config.exclude_patterns);

        // Create a WalkBuilder with gitignore support
        let mut builder = WalkBuilder::new(root);
        builder
            .git_ignore(true) // Respect .gitignore files
            .git_global(true) // Respect global gitignore
            .git_exclude(true) // Respect .git/info/exclude
            .hidden(false) // Don't skip hidden files (some projects use them)
            .follow_links(false); // Don't follow symlinks to avoid cycles

        // Add custom ignore patterns
        if !config.exclude_patterns.is_empty() {
            let mut override_builder = OverrideBuilder::new(root);
            for pattern in &config.exclude_patterns {
                if let Err(e) = override_builder.add(&format!("!{}", pattern)) {
                    warn!("Failed to add exclude pattern '{}': {}", pattern, e);
                }
            }
            if let Ok(overrides) = override_builder.build() {
                builder.overrides(overrides);
            }
        }

        let walker = builder.build();
        let mut files = Vec::new();

        for entry in walker {
            match entry {
                Ok(entry) => {
                    let path = entry.path();

                    // Skip directories
                    if !path.is_file() {
                        continue;
                    }

                    // Check if file should be included
                    if Self::should_include_file(path, config) {
                        files.push(path.to_path_buf());
                    }
                }
                Err(e) => {
                    warn!("Error walking directory: {}", e);
                }
            }
        }

        debug!("Found {} files to index", files.len());
        Ok(files)
    }

    /// Check if a file should be included based on configuration
    fn should_include_file(path: &Path, config: &ScanConfig) -> bool {
        // Get file extension
        let extension = match path.extension() {
            Some(ext) => ext.to_string_lossy().to_string(),
            None => return false,
        };

        // Check if it's a Markdown file
        if extension == "md" {
            return config.include_documents;
        }

        // Detect language from extension
        let language = Language::from_extension(&extension);

        // Skip unknown languages
        if language == Language::Unknown {
            return false;
        }

        // If language filter is specified, check if this language is included
        if !config.languages.is_empty() {
            return config.languages.contains(&language);
        }

        // No filter, include all known languages
        true
    }

    /// Count files that would be scanned (without actually scanning them)
    pub fn count_files(root: &Path, config: &ScanConfig) -> Result<usize> {
        let files = Self::scan(root, config)?;
        Ok(files.len())
    }

    /// Get all unique languages in a directory
    pub fn detect_languages(root: &Path) -> Result<Vec<Language>> {
        let config = ScanConfig {
            languages: Vec::new(),
            exclude_patterns: Vec::new(),
            include_documents: false,
        };

        let files = Self::scan(root, &config)?;
        let mut languages = std::collections::HashSet::new();

        for file in files {
            if let Some(ext) = file.extension() {
                let lang = Language::from_extension(&ext.to_string_lossy());
                if lang != Language::Unknown {
                    languages.insert(lang);
                }
            }
        }

        let mut langs: Vec<Language> = languages.into_iter().collect();
        langs.sort_by_key(|l| l.as_str());
        Ok(langs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_project() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();

        // Initialize git repository so .gitignore is recognized
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(root)
            .output()
            .unwrap();

        // Create test files
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();
        fs::write(root.join("src/lib.rs"), "pub fn test() {}").unwrap();

        fs::create_dir_all(root.join("tests")).unwrap();
        fs::write(root.join("tests/test.rs"), "#[test] fn test() {}").unwrap();

        fs::create_dir_all(root.join("docs")).unwrap();
        fs::write(root.join("docs/README.md"), "# Documentation").unwrap();

        // Create .gitignore
        fs::write(root.join(".gitignore"), "target/\n*.tmp\n").unwrap();

        // Create ignored files
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(root.join("target/debug.rs"), "// should be ignored").unwrap();
        fs::write(root.join("test.tmp"), "// should be ignored").unwrap();

        temp_dir
    }

    #[test]
    fn test_scan_basic() {
        let temp_dir = create_test_project();
        let config = ScanConfig {
            languages: Vec::new(),
            exclude_patterns: Vec::new(),
            include_documents: false,
        };

        let files = FileScanner::scan(temp_dir.path(), &config).unwrap();

        // Should find 3 .rs files (main.rs, lib.rs, test.rs)
        // Should NOT find .md files (include_documents = false)
        // Should NOT find files in target/ (gitignored)
        assert_eq!(files.len(), 3);

        let file_names: Vec<String> = files
            .iter()
            .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .collect();

        assert!(file_names.contains(&"main.rs".to_string()));
        assert!(file_names.contains(&"lib.rs".to_string()));
        assert!(file_names.contains(&"test.rs".to_string()));
        assert!(!file_names.contains(&"README.md".to_string()));
        assert!(!file_names.contains(&"debug.rs".to_string()));
    }

    #[test]
    fn test_scan_with_documents() {
        let temp_dir = create_test_project();
        let config = ScanConfig {
            languages: Vec::new(),
            exclude_patterns: Vec::new(),
            include_documents: true,
        };

        let files = FileScanner::scan(temp_dir.path(), &config).unwrap();

        // Should include .md files
        assert_eq!(files.len(), 4);

        let file_names: Vec<String> = files
            .iter()
            .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .collect();

        assert!(file_names.contains(&"README.md".to_string()));
    }

    #[test]
    fn test_scan_with_language_filter() {
        let temp_dir = create_test_project();

        // Add a Python file
        fs::write(temp_dir.path().join("src/script.py"), "print('hello')").unwrap();

        let config = ScanConfig {
            languages: vec![Language::Rust],
            exclude_patterns: Vec::new(),
            include_documents: false,
        };

        let files = FileScanner::scan(temp_dir.path(), &config).unwrap();

        // Should only find .rs files, not .py
        assert_eq!(files.len(), 3);

        let file_names: Vec<String> = files
            .iter()
            .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .collect();

        assert!(!file_names.contains(&"script.py".to_string()));
    }

    #[test]
    fn test_detect_languages() {
        let temp_dir = create_test_project();

        // Add files in different languages
        fs::write(temp_dir.path().join("src/script.py"), "print('hello')").unwrap();
        fs::write(temp_dir.path().join("src/main.go"), "package main").unwrap();

        let languages = FileScanner::detect_languages(temp_dir.path()).unwrap();

        assert!(languages.contains(&Language::Rust));
        assert!(languages.contains(&Language::Python));
        assert!(languages.contains(&Language::Go));
    }

    #[test]
    fn test_count_files() {
        let temp_dir = create_test_project();
        let config = ScanConfig {
            languages: Vec::new(),
            exclude_patterns: Vec::new(),
            include_documents: false,
        };

        let count = FileScanner::count_files(temp_dir.path(), &config).unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_scan_nonexistent_directory() {
        let config = ScanConfig {
            languages: Vec::new(),
            exclude_patterns: Vec::new(),
            include_documents: false,
        };

        let result = FileScanner::scan(Path::new("/nonexistent/path"), &config);
        assert!(result.is_err());
    }
}
