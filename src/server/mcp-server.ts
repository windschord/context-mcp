/**
 * MCP Server
 * Model Context Protocol サーバーの実装
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  InitializeRequestSchema,
  InitializeResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { toMCPError } from '../utils/errors.js';
import { IndexingService } from '../services/indexing-service.js';
import {
  TOOL_NAME as INDEX_PROJECT_TOOL_NAME,
  TOOL_DESCRIPTION as INDEX_PROJECT_TOOL_DESCRIPTION,
  getInputSchemaJSON as getIndexProjectInputSchema,
  handleIndexProject,
  type IndexProjectInput,
} from '../tools/index-project-tool.js';

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private name: string;
  private version: string;
  private isShutdown = false;
  private indexingService?: IndexingService;

  constructor(name = 'lsp-mcp', version = '0.1.0', indexingService?: IndexingService) {
    this.name = name;
    this.version = version;
    this.indexingService = indexingService;

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

    // ツールハンドラーを設定
    this.setupToolHandlers();
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
   * ツールハンドラーをセットアップ
   */
  private setupToolHandlers(): void {
    // ListToolsRequestハンドラー
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListToolsRequest received');

      const tools = [];

      // index_projectツールを登録
      if (this.indexingService) {
        tools.push({
          name: INDEX_PROJECT_TOOL_NAME,
          description: INDEX_PROJECT_TOOL_DESCRIPTION,
          inputSchema: getIndexProjectInputSchema(),
        });
      }

      return { tools };
    });

    // CallToolRequestハンドラー
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args } = request.params;

      logger.debug('CallToolRequest received', { toolName, args });

      try {
        // index_projectツール
        if (toolName === INDEX_PROJECT_TOOL_NAME) {
          if (!this.indexingService) {
            throw new Error('Indexing service is not available');
          }

          // 進捗トークンを取得
          const progressToken = request.params._meta?.progressToken;

          // 進捗コールバック
          const progressCallback = progressToken
            ? (progress: number, message: string) => {
                this.server.notification({
                  method: 'notifications/progress',
                  params: {
                    progressToken,
                    progress,
                    total: 100,
                    message,
                  },
                });
              }
            : undefined;

          // ツールハンドラーを実行
          const result = await handleIndexProject(
            args as IndexProjectInput,
            this.indexingService,
            progressCallback
          );

          // MCPレスポンス形式で返す
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // 未知のツール
        throw new Error(`Unknown tool: ${toolName}`);
      } catch (error: any) {
        logger.error('Tool execution error', toMCPError(error));

        // エラーレスポンス
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error.message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
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
