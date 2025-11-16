/// Tree-sitter AST parsing and symbol extraction module
///
/// This module provides functionality to parse source code files using Tree-sitter
/// and extract symbols (functions, classes, methods, variables, etc.) for indexing
/// and semantic search.
///
/// # Supported Languages
///
/// - TypeScript / JavaScript
/// - Python
/// - Go
/// - Rust
/// - Java
/// - C / C++ (including Arduino)
///
/// # Usage
///
/// ```rust,no_run
/// use context_mcp::parser::{SymbolExtractor, Language};
///
/// let extractor = SymbolExtractor::new();
/// let source_code = "fn main() { println!(\"Hello\"); }";
/// let result = extractor.extract_from_file("main.rs", source_code).unwrap();
///
/// for symbol in result.symbols {
///     println!("Found {}: {}", symbol.kind, symbol.name);
/// }
/// ```

pub mod ast_parser;
pub mod symbol_extractor;
pub mod types;

// Re-export main types for convenience
pub use ast_parser::AstParser;
pub use symbol_extractor::SymbolExtractor;
pub use types::{
    Language, ParseResult, Position, Range, Symbol, SymbolKind,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Test that all main types are accessible
        let _extractor = SymbolExtractor::new();
        let _parser = AstParser::new();
        let _lang = Language::Rust;
    }

    #[test]
    fn test_supported_languages() {
        // Verify all supported languages can be detected
        let languages = vec![
            ("test.ts", Language::TypeScript),
            ("test.js", Language::JavaScript),
            ("test.py", Language::Python),
            ("test.go", Language::Go),
            ("test.rs", Language::Rust),
            ("test.java", Language::Java),
            ("test.c", Language::C),
            ("test.cpp", Language::Cpp),
            ("test.ino", Language::C), // Arduino
        ];

        for (filename, expected_lang) in languages {
            let detected = Language::from_extension(
                std::path::Path::new(filename)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
            );
            assert_eq!(detected, expected_lang, "Failed for {}", filename);
        }
    }
}
