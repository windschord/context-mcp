use serde::{Deserialize, Serialize};
use std::fmt;

/// Supported programming languages for AST parsing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    TypeScript,
    JavaScript,
    Python,
    Go,
    Rust,
    Java,
    C,
    Cpp,
    Unknown,
}

impl Language {
    /// Detect language from file extension
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "ts" | "tsx" => Language::TypeScript,
            "js" | "jsx" | "mjs" | "cjs" => Language::JavaScript,
            "py" | "pyw" => Language::Python,
            "go" => Language::Go,
            "rs" => Language::Rust,
            "java" => Language::Java,
            "c" | "h" => Language::C,
            "cpp" | "cc" | "cxx" | "hpp" | "hxx" | "c++" => Language::Cpp,
            "ino" => Language::C, // Arduino uses C/C++
            _ => Language::Unknown,
        }
    }

    /// Get file extensions for this language
    pub fn extensions(&self) -> &'static [&'static str] {
        match self {
            Language::TypeScript => &["ts", "tsx"],
            Language::JavaScript => &["js", "jsx", "mjs", "cjs"],
            Language::Python => &["py", "pyw"],
            Language::Go => &["go"],
            Language::Rust => &["rs"],
            Language::Java => &["java"],
            Language::C => &["c", "h", "ino"],
            Language::Cpp => &["cpp", "cc", "cxx", "hpp", "hxx", "c++"],
            Language::Unknown => &[],
        }
    }

    /// Get language name as string
    pub fn as_str(&self) -> &'static str {
        match self {
            Language::TypeScript => "typescript",
            Language::JavaScript => "javascript",
            Language::Python => "python",
            Language::Go => "go",
            Language::Rust => "rust",
            Language::Java => "java",
            Language::C => "c",
            Language::Cpp => "cpp",
            Language::Unknown => "unknown",
        }
    }

    /// Parse language from string
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "typescript" | "ts" => Language::TypeScript,
            "javascript" | "js" => Language::JavaScript,
            "python" | "py" => Language::Python,
            "go" | "golang" => Language::Go,
            "rust" | "rs" => Language::Rust,
            "java" => Language::Java,
            "c" => Language::C,
            "cpp" | "c++" => Language::Cpp,
            _ => Language::Unknown,
        }
    }
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Kind of symbol extracted from AST
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolKind {
    Function,
    Method,
    Class,
    Interface,
    Struct,
    Enum,
    Trait,
    Variable,
    Constant,
    Module,
    Namespace,
    TypeAlias,
    Import,
    Unknown,
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SymbolKind::Function => "function",
            SymbolKind::Method => "method",
            SymbolKind::Class => "class",
            SymbolKind::Interface => "interface",
            SymbolKind::Struct => "struct",
            SymbolKind::Enum => "enum",
            SymbolKind::Trait => "trait",
            SymbolKind::Variable => "variable",
            SymbolKind::Constant => "constant",
            SymbolKind::Module => "module",
            SymbolKind::Namespace => "namespace",
            SymbolKind::TypeAlias => "type_alias",
            SymbolKind::Import => "import",
            SymbolKind::Unknown => "unknown",
        }
    }
}

impl fmt::Display for SymbolKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Location in source code (line and column)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Position {
    /// Line number (0-indexed)
    pub line: usize,
    /// Column number (0-indexed)
    pub column: usize,
}

impl Position {
    pub fn new(line: usize, column: usize) -> Self {
        Self { line, column }
    }
}

/// Range in source code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

impl Range {
    pub fn new(start: Position, end: Position) -> Self {
        Self { start, end }
    }

    /// Get line range as tuple (start_line, end_line) for 1-indexed display
    pub fn line_range(&self) -> (usize, usize) {
        (self.start.line + 1, self.end.line + 1)
    }

    /// Check if range contains a position
    pub fn contains(&self, pos: Position) -> bool {
        if pos.line < self.start.line || pos.line > self.end.line {
            return false;
        }
        if pos.line == self.start.line && pos.column < self.start.column {
            return false;
        }
        if pos.line == self.end.line && pos.column > self.end.column {
            return false;
        }
        true
    }
}

/// Symbol extracted from AST
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    /// Symbol name
    pub name: String,

    /// Symbol kind
    pub kind: SymbolKind,

    /// Location in source code
    pub range: Range,

    /// Full text content of the symbol
    pub text: String,

    /// Docstring or comment associated with the symbol
    pub docstring: Option<String>,

    /// Parent symbol (e.g., class name for a method)
    pub parent: Option<String>,

    /// Scope information (e.g., namespace, module)
    pub scope: Vec<String>,

    /// Function/method parameters (if applicable)
    pub parameters: Option<Vec<String>>,

    /// Return type (if available)
    pub return_type: Option<String>,

    /// Additional metadata as JSON
    pub metadata: Option<serde_json::Value>,
}

impl Symbol {
    /// Create a new symbol
    pub fn new(name: String, kind: SymbolKind, range: Range, text: String) -> Self {
        Self {
            name,
            kind,
            range,
            text,
            docstring: None,
            parent: None,
            scope: Vec::new(),
            parameters: None,
            return_type: None,
            metadata: None,
        }
    }

    /// Builder pattern methods
    pub fn with_docstring(mut self, docstring: String) -> Self {
        self.docstring = Some(docstring);
        self
    }

    pub fn with_parent(mut self, parent: String) -> Self {
        self.parent = Some(parent);
        self
    }

    pub fn with_scope(mut self, scope: Vec<String>) -> Self {
        self.scope = scope;
        self
    }

    pub fn with_parameters(mut self, parameters: Vec<String>) -> Self {
        self.parameters = Some(parameters);
        self
    }

    pub fn with_return_type(mut self, return_type: String) -> Self {
        self.return_type = Some(return_type);
        self
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Get fully qualified name (including parent and scope)
    pub fn qualified_name(&self) -> String {
        let mut parts = self.scope.clone();
        if let Some(ref parent) = self.parent {
            parts.push(parent.clone());
        }
        parts.push(self.name.clone());
        parts.join("::")
    }
}

/// Result of parsing a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    /// Language detected
    pub language: Language,

    /// File path
    pub file_path: String,

    /// Symbols extracted
    pub symbols: Vec<Symbol>,

    /// Whether parsing was successful
    pub success: bool,

    /// Error message if parsing failed
    pub error: Option<String>,

    /// Parse time in milliseconds
    pub parse_time_ms: u64,
}

impl ParseResult {
    pub fn success(
        language: Language,
        file_path: String,
        symbols: Vec<Symbol>,
        parse_time_ms: u64,
    ) -> Self {
        Self {
            language,
            file_path,
            symbols,
            success: true,
            error: None,
            parse_time_ms,
        }
    }

    pub fn error(language: Language, file_path: String, error: String) -> Self {
        Self {
            language,
            file_path,
            symbols: Vec::new(),
            success: false,
            error: Some(error),
            parse_time_ms: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_from_extension() {
        assert_eq!(Language::from_extension("ts"), Language::TypeScript);
        assert_eq!(Language::from_extension("js"), Language::JavaScript);
        assert_eq!(Language::from_extension("py"), Language::Python);
        assert_eq!(Language::from_extension("rs"), Language::Rust);
        assert_eq!(Language::from_extension("go"), Language::Go);
        assert_eq!(Language::from_extension("java"), Language::Java);
        assert_eq!(Language::from_extension("c"), Language::C);
        assert_eq!(Language::from_extension("cpp"), Language::Cpp);
        assert_eq!(Language::from_extension("ino"), Language::C); // Arduino
        assert_eq!(Language::from_extension("unknown"), Language::Unknown);
    }

    #[test]
    fn test_language_from_str() {
        assert_eq!(Language::parse("typescript"), Language::TypeScript);
        assert_eq!(Language::parse("JavaScript"), Language::JavaScript);
        assert_eq!(Language::parse("PYTHON"), Language::Python);
        assert_eq!(Language::parse("rust"), Language::Rust);
    }

    #[test]
    fn test_range_contains() {
        let range = Range::new(Position::new(5, 10), Position::new(10, 20));

        assert!(range.contains(Position::new(7, 15)));
        assert!(range.contains(Position::new(5, 10))); // Start boundary
        assert!(range.contains(Position::new(10, 20))); // End boundary
        assert!(!range.contains(Position::new(4, 15))); // Before start line
        assert!(!range.contains(Position::new(11, 15))); // After end line
        assert!(!range.contains(Position::new(5, 5))); // Before start column
        assert!(!range.contains(Position::new(10, 25))); // After end column
    }

    #[test]
    fn test_symbol_qualified_name() {
        let symbol = Symbol::new(
            "my_method".to_string(),
            SymbolKind::Method,
            Range::new(Position::new(0, 0), Position::new(5, 0)),
            "fn my_method() {}".to_string(),
        )
        .with_scope(vec!["my_module".to_string()])
        .with_parent("MyClass".to_string());

        assert_eq!(symbol.qualified_name(), "my_module::MyClass::my_method");
    }
}
