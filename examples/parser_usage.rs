#![allow(dead_code)]

/// Example usage of the Context-MCP parser module
///
/// This file demonstrates how to use the Tree-sitter AST parser
/// and symbol extractor to analyze source code.
use context_mcp::parser::{Language, ParseResult, Symbol, SymbolExtractor, SymbolKind};

/// Example 1: Basic symbol extraction from a Rust file
fn example_basic_extraction() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    let rust_code = r#"
/// A simple function that greets
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

/// Point struct with coordinates
struct Point {
    x: i32,
    y: i32,
}

impl Point {
    fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    fn distance(&self) -> f64 {
        ((self.x.pow(2) + self.y.pow(2)) as f64).sqrt()
    }
}
"#;

    // Extract symbols (automatic language detection from filename)
    let result = extractor.extract_from_file("example.rs", rust_code)?;

    println!("Parsed {} successfully", result.file_path);
    println!("Language: {}", result.language);
    println!(
        "Found {} symbols in {}ms\n",
        result.symbols.len(),
        result.parse_time_ms
    );

    // Print all symbols
    for symbol in &result.symbols {
        println!(
            "{:12} {} at lines {}-{}",
            format!("{:?}", symbol.kind),
            symbol.name,
            symbol.range.start.line + 1,
            symbol.range.line_range().1
        );

        if let Some(ref docstring) = symbol.docstring {
            println!("  Doc: {}", docstring.trim());
        }
    }

    Ok(())
}

/// Example 2: Filtering symbols by kind
fn example_filter_symbols() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    let typescript_code = r#"
interface User {
    id: number;
    name: string;
    email: string;
}

class UserService {
    private users: User[] = [];

    addUser(user: User): void {
        this.users.push(user);
    }

    findUserById(id: number): User | undefined {
        return this.users.find(u => u.id === id);
    }

    getAllUsers(): User[] {
        return [...this.users];
    }
}

function createDefaultUser(): User {
    return {
        id: 0,
        name: "Guest",
        email: "guest@example.com"
    };
}

const DEFAULT_TIMEOUT = 5000;
"#;

    let result = extractor.extract_from_file("user-service.ts", typescript_code)?;

    // Filter only classes
    let classes = SymbolExtractor::filter_symbols_by_kind(&result.symbols, &[SymbolKind::Class]);
    println!("Classes found:");
    for class in classes {
        println!("  - {}", class.name);
    }

    // Filter only functions
    let functions = SymbolExtractor::filter_symbols_by_kind(
        &result.symbols,
        &[SymbolKind::Function, SymbolKind::Method],
    );
    println!("\nFunctions/Methods found:");
    for func in functions {
        println!("  - {} (kind: {:?})", func.name, func.kind);
        if let Some(ref params) = func.parameters {
            println!("    Parameters: {}", params.join(", "));
        }
    }

    Ok(())
}

/// Example 3: Searching for specific symbols
fn example_search_symbols() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    let python_code = r#"
def calculate_sum(numbers):
    """Calculate sum of numbers"""
    return sum(numbers)

def calculate_average(numbers):
    """Calculate average of numbers"""
    if not numbers:
        return 0
    return calculate_sum(numbers) / len(numbers)

def calculate_median(numbers):
    """Calculate median of numbers"""
    sorted_nums = sorted(numbers)
    n = len(sorted_nums)
    if n % 2 == 0:
        return (sorted_nums[n//2-1] + sorted_nums[n//2]) / 2
    return sorted_nums[n//2]

class Calculator:
    def add(self, a, b):
        return a + b

    def subtract(self, a, b):
        return a - b
"#;

    let result = extractor.extract_from_file("calculator.py", python_code)?;

    // Search for symbols containing "calculate"
    let calc_symbols = SymbolExtractor::find_symbols_by_name(&result.symbols, "calculate");
    println!("Symbols containing 'calculate':");
    for symbol in calc_symbols {
        println!("  - {}", symbol.name);
    }

    Ok(())
}

/// Example 4: Working with multiple languages
fn example_multi_language() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    let files = vec![
        (
            "main.rs",
            "fn main() { println!(\"Hello\"); }",
            Language::Rust,
        ),
        (
            "app.py",
            "def hello():\n    print('Hello')",
            Language::Python,
        ),
        (
            "app.js",
            "function hello() { console.log('Hello'); }",
            Language::JavaScript,
        ),
        (
            "Main.java",
            "class Main { public static void main(String[] args) {} }",
            Language::Java,
        ),
        (
            "main.go",
            "func main() { fmt.Println(\"Hello\") }",
            Language::Go,
        ),
    ];

    for (filename, code, expected_lang) in files {
        let result = extractor.extract_from_file(filename, code)?;
        assert_eq!(result.language, expected_lang);
        println!(
            "{:15} - {} ({} symbols)",
            filename,
            result.language,
            result.symbols.len()
        );
    }

    Ok(())
}

/// Example 5: Handling parse errors gracefully
fn example_error_handling() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    // Invalid code that might fail to parse
    let invalid_code = "this is not valid rust code!!!";

    match extractor.extract_from_file("invalid.rs", invalid_code) {
        Ok(result) => {
            if result.success {
                println!("Parsing succeeded with {} symbols", result.symbols.len());
            } else {
                println!("Parsing failed: {}", result.error.unwrap_or_default());
            }
        }
        Err(e) => {
            println!("Error during parsing: {}", e);
        }
    }

    Ok(())
}

/// Example 6: Extract symbols in a specific range
fn example_range_search() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    let code = r#"
// Lines 1-2

fn function_a() {  // Line 4
    println!("A");
}

fn function_b() {  // Line 8
    println!("B");
}

fn function_c() {  // Line 12
    println!("C");
}
"#;

    let result = extractor.extract_from_file("test.rs", code)?;

    // Find symbols between lines 8-15 (1-indexed for user display)
    let symbols_in_range = SymbolExtractor::find_symbols_in_range(
        &result.symbols,
        8,  // start_line
        15, // end_line
    );

    println!("Symbols in lines 8-15:");
    for symbol in symbols_in_range {
        println!(
            "  - {} at lines {}-{}",
            symbol.name,
            symbol.range.start.line + 1,
            symbol.range.end.line + 1
        );
    }

    Ok(())
}

/// Example 7: Check supported file types
fn example_file_type_detection() {
    let extractor = SymbolExtractor::new();

    let files = vec![
        "src/main.rs",
        "app.py",
        "index.ts",
        "script.js",
        "Main.java",
        "main.go",
        "program.c",
        "program.cpp",
        "sketch.ino", // Arduino
        "README.md",  // Not supported
        "data.json",  // Not supported
    ];

    println!("File support check:");
    for file in files {
        let supported = extractor.should_parse_file(file);
        println!(
            "  {} - {}",
            file,
            if supported {
                "✓ Supported"
            } else {
                "✗ Not supported"
            }
        );
    }

    println!("\nAll supported extensions:");
    for ext in SymbolExtractor::supported_extensions() {
        print!(".{} ", ext);
    }
    println!();
}

/// Example 8: Using explicit language override
fn example_explicit_language() -> context_mcp::Result<()> {
    let extractor = SymbolExtractor::new();

    // Code in a string without a file extension
    let code = "def hello(): print('Hello')";

    // Force Python parsing even though filename doesn't suggest it
    let result = extractor.extract_with_language("code_snippet.txt", code, Language::Python)?;

    println!(
        "Parsed as {}: {} symbols found",
        result.language,
        result.symbols.len()
    );

    Ok(())
}

// Main function to run all examples
#[cfg(not(test))]
fn main() -> context_mcp::Result<()> {
    println!("=== Example 1: Basic Extraction ===\n");
    example_basic_extraction()?;

    println!("\n=== Example 2: Filter Symbols ===\n");
    example_filter_symbols()?;

    println!("\n=== Example 3: Search Symbols ===\n");
    example_search_symbols()?;

    println!("\n=== Example 4: Multi-Language ===\n");
    example_multi_language()?;

    println!("\n=== Example 5: Error Handling ===\n");
    example_error_handling()?;

    println!("\n=== Example 6: Range Search ===\n");
    example_range_search()?;

    println!("\n=== Example 7: File Type Detection ===\n");
    example_file_type_detection();

    println!("\n=== Example 8: Explicit Language ===\n");
    example_explicit_language()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_examples() {
        assert!(example_basic_extraction().is_ok());
        assert!(example_filter_symbols().is_ok());
        assert!(example_search_symbols().is_ok());
        assert!(example_multi_language().is_ok());
        assert!(example_error_handling().is_ok());
        assert!(example_range_search().is_ok());
        assert!(example_explicit_language().is_ok());
    }
}
