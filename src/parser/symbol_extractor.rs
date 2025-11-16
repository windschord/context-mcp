use std::path::Path;

use crate::error::Result;
use super::ast_parser::AstParser;
use super::types::{Language, ParseResult, Symbol};

/// Symbol extractor that uses AST parsing to extract symbols from source files
pub struct SymbolExtractor {
    parser: AstParser,
}

impl SymbolExtractor {
    /// Create a new symbol extractor
    pub fn new() -> Self {
        Self {
            parser: AstParser::new(),
        }
    }

    /// Extract symbols from a source file
    ///
    /// # Arguments
    /// * `file_path` - Path to the source file
    /// * `source_code` - Source code content
    ///
    /// # Returns
    /// ParseResult containing extracted symbols or error information
    pub fn extract_from_file(&self, file_path: &str, source_code: &str) -> Result<ParseResult> {
        // Detect language from file extension
        let language = self.detect_language(file_path);

        // Parse and extract symbols
        self.parser.parse_file(file_path, source_code, language)
    }

    /// Extract symbols from source code with explicit language
    ///
    /// # Arguments
    /// * `file_path` - Path to the source file (for reference)
    /// * `source_code` - Source code content
    /// * `language` - Explicit language to use for parsing
    ///
    /// # Returns
    /// ParseResult containing extracted symbols or error information
    pub fn extract_with_language(
        &self,
        file_path: &str,
        source_code: &str,
        language: Language,
    ) -> Result<ParseResult> {
        self.parser.parse_file(file_path, source_code, language)
    }

    /// Detect language from file path
    fn detect_language(&self, file_path: &str) -> Language {
        if let Some(ext) = Path::new(file_path).extension() {
            if let Some(ext_str) = ext.to_str() {
                return Language::from_extension(ext_str);
            }
        }
        Language::Unknown
    }

    /// Check if a file should be parsed based on its extension
    pub fn should_parse_file(&self, file_path: &str) -> bool {
        self.detect_language(file_path) != Language::Unknown
    }

    /// Get all supported file extensions
    pub fn supported_extensions() -> Vec<&'static str> {
        let mut extensions = Vec::new();
        for lang in &[
            Language::TypeScript,
            Language::JavaScript,
            Language::Python,
            Language::Go,
            Language::Rust,
            Language::Java,
            Language::C,
            Language::Cpp,
        ] {
            extensions.extend_from_slice(lang.extensions());
        }
        extensions
    }

    /// Filter symbols by kind
    pub fn filter_symbols_by_kind(
        symbols: &[Symbol],
        kinds: &[super::types::SymbolKind],
    ) -> Vec<Symbol> {
        symbols
            .iter()
            .filter(|s| kinds.contains(&s.kind))
            .cloned()
            .collect()
    }

    /// Find symbols by name (case-insensitive partial match)
    pub fn find_symbols_by_name(symbols: &[Symbol], name: &str) -> Vec<Symbol> {
        let name_lower = name.to_lowercase();
        symbols
            .iter()
            .filter(|s| s.name.to_lowercase().contains(&name_lower))
            .cloned()
            .collect()
    }

    /// Find symbols in a specific line range
    pub fn find_symbols_in_range(
        symbols: &[Symbol],
        start_line: usize,
        end_line: usize,
    ) -> Vec<Symbol> {
        symbols
            .iter()
            .filter(|s| {
                let (sym_start, sym_end) = s.range.line_range();
                // Check for overlap
                !(sym_end < start_line || sym_start > end_line)
            })
            .cloned()
            .collect()
    }
}

impl Default for SymbolExtractor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language() {
        let extractor = SymbolExtractor::new();

        assert_eq!(extractor.detect_language("file.ts"), Language::TypeScript);
        assert_eq!(extractor.detect_language("file.js"), Language::JavaScript);
        assert_eq!(extractor.detect_language("file.py"), Language::Python);
        assert_eq!(extractor.detect_language("file.rs"), Language::Rust);
        assert_eq!(extractor.detect_language("file.go"), Language::Go);
        assert_eq!(extractor.detect_language("file.java"), Language::Java);
        assert_eq!(extractor.detect_language("file.c"), Language::C);
        assert_eq!(extractor.detect_language("file.cpp"), Language::Cpp);
        assert_eq!(extractor.detect_language("file.ino"), Language::C); // Arduino
        assert_eq!(extractor.detect_language("file.txt"), Language::Unknown);
    }

    #[test]
    fn test_should_parse_file() {
        let extractor = SymbolExtractor::new();

        assert!(extractor.should_parse_file("test.ts"));
        assert!(extractor.should_parse_file("test.py"));
        assert!(extractor.should_parse_file("test.rs"));
        assert!(!extractor.should_parse_file("test.txt"));
        assert!(!extractor.should_parse_file("README.md"));
    }

    #[test]
    fn test_supported_extensions() {
        let extensions = SymbolExtractor::supported_extensions();
        assert!(extensions.contains(&"ts"));
        assert!(extensions.contains(&"js"));
        assert!(extensions.contains(&"py"));
        assert!(extensions.contains(&"rs"));
        assert!(extensions.contains(&"go"));
        assert!(extensions.contains(&"java"));
        assert!(extensions.contains(&"c"));
        assert!(extensions.contains(&"cpp"));
        assert!(extensions.contains(&"ino")); // Arduino
    }

    #[test]
    fn test_extract_from_python_file() {
        let extractor = SymbolExtractor::new();
        let source = r#"
def hello():
    print("Hello")

class MyClass:
    def method(self):
        pass
"#;

        let result = extractor.extract_from_file("test.py", source).unwrap();
        assert!(result.success);
        assert_eq!(result.language, Language::Python);
        assert!(!result.symbols.is_empty());
    }

    #[test]
    fn test_extract_with_explicit_language() {
        let extractor = SymbolExtractor::new();
        let source = "fn main() { println!(\"Hello\"); }";

        let result = extractor
            .extract_with_language("unknown.txt", source, Language::Rust)
            .unwrap();
        assert!(result.success);
        assert_eq!(result.language, Language::Rust);
    }
}
