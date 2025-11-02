/**
 * MCP Server
 * Model Context Protocol サーバーの実装
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  InitializeRequestSchema,
  InitializeResult,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { toMCPError } from '../utils/errors.js';

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private name: string;
  private version: string;
  private isInitialized = false;
  private isShutdown = false;

  constructor(name = 'lsp-mcp', version = '0.1.0') {
    this.name = name;
    this.version = version;

    // MCPサーバーインスタンスを作成
    this.server = new Server(
      {
        name: this.name,
        version: this.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // エラーハンドラーを設定
    this.server.onerror = (error: Error) => {
      logger.error('MCP Server error', toMCPError(error));
    };

    // initialize ハンドラーを設定
    this.setupInitializeHandler();
  }

  /**
   * initialize ハンドラーをセットアップ
   */
  private setupInitializeHandler(): void {
    this.server.setRequestHandler(
      InitializeRequestSchema,
      async (): Promise<InitializeResult> => {
        logger.info('MCP Server initializing', {
          name: this.name,
          version: this.version,
        });

        this.isInitialized = true;

        return {
          serverInfo: {
            name: this.name,
            version: this.version,
          },
          capabilities: {
            tools: {},
          },
          protocolVersion: '2024-11-05',
        };
      }
    );
  }

  /**
   * サーバーを初期化
   */
  async initialize(): Promise<InitializeResult> {
    if (!this.server) {
      throw new Error('Server instance not available');
    }

    logger.info('MCP Server initialize called');

    return {
      serverInfo: {
        name: this.name,
        version: this.version,
      },
      capabilities: {
        tools: {},
      },
      protocolVersion: '2024-11-05',
    };
  }

  /**
   * サーバーをシャットダウン
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      logger.debug('Server already shutdown, skipping');
      return;
    }

    logger.info('MCP Server shutting down');

    try {
      // トランスポートをクローズ
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }

      // サーバーをクローズ
      if (this.server) {
        await this.server.close();
      }

      this.isShutdown = true;
      logger.info('MCP Server shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', toMCPError(error));
      throw error;
    }
  }

  /**
   * サーバーを実行
   */
  async run(): Promise<void> {
    try {
      logger.info('Starting MCP Server', {
        name: this.name,
        version: this.version,
      });

      // Stdio トランスポートを作成
      this.transport = new StdioServerTransport();

      // トランスポートのエラーハンドラーを設定
      this.transport.onerror = (error: Error) => {
        logger.error('Transport error', toMCPError(error));
      };

      // トランスポートのクローズハンドラーを設定
      this.transport.onclose = () => {
        logger.info('Transport closed');
      };

      // サーバーとトランスポートを接続
      await this.server.connect(this.transport);

      logger.info('MCP Server running and connected');
    } catch (error) {
      logger.error('Failed to start MCP Server', toMCPError(error));
      throw error;
    }
  }
}
