# Build Instructions for Context-MCP

## System Requirements

### Prerequisites

The project requires the following system dependencies to build:

#### 1. Rust Toolchain
- Rust 1.75 or higher
- Cargo (comes with Rust)

Install via rustup:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 2. C/C++ Compiler
Required for building Tree-sitter parsers and native dependencies.

- **Linux**: gcc/g++ (usually pre-installed)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: MSVC or MinGW

Verify:
```bash
gcc --version
g++ --version
```

#### 3. pkg-config
Required by OpenSSL dependencies (milvus, reqwest).

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install pkg-config
```

**Fedora/RHEL:**
```bash
sudo yum install pkg-config
```

**macOS:**
```bash
brew install pkg-config
```

**Windows:**
- Download from https://www.freedesktop.org/wiki/Software/pkg-config/
- Or use `vcpkg install pkgconf`

#### 4. OpenSSL Development Libraries
Required by milvus and reqwest (optional feature) crates.

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install libssl-dev
```

**Fedora/RHEL:**
```bash
sudo yum install openssl-devel
```

**macOS:**
```bash
brew install openssl
```

**Windows:**
- OpenSSL is typically included with Rust toolchain
- Or install via vcpkg: `vcpkg install openssl`

## Building the Project

### Full Build

Once all prerequisites are installed:

```bash
# Clone the repository
git clone https://github.com/windschord/context-mcp.git
cd context-mcp

# Build in debug mode
cargo build

# Build in release mode (optimized)
cargo build --release
```

### Build without Optional Features

To build without cloud features (reduces dependencies):

```bash
cargo build --no-default-features
```

### Building Only the Library

To build just the library without the binary:

```bash
cargo build --lib
```

## Running Tests

```bash
# Run all tests
cargo test

# Run only library tests
cargo test --lib

# Run tests for specific module
cargo test --lib parser

# Run tests with output
cargo test -- --nocapture
```

## Development

### Type Checking

```bash
cargo check
```

### Formatting

```bash
cargo fmt
```

### Linting

```bash
cargo clippy
```

## Troubleshooting

### Error: "Could not find openssl via pkg-config"

**Solution**: Install pkg-config and libssl-dev:
```bash
# Ubuntu/Debian
sudo apt-get install pkg-config libssl-dev

# Fedora/RHEL
sudo yum install pkg-config openssl-devel

# macOS
brew install pkg-config openssl
```

### Error: "linker 'cc' not found"

**Solution**: Install a C compiler:
```bash
# Ubuntu/Debian
sudo apt-get install build-essential

# Fedora/RHEL
sudo yum groupinstall "Development Tools"

# macOS
xcode-select --install
```

### Error: Tree-sitter compilation issues

Tree-sitter parsers require a C compiler. Ensure gcc/g++ or clang is installed and accessible in PATH.

### macOS: OpenSSL not found

If Homebrew OpenSSL is installed but not found:
```bash
export OPENSSL_DIR=/usr/local/opt/openssl
# Or for M1/M2 Macs:
export OPENSSL_DIR=/opt/homebrew/opt/openssl
```

## Platform-Specific Notes

### Linux
- Most distributions include gcc/g++ by default
- Use your package manager to install dependencies

### macOS
- Xcode Command Line Tools provide the C compiler
- Use Homebrew for pkg-config and OpenSSL
- M1/M2 Macs may need OPENSSL_DIR set manually

### Windows
- Requires MSVC toolchain or MinGW
- OpenSSL usually works out of the box with Rust
- Consider using WSL2 for easier dependency management

## Docker Build (Alternative)

If you prefer Docker (avoids system dependency issues):

```bash
# Build Docker image
docker build -t context-mcp .

# Run tests in Docker
docker run --rm context-mcp cargo test

# Build release in Docker
docker run --rm -v $(pwd)/target:/app/target context-mcp cargo build --release
```

## Minimal Build Environment

For CI/CD or minimal environments, install:
```bash
# Ubuntu/Debian minimal
apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    git

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# Build
cargo build --release
```

## Next Steps

After successful build:
1. Run tests: `cargo test`
2. Try the MCP server: `cargo run`
3. Read PARSER_IMPLEMENTATION.md for parser module details
4. Check docs/ for architecture documentation
