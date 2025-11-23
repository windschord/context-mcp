# @context-mcp/server

Context-MCP: Model Context Protocol plugin for Claude Code with Tree-sitter AST parsing and vector database.

## Features

- Tree-sitter based AST parsing for multiple programming languages
- Vector database integration (Milvus) for semantic code search
- Hybrid search combining BM25 and vector similarity
- Privacy-first design with local-first execution
- Support for TypeScript/JavaScript, Python, Go, Rust, Java, C/C++, and Arduino

## Quick Start

### Using npx (Recommended)

The easiest way to use context-mcp is with npx:

```bash
npx @context-mcp/server
```

This will automatically download and run the appropriate binary for your platform.

### Global Installation

You can also install it globally:

```bash
npm install -g @context-mcp/server
context-mcp --help
```

### Using with Claude Code

Add to your Claude Code configuration:

**Linux/macOS (`~/.config/claude/claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": ["@context-mcp/server"]
    }
  }
}
```

**Windows (`%APPDATA%\Claude\claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx.cmd",
      "args": ["@context-mcp/server"]
    }
  }
}
```

## Configuration

Create a `.context-mcp.json` file in your project root:

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530",
      "standalone": true,
      "dataPath": "./volumes"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "local": true
  },
  "privacy": {
    "blockExternalCalls": true
  }
}
```

## Supported Platforms

- Linux x64
- Linux ARM64
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)
- Windows x64

## Documentation

For detailed documentation, see:
- [Installation Guide](https://github.com/windschord/context-mcp/blob/main/docs/INSTALL_NPM.md)
- [Configuration](https://github.com/windschord/context-mcp/blob/main/docs/CONFIGURATION.md)
- [MCP Tools API](https://github.com/windschord/context-mcp/blob/main/docs/MCP_TOOLS_API.md)

## License

MIT

## Contributing

Contributions are welcome! Please see our [Contributing Guide](https://github.com/windschord/context-mcp/blob/main/CONTRIBUTING.md).
