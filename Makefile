# Makefile for Context-MCP Rust Implementation
# Provides convenient commands for building, testing, and running the project

.PHONY: help build check test test-all test-parser test-embedding test-milvus test-bm25 test-search \
        clean clean-all run-example install-deps fmt lint doc \
        setup-milvus download-model convert-model

# Default target
.DEFAULT_GOAL := help

##@ General

help: ## Display this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Build

build: ## Build the project in debug mode
	@echo "Building project..."
	cargo build

build-release: ## Build the project in release mode
	cargo build --release

check: ## Run cargo check to verify code compiles
	@echo "Checking code..."
	cargo check

fmt: ## Format code with rustfmt
	@echo "Formatting code..."
	cargo fmt

fmt-check: ## Check code formatting without modifying files
	@echo "Checking code formatting..."
	cargo fmt -- --check

lint: ## Run clippy linter
	@echo "Running clippy..."
	cargo clippy -- -D warnings

##@ Testing

test: ## Run all tests (unit + integration)
	@echo "Running all tests..."
	cargo test

test-all: test-parser test-embedding test-milvus test-bm25 test-search ## Run all module-specific tests

test-parser: ## Run parser module tests
	@echo "Running parser tests..."
	cargo test --lib parser

test-embedding: ## Run embedding module tests
	@echo "Running embedding tests..."
	cargo test --lib embedding

test-milvus: ## Run Milvus storage tests (requires running Milvus instance)
	@echo "Running Milvus tests..."
	cargo test --lib storage::milvus_client -- --ignored

test-bm25: ## Run BM25 search engine tests
	@echo "Running BM25 tests..."
	cargo test --lib search

test-search: test-bm25 ## Alias for BM25 tests

test-verbose: ## Run tests with verbose output
	@echo "Running tests (verbose)..."
	cargo test -- --nocapture

test-coverage: ## Generate test coverage report (requires cargo-tarpaulin)
	@echo "Generating coverage report..."
	cargo tarpaulin --out Html --output-dir coverage

##@ Validation Scripts

validate-parser: ## Validate parser implementation
	@echo "Validating parser implementation..."
	@if [ -f test_parser.sh ]; then bash test_parser.sh; else echo "test_parser.sh not found"; fi

validate-bm25: ## Validate BM25 implementation
	@echo "Validating BM25 implementation..."
	@if [ -f test_bm25.sh ]; then bash test_bm25.sh; else echo "test_bm25.sh not found"; fi

validate-all: validate-parser validate-bm25 ## Run all validation scripts

##@ Examples

run-example-parser: ## Run parser usage example
	@echo "Running parser example..."
	cargo run --example parser_usage

run-example-embedding: ## Run embedding usage example (requires ONNX model)
	@echo "Running embedding example..."
	cargo run --example embedding_usage

run-example-milvus: ## Run Milvus usage example (requires running Milvus)
	@echo "Running Milvus example..."
	cargo run --example milvus_usage

run-example-bm25: ## Run BM25 usage example
	@echo "Running BM25 example..."
	cargo run --example bm25_usage

##@ Setup and Dependencies

install-deps: ## Install system dependencies (Ubuntu/Debian)
	@echo "Installing system dependencies..."
	@echo "This requires sudo privileges..."
	sudo apt-get update
	sudo apt-get install -y pkg-config libssl-dev protobuf-compiler build-essential

install-deps-fedora: ## Install system dependencies (Fedora/RHEL)
	@echo "Installing system dependencies..."
	@echo "This requires sudo privileges..."
	sudo yum install -y pkgconfig openssl-devel protobuf-compiler gcc gcc-c++ make

setup-milvus: ## Start Milvus using Docker Compose
	@echo "Starting Milvus..."
	docker-compose up -d
	@echo "Waiting for Milvus to be ready..."
	@sleep 10
	@echo "Milvus is ready at localhost:19530"

stop-milvus: ## Stop Milvus Docker containers
	@echo "Stopping Milvus..."
	docker-compose down

download-model: ## Download ONNX embedding model
	@echo "Downloading ONNX model..."
	@if [ -f scripts/convert_to_onnx.py ]; then \
		python3 scripts/convert_to_onnx.py; \
	else \
		echo "scripts/convert_to_onnx.py not found"; \
		echo "Please create the model download script"; \
	fi

convert-model: download-model ## Alias for download-model

##@ Documentation

doc: ## Generate and open Rust documentation
	@echo "Generating documentation..."
	cargo doc --open --no-deps

doc-private: ## Generate documentation including private items
	@echo "Generating documentation (with private items)..."
	cargo doc --open --no-deps --document-private-items

##@ Cleanup

clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	cargo clean

clean-db: ## Clean database files (*.db)
	@echo "Cleaning database files..."
	find . -type f -name "*.db" -delete
	find . -type f -name "*.db-shm" -delete
	find . -type f -name "*.db-wal" -delete

clean-models: ## Clean downloaded models
	@echo "Cleaning model files..."
	rm -rf models/

clean-all: clean clean-db ## Clean everything (build artifacts + databases)

##@ Development

dev: ## Run development checks (fmt + lint + check + test)
	@echo "Running development checks..."
	@make fmt
	@make lint
	@make check
	@make test

ci: ## Run CI checks (fmt-check + lint + check + test)
	@echo "Running CI checks..."
	@make fmt-check
	@make lint
	@make check
	@make test

watch: ## Watch for changes and run tests
	@echo "Watching for changes..."
	cargo watch -x test

##@ Git

git-status: ## Show git status
	@git status

git-log: ## Show recent git commits
	@git log --oneline -10

git-diff: ## Show git diff
	@git diff

##@ Information

info: ## Display project information
	@echo "Project: Context-MCP"
	@echo "Language: Rust"
	@echo "Version: $$(cargo pkgid | cut -d'#' -f2)"
	@echo ""
	@echo "Cargo version: $$(cargo --version)"
	@echo "Rustc version: $$(rustc --version)"
	@echo ""
	@echo "Module status:"
	@echo "  - Parser: ✓ Implemented (Task 10.3)"
	@echo "  - Embedding: ✓ Implemented (Task 10.4)"
	@echo "  - Storage (Milvus): ✓ Implemented (Task 10.5)"
	@echo "  - Search (BM25): ✓ Implemented (Task 10.6)"
	@echo "  - Hybrid Search: ○ TODO (Task 10.7)"
	@echo "  - Indexing Service: ○ TODO (Task 10.8)"
	@echo "  - MCP Tools: ○ TODO (Task 10.9)"
