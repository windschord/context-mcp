use std::time::Instant;
use streaming_iterator::StreamingIterator;
use tree_sitter::{Node, Parser, Query, QueryCursor, Tree};

use super::types::{Language, ParseResult, Position, Range, Symbol, SymbolKind};
use crate::error::{ContextMcpError, Result};

/// Tree-sitter language parsers
#[derive(Clone)]
pub struct LanguageParsers {
    typescript: tree_sitter::Language,
    javascript: tree_sitter::Language,
    python: tree_sitter::Language,
    go: tree_sitter::Language,
    rust: tree_sitter::Language,
    java: tree_sitter::Language,
    c: tree_sitter::Language,
    cpp: tree_sitter::Language,
}

impl LanguageParsers {
    /// Initialize all language parsers
    pub fn new() -> Self {
        Self {
            typescript: tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            javascript: tree_sitter_javascript::LANGUAGE.into(),
            python: tree_sitter_python::LANGUAGE.into(),
            go: tree_sitter_go::LANGUAGE.into(),
            rust: tree_sitter_rust::LANGUAGE.into(),
            java: tree_sitter_java::LANGUAGE.into(),
            c: tree_sitter_c::LANGUAGE.into(),
            cpp: tree_sitter_cpp::LANGUAGE.into(),
        }
    }

    /// Get parser for a specific language
    pub fn get_language(&self, lang: Language) -> Option<tree_sitter::Language> {
        match lang {
            Language::TypeScript => Some(self.typescript.clone()),
            Language::JavaScript => Some(self.javascript.clone()),
            Language::Python => Some(self.python.clone()),
            Language::Go => Some(self.go.clone()),
            Language::Rust => Some(self.rust.clone()),
            Language::Java => Some(self.java.clone()),
            Language::C => Some(self.c.clone()),
            Language::Cpp => Some(self.cpp.clone()),
            Language::Unknown => None,
        }
    }
}

/// AST Parser for source code files
pub struct AstParser {
    parsers: LanguageParsers,
}

impl AstParser {
    /// Create a new AST parser
    pub fn new() -> Self {
        Self {
            parsers: LanguageParsers::new(),
        }
    }

    /// Parse a source file and extract symbols
    pub fn parse_file(
        &self,
        file_path: &str,
        source_code: &str,
        language: Language,
    ) -> Result<ParseResult> {
        let start = Instant::now();

        // Get tree-sitter language
        let ts_language = match self.parsers.get_language(language) {
            Some(lang) => lang,
            None => {
                return Ok(ParseResult::error(
                    language,
                    file_path.to_string(),
                    format!("Unsupported language: {}", language),
                ));
            }
        };

        // Create parser and parse source
        let mut parser = Parser::new();
        parser
            .set_language(&ts_language)
            .map_err(|e| ContextMcpError::TreeSitter(format!("Failed to set language: {}", e)))?;

        let tree = match parser.parse(source_code, None) {
            Some(tree) => tree,
            None => {
                return Ok(ParseResult::error(
                    language,
                    file_path.to_string(),
                    "Failed to parse source code".to_string(),
                ));
            }
        };

        // Extract symbols using language-specific queries
        let symbols = self.extract_symbols(&tree, source_code, language)?;

        let elapsed = start.elapsed().as_millis() as u64;

        Ok(ParseResult::success(
            language,
            file_path.to_string(),
            symbols,
            elapsed,
        ))
    }

    /// Extract symbols from parsed tree
    fn extract_symbols(
        &self,
        tree: &Tree,
        source_code: &str,
        language: Language,
    ) -> Result<Vec<Symbol>> {
        let query_str = get_query_for_language(language);
        if query_str.is_empty() {
            return Ok(Vec::new());
        }

        let ts_language = self.parsers.get_language(language).unwrap();
        let query = Query::new(&ts_language, query_str)
            .map_err(|e| ContextMcpError::TreeSitter(format!("Invalid query: {}", e)))?;

        let mut cursor = QueryCursor::new();
        let mut matches = cursor.matches(&query, tree.root_node(), source_code.as_bytes());

        let mut symbols = Vec::new();

        while let Some(match_) = matches.next() {
            if let Some(symbol) =
                self.extract_symbol_from_match(&match_, &query, source_code, language)
            {
                symbols.push(symbol);
            }
        }

        Ok(symbols)
    }

    /// Extract a single symbol from a query match
    fn extract_symbol_from_match(
        &self,
        match_: &tree_sitter::QueryMatch,
        query: &Query,
        source_code: &str,
        language: Language,
    ) -> Option<Symbol> {
        let capture_names = query.capture_names();

        // Find relevant captures
        let mut name: Option<String> = None;
        let mut kind: Option<SymbolKind> = None;
        let mut range: Option<Range> = None;
        let mut text: Option<String> = None;
        let mut params: Option<Vec<String>> = None;
        let mut docstring: Option<String> = None;

        for capture in match_.captures {
            let capture_name = &capture_names[capture.index as usize];
            let node = capture.node;

            match capture_name.as_ref() {
                "function.name" | "method.name" | "class.name" | "struct.name" | "enum.name"
                | "interface.name" | "trait.name" | "type.name" | "variable.name"
                | "constant.name" => {
                    name = Some(node_text(node, source_code));
                    if range.is_none() {
                        range = Some(node_to_range(node));
                    }
                }
                "function.definition" => {
                    kind = Some(SymbolKind::Function);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "method.definition" => {
                    kind = Some(SymbolKind::Method);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "class.definition" => {
                    kind = Some(SymbolKind::Class);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "struct.definition" => {
                    kind = Some(SymbolKind::Struct);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "enum.definition" => {
                    kind = Some(SymbolKind::Enum);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "interface.definition" => {
                    kind = Some(SymbolKind::Interface);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "trait.definition" => {
                    kind = Some(SymbolKind::Trait);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "variable.definition" => {
                    kind = Some(SymbolKind::Variable);
                    text = Some(node_text(node, source_code));
                    range = Some(node_to_range(node));
                }
                "function.params" | "method.params" => {
                    params = Some(extract_parameters(node, source_code));
                }
                "comment" | "docstring" => {
                    docstring = Some(node_text(node, source_code));
                }
                _ => {}
            }
        }

        // Infer kind from capture pattern if not set
        if kind.is_none() {
            kind = infer_kind_from_language(language, &capture_names, match_);
        }

        // Build symbol if we have minimum required information
        if let (Some(name), Some(kind), Some(range), Some(text)) = (name, kind, range, text) {
            let mut symbol = Symbol::new(name, kind, range, text);
            if let Some(params) = params {
                symbol = symbol.with_parameters(params);
            }
            if let Some(doc) = docstring {
                symbol = symbol.with_docstring(doc);
            }
            Some(symbol)
        } else {
            None
        }
    }
}

impl Default for AstParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert tree-sitter node to our Range type
fn node_to_range(node: Node) -> Range {
    let start_pos = node.start_position();
    let end_pos = node.end_position();

    Range::new(
        Position::new(start_pos.row, start_pos.column),
        Position::new(end_pos.row, end_pos.column),
    )
}

/// Get text content of a node
fn node_text(node: Node, source_code: &str) -> String {
    source_code[node.byte_range()].to_string()
}

/// Extract parameter names from a parameters node
fn extract_parameters(node: Node, source_code: &str) -> Vec<String> {
    let mut params = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.is_named() {
            let param_text = node_text(child, source_code);
            // Simple extraction - could be enhanced per language
            params.push(param_text);
        }
    }

    params
}

/// Infer symbol kind from language and capture names
fn infer_kind_from_language(
    _language: Language,
    capture_names: &[&str],
    match_: &tree_sitter::QueryMatch,
) -> Option<SymbolKind> {
    // Look at the first capture to infer kind
    if let Some(capture) = match_.captures.first() {
        let name = &capture_names[capture.index as usize];

        if name.contains("function") {
            Some(SymbolKind::Function)
        } else if name.contains("method") {
            Some(SymbolKind::Method)
        } else if name.contains("class") {
            Some(SymbolKind::Class)
        } else if name.contains("struct") {
            Some(SymbolKind::Struct)
        } else if name.contains("enum") {
            Some(SymbolKind::Enum)
        } else if name.contains("interface") {
            Some(SymbolKind::Interface)
        } else if name.contains("trait") {
            Some(SymbolKind::Trait)
        } else if name.contains("variable") || name.contains("const") {
            Some(SymbolKind::Variable)
        } else {
            Some(SymbolKind::Unknown)
        }
    } else {
        None
    }
}

/// Get Tree-sitter query for a specific language
fn get_query_for_language(language: Language) -> &'static str {
    match language {
        Language::Python => include_str!("queries/python.scm"),
        Language::Rust => include_str!("queries/rust.scm"),
        Language::TypeScript => include_str!("queries/typescript.scm"),
        Language::JavaScript => include_str!("queries/javascript.scm"),
        Language::Go => include_str!("queries/go.scm"),
        Language::Java => include_str!("queries/java.scm"),
        Language::C => include_str!("queries/c.scm"),
        Language::Cpp => include_str!("queries/cpp.scm"),
        Language::Unknown => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_python() {
        let parser = AstParser::new();
        let source = r#"
def hello_world():
    """A simple function"""
    print("Hello, world!")

class MyClass:
    def my_method(self, arg1, arg2):
        pass
"#;

        let result = parser
            .parse_file("test.py", source, Language::Python)
            .unwrap();
        assert!(result.success);
        assert!(!result.symbols.is_empty());
    }

    #[test]
    fn test_parse_rust() {
        let parser = AstParser::new();
        let source = r#"
fn main() {
    println!("Hello, world!");
}

struct Point {
    x: i32,
    y: i32,
}

impl Point {
    fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}
"#;

        let result = parser
            .parse_file("test.rs", source, Language::Rust)
            .unwrap();
        assert!(result.success);
        assert!(!result.symbols.is_empty());
    }

    #[test]
    fn test_parse_typescript() {
        let parser = AstParser::new();
        let source = r#"
function greet(name: string): string {
    return `Hello, ${name}!`;
}

class Person {
    constructor(public name: string) {}

    greet(): string {
        return greet(this.name);
    }
}
"#;

        let result = parser
            .parse_file("test.ts", source, Language::TypeScript)
            .unwrap();
        assert!(result.success);
        assert!(!result.symbols.is_empty());
    }

    #[test]
    fn test_unsupported_language() {
        let parser = AstParser::new();
        let result = parser
            .parse_file("test.unknown", "code", Language::Unknown)
            .unwrap();
        assert!(!result.success);
        assert!(result.error.is_some());
    }
}
