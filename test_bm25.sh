#!/bin/bash
# Quick validation script for BM25 implementation

echo "=== BM25 Implementation Validation ==="
echo ""

echo "1. Checking module structure..."
if [ -d "src/search" ]; then
    echo "   ✓ src/search/ directory exists"
else
    echo "   ✗ src/search/ directory missing"
    exit 1
fi

echo ""
echo "2. Checking required files..."
FILES=(
    "src/search/mod.rs"
    "src/search/types.rs"
    "src/search/tokenizer.rs"
    "src/search/bm25_engine.rs"
    "examples/bm25_usage.rs"
    "BM25_IMPLEMENTATION.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✓ $file exists ($(wc -l < "$file") lines)"
    else
        echo "   ✗ $file missing"
        exit 1
    fi
done

echo ""
echo "3. Checking lib.rs integration..."
if grep -q "pub mod search;" src/lib.rs; then
    echo "   ✓ search module exported in lib.rs"
else
    echo "   ✗ search module not exported in lib.rs"
    exit 1
fi

echo ""
echo "4. Checking dependencies in Cargo.toml..."
if grep -q "rusqlite" Cargo.toml; then
    echo "   ✓ rusqlite dependency present"
else
    echo "   ✗ rusqlite dependency missing"
    exit 1
fi

if grep -q "regex" Cargo.toml; then
    echo "   ✓ regex dependency present"
else
    echo "   ✗ regex dependency missing"
    exit 1
fi

echo ""
echo "5. Checking key implementations..."

# Check BM25Engine struct
if grep -q "pub struct BM25Engine" src/search/bm25_engine.rs; then
    echo "   ✓ BM25Engine struct defined"
else
    echo "   ✗ BM25Engine struct missing"
fi

# Check required methods
METHODS=(
    "pub fn new"
    "pub fn index_document"
    "pub fn search"
    "pub fn remove_document"
    "pub fn clear"
    "pub fn document_count"
)

for method in "${METHODS[@]}"; do
    if grep -q "$method" src/search/bm25_engine.rs; then
        echo "   ✓ Method: $method"
    else
        echo "   ✗ Method missing: $method"
    fi
done

echo ""
echo "6. Checking test coverage..."
if grep -q "#\[cfg(test)\]" src/search/types.rs; then
    echo "   ✓ types.rs has tests"
fi

if grep -q "#\[cfg(test)\]" src/search/tokenizer.rs; then
    echo "   ✓ tokenizer.rs has tests"
fi

if grep -q "#\[cfg(test)\]" src/search/bm25_engine.rs; then
    echo "   ✓ bm25_engine.rs has tests"
fi

echo ""
echo "7. Code statistics..."
echo "   Total lines in search module:"
find src/search -name "*.rs" -exec wc -l {} + | tail -1
echo ""
echo "   Documentation:"
wc -l BM25_IMPLEMENTATION.md

echo ""
echo "=== Validation Complete ==="
echo ""
echo "Note: Full compilation requires OpenSSL dependencies to be installed."
echo "To install: sudo apt install pkg-config libssl-dev (Ubuntu/Debian)"
echo "           sudo yum install pkgconfig openssl-devel (Fedora/RHEL)"
