# Parser Module Test Plan

## Overview

This document outlines the testing strategy for the Tree-sitter parser module implementation (Task 10.3).

## Test Coverage

### Unit Tests Included

Each module includes comprehensive unit tests:

#### 1. types.rs Tests
- Language detection from file extensions
  - Standard extensions (.ts, .js, .py, .rs, .go, .java, .c, .cpp)
  - Arduino support (.ino as C)
  - Unknown extensions
- Language parsing from strings
  - Case-insensitive matching
  - Multiple aliases (e.g., "typescript", "ts")
- Range operations
  - Range containment checking
  - Boundary conditions
  - Line range conversion
- Symbol qualified name generation
  - Scope handling
  - Parent tracking
  - Namespace resolution

#### 2. ast_parser.rs Tests
- Basic parsing for multiple languages
  - Python function and class parsing
  - Rust struct and impl block parsing
  - TypeScript function and class parsing
- Error handling
  - Unsupported language detection
  - Parse failure handling
- Symbol extraction
  - Function definitions with parameters
  - Class/struct definitions
  - Method definitions

#### 3. symbol_extractor.rs Tests
- Language detection from file paths
  - Extension-based detection
  - Arduino file support
- File filtering
  - should_parse_file() validation
  - Supported vs unsupported files
- Supported extensions list
  - All 8+ supported languages
  - Arduino inclusion
- Symbol extraction from real code
  - Python code parsing
  - Explicit language override

#### 4. mod.rs Tests
- Module exports verification
  - All types accessible
  - Proper re-exports
- Language support validation
  - All 8 languages detectable
  - Correct mapping

## Running Tests

### Prerequisites
System dependencies must be installed (see BUILD_INSTRUCTIONS.md):
```bash
# Ubuntu/Debian
sudo apt-get install pkg-config libssl-dev

# Fedora/RHEL
sudo yum install pkg-config openssl-devel

# macOS
brew install pkg-config openssl
```

### Test Commands

```bash
# Run all parser tests
cargo test --lib parser

# Run with output
cargo test --lib parser -- --nocapture

# Run specific test
cargo test --lib parser::types::tests::test_language_from_extension

# Run with coverage (requires cargo-tarpaulin)
cargo tarpaulin --lib --packages context-mcp -- parser
```

## Manual Testing Scenarios

### Scenario 1: Parse Real Project Files

Test the parser against actual project files:

```bash
# Example using the parser_usage.rs examples
cargo run --example parser_usage
```

Expected output:
- Successful parsing of multi-language code samples
- Symbol extraction statistics
- No panics or crashes

### Scenario 2: Large File Performance

Test with large source files (>1000 lines):

```rust
let extractor = SymbolExtractor::new();
let large_code = std::fs::read_to_string("large_file.rs")?;
let start = std::time::Instant::now();
let result = extractor.extract_from_file("large_file.rs", &large_code)?;
println!("Parsed {} lines in {:?}", large_code.lines().count(), start.elapsed());
```

Expected:
- Parse time < 1 second for most files
- No memory leaks
- All symbols extracted correctly

### Scenario 3: Malformed Code Handling

Test with intentionally broken syntax:

```rust
let extractor = SymbolExtractor::new();
let bad_code = "fn incomplete( { // missing closing braces";
let result = extractor.extract_from_file("bad.rs", bad_code)?;
assert!(!result.success || result.symbols.is_empty());
```

Expected:
- No panics
- Graceful error handling
- Error message in ParseResult

### Scenario 4: All Language Parsers

Test each supported language with representative code:

**Python:**
```python
class MyClass:
    def method(self, arg):
        pass

def function():
    pass
```

**TypeScript:**
```typescript
interface MyInterface { }
class MyClass { }
function myFunction() { }
```

**JavaScript:**
```javascript
class MyClass { }
function myFunction() { }
const arrow = () => { };
```

**Go:**
```go
type MyStruct struct { }
func myFunction() { }
func (m *MyStruct) method() { }
```

**Rust:**
```rust
struct MyStruct { }
impl MyStruct { }
fn my_function() { }
```

**Java:**
```java
class MyClass { }
interface MyInterface { }
public void method() { }
```

**C:**
```c
struct MyStruct { };
void my_function() { }
```

**C++:**
```cpp
class MyClass { };
namespace MyNamespace { }
void my_function() { }
```

Expected for all:
- Successful parsing
- Symbols extracted correctly
- Proper symbol kinds assigned

### Scenario 5: Arduino Support

Test Arduino-specific files:

```c
// sketch.ino
void setup() {
    Serial.begin(9600);
}

void loop() {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(1000);
}
```

Expected:
- Language detected as C
- setup() and loop() functions extracted
- Special Arduino function marking (if implemented)

## Integration Testing

### Test with IndexingService (Future)

Once IndexingService is implemented:

```rust
let indexing_service = IndexingService::new();
let result = indexing_service.index_file("test.rs", source_code)?;
assert!(result.symbols_indexed > 0);
```

### Test with Search Engine (Future)

```rust
let search_engine = SearchEngine::new();
search_engine.index_symbols(&symbols)?;
let results = search_engine.search("function name")?;
assert!(!results.is_empty());
```

## Performance Benchmarks

### Benchmark Suite (using Criterion)

Located in future `benches/parser_bench.rs`:

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_parse_rust(c: &mut Criterion) {
    let extractor = SymbolExtractor::new();
    let code = include_str!("../src/parser/ast_parser.rs");

    c.bench_function("parse_rust_400_lines", |b| {
        b.iter(|| {
            extractor.extract_from_file("test.rs", black_box(code))
        })
    });
}

criterion_group!(benches, bench_parse_rust);
criterion_main!(benches);
```

Run benchmarks:
```bash
cargo bench --bench parser_bench
```

Expected performance targets:
- Small files (<100 lines): <10ms
- Medium files (100-1000 lines): <100ms
- Large files (1000-10000 lines): <1000ms
- Very large files (>10000 lines): <5000ms

## Test Data

### Sample Code Files

Create `tests/fixtures/` directory with:
- `sample.py` - Python test file
- `sample.rs` - Rust test file
- `sample.ts` - TypeScript test file
- `sample.js` - JavaScript test file
- `sample.go` - Go test file
- `sample.java` - Java test file
- `sample.c` - C test file
- `sample.cpp` - C++ test file
- `sample.ino` - Arduino test file

### Expected Results

Maintain `tests/expected/` with JSON files containing expected symbols for each sample.

## Edge Cases to Test

1. **Empty files** - Should parse successfully with 0 symbols
2. **Comment-only files** - Should extract comments as symbols
3. **Very long identifiers** - 1000+ character names
4. **Deep nesting** - 10+ levels of class/namespace nesting
5. **Unicode in code** - Non-ASCII characters in identifiers
6. **Mixed line endings** - CRLF, LF, CR
7. **Files without extension** - Explicit language override required
8. **Binary files** - Should fail gracefully
9. **Extremely large files** - >100MB files
10. **Concurrent parsing** - Multiple threads parsing simultaneously

## Regression Testing

Maintain a regression test suite for:
- Previously found bugs
- Edge cases that caused issues
- Performance regressions

## Continuous Integration

### CI Pipeline (GitHub Actions)

```yaml
name: Parser Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions-rs/toolchain@v1
      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y pkg-config libssl-dev
      - name: Run parser tests
        run: cargo test --lib parser
      - name: Run parser benchmarks
        run: cargo bench --bench parser_bench --no-run
```

## Success Criteria

- [ ] All unit tests pass
- [ ] All 8 languages parse correctly
- [ ] Error handling works for malformed code
- [ ] Performance benchmarks meet targets
- [ ] Memory usage is reasonable (<100MB for typical files)
- [ ] No memory leaks detected
- [ ] Code coverage >80% for parser module
- [ ] Integration tests with IndexingService pass
- [ ] Arduino support verified

## Known Limitations

Document any current limitations:
1. Complex template/generic syntax may not be fully parsed
2. Macro expansions are not evaluated
3. Scope tracking is basic (single-level parent)
4. Some language-specific constructs may be missed
5. Performance not optimized for files >10MB

## Future Enhancements

Testing for future features:
- Incremental parsing (reparse only changed sections)
- Syntax error recovery
- More detailed scope analysis
- Cross-reference tracking
- Symbol usage counting
- Documentation extraction
