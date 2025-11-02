/**
 * LSP-MCP: Model Context Protocol plugin for Claude Code
 * with Tree-sitter AST parsing and vector database
 */

import { MCPServer } from './server/mcp-server.js';
import { logger, LogLevel } from './utils/logger.js';

export const version = '0.1.0';

/**
 * メインエントリーポイント
 */
export async function main(): Promise<void> {
  // 環境変数からログレベルを取得
  const logLevelEnv = process.env['LOG_LEVEL']?.toUpperCase() || 'INFO';
  const logLevel = LogLevel[logLevelEnv as keyof typeof LogLevel] || LogLevel.INFO;
  logger.setLevel(logLevel);

  logger.info('LSP-MCP server starting...', { version });

  try {
    const server = new MCPServer('lsp-mcp', version);
    await server.run();

    // シグナルハンドラーを設定
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await server.shutdown();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in main', error);
    process.exit(1);
  });
}

// エクスポート
export { MCPServer } from './server/mcp-server.js';
export { Logger, LogLevel } from './utils/logger.js';
export * from './utils/errors.js';
