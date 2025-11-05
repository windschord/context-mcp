#!/usr/bin/env node

/**
 * LSP-MCP CLI Entry Point
 *
 * This file is the executable entry point for running lsp-mcp via npx or globally installed package.
 */

import { main, version } from '../dist/index.js';

// Handle command-line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
LSP-MCP v${version}
Model Context Protocol plugin for Claude Code with Tree-sitter AST parsing

Usage:
  npx lsp-mcp              Start the MCP server (for Claude Code integration)
  npx lsp-mcp --help       Show this help message
  npx lsp-mcp --version    Show version information

Environment Variables:
  LOG_LEVEL                Set log level (DEBUG, INFO, WARN, ERROR)
  LSP_MCP_MODE            Set mode (local or cloud)

For more information, visit: https://github.com/your-org/lsp-mcp
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(version);
  process.exit(0);
}

// Start the MCP server
main();
