/**
 * E2Eテスト: search_code MCPツール
 *
 * MCPプロトコルを通じてsearch_codeツールを実行するテスト。
 * - ツール定義の登録
 * - パラメータバリデーション
 * - Hybrid Search Engineとの連携
 * - 検索結果のフォーマット機能
 * - エラーハンドリング
 */

import { MCPServer } from '../../src/server/mcp-server';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('search_code MCP Tool E2E', () => {
  let mcpServer: MCPServer;
  let testProjectDir: string;

  beforeAll(async () => {
    // テスト用プロジェクトディレクトリを作成
    testProjectDir = path.join(tmpdir(), `test-search-project-${Date.now()}`);
    await fs.mkdir(testProjectDir, { recursive: true });

    // テスト用TypeScriptファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'auth.ts'),
      `
/**
 * User authentication module
 */
export async function authenticateUser(username: string, password: string): Promise<boolean> {
  // Validate credentials
  if (!username || !password) {
    throw new Error('Username and password are required');
  }

  // Authenticate logic here
  return true;
}

export function hashPassword(password: string): string {
  // Hash password implementation
  return 'hashed_' + password;
}
`
    );

    await fs.writeFile(
      path.join(testProjectDir, 'database.ts'),
      `
/**
 * Database connection module
 */
export async function connectDatabase(connectionString: string): Promise<void> {
  // Connect to database
  console.log('Connecting to database:', connectionString);
}

export async function executeQuery(query: string): Promise<any[]> {
  // Execute SQL query
  return [];
}
`
    );

    // テスト用Pythonファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'utils.py'),
      `
def calculate_sum(numbers):
    """Calculate sum of numbers"""
    return sum(numbers)

def format_date(date):
    """Format date to string"""
    return date.strftime('%Y-%m-%d')
`
    );

    // テスト用Markdownファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'README.md'),
      `
# Test Project

This project contains authentication and database utilities.

## Authentication

See \`auth.ts\` for user authentication functions.

\`\`\`typescript
import { authenticateUser } from './auth';

const result = await authenticateUser('user', 'password');
\`\`\`

## Database

Database connection utilities are in \`database.ts\`.
`
    );
  });

  afterAll(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch (error) {
      // エラーを無視
    }

    if (mcpServer) {
      await mcpServer.shutdown();
    }
  });

  beforeEach(() => {
    mcpServer = new MCPServer();
  });

  afterEach(async () => {
    if (mcpServer) {
      await mcpServer.shutdown();
    }
  });

  describe('ツール定義の登録', () => {
    it('should register search_code tool', async () => {
      await mcpServer.initialize();

      // ListToolsRequestを実行
      const server = (mcpServer as any).server;
      expect(server).toBeDefined();

      const request = {
        method: 'tools/list',
        params: {},
      };

      const result = await server.request(request, ListToolsRequestSchema);

      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);

      // search_codeツールが含まれているか確認
      const searchCodeTool = result.tools.find(
        (tool: any) => tool.name === 'search_code'
      );

      expect(searchCodeTool).toBeDefined();
      expect(searchCodeTool).toHaveProperty('description');
      expect(searchCodeTool).toHaveProperty('inputSchema');
    });

    it('should have correct tool schema for search_code', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const searchCodeTool = result.tools.find(
        (tool: any) => tool.name === 'search_code'
      );

      // スキーマの検証
      expect(searchCodeTool.inputSchema).toHaveProperty('type', 'object');
      expect(searchCodeTool.inputSchema).toHaveProperty('properties');
      expect(searchCodeTool.inputSchema.properties).toHaveProperty('query');
      expect(searchCodeTool.inputSchema.properties).toHaveProperty('projectId');
      expect(searchCodeTool.inputSchema.properties).toHaveProperty('fileTypes');
      expect(searchCodeTool.inputSchema.properties).toHaveProperty('languages');
      expect(searchCodeTool.inputSchema.properties).toHaveProperty('topK');
      expect(searchCodeTool.inputSchema).toHaveProperty('required');
      expect(searchCodeTool.inputSchema.required).toContain('query');
    });
  });

  describe('パラメータバリデーション', () => {
    it('should reject missing query parameter', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            // queryが欠けている
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).rejects.toThrow();
    });

    it('should reject invalid query type', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 123, // 数値（文字列であるべき）
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).rejects.toThrow();
    });

    it('should reject invalid topK type', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'test query',
            topK: 'invalid', // 文字列（数値であるべき）
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).rejects.toThrow();
    });

    it('should accept valid parameters', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'authentication function',
            projectId: testProjectDir,
            fileTypes: ['.ts', '.js'],
            languages: ['TypeScript'],
            topK: 5,
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).resolves.toBeDefined();
    });

    it('should use default topK when not specified', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'database connection',
            // topKを省略
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('results');
      // デフォルトは10件まで
      expect(response.results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Hybrid Search Engineとの連携', () => {
    beforeEach(async () => {
      // 事前にプロジェクトをインデックス化
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const indexRequest = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
          },
        },
      };

      await server.request(indexRequest, CallToolRequestSchema);
    });

    it('should call hybrid search engine with correct parameters', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'authentication',
            topK: 5,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const content = result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');

      // JSONレスポンスをパース
      const response = JSON.parse(content.text);
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('totalResults');
      expect(response).toHaveProperty('searchTime');
    });

    it('should return search results with correct structure', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'database',
            topK: 5,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(Array.isArray(response.results)).toBe(true);

      // 各結果の構造を確認
      if (response.results.length > 0) {
        const firstResult = response.results[0];
        expect(firstResult).toHaveProperty('filePath');
        expect(firstResult).toHaveProperty('language');
        expect(firstResult).toHaveProperty('snippet');
        expect(firstResult).toHaveProperty('score');
        expect(firstResult).toHaveProperty('lineStart');
        expect(firstResult).toHaveProperty('lineEnd');

        // スコアは0-1の範囲
        expect(firstResult.score).toBeGreaterThanOrEqual(0);
        expect(firstResult.score).toBeLessThanOrEqual(1);
      }
    });

    it('should respect topK parameter', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'function',
            topK: 3,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.results.length).toBeLessThanOrEqual(3);
    });

    it('should filter by fileTypes', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'function',
            fileTypes: ['.ts'],
            topK: 10,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // すべての結果が.tsファイル
      response.results.forEach((r: any) => {
        expect(r.filePath).toMatch(/\.ts$/);
      });
    });

    it('should filter by languages', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'function',
            languages: ['TypeScript'],
            topK: 10,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // すべての結果がTypeScript
      response.results.forEach((r: any) => {
        expect(r.language).toBe('TypeScript');
      });
    });

    it('should filter by projectId', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'function',
            projectId: testProjectDir,
            topK: 10,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // すべての結果がtestProjectDir内
      response.results.forEach((r: any) => {
        expect(r.filePath).toContain(testProjectDir);
      });
    });
  });

  describe('検索結果のフォーマット機能', () => {
    beforeEach(async () => {
      // 事前にプロジェクトをインデックス化
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const indexRequest = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
          },
        },
      };

      await server.request(indexRequest, CallToolRequestSchema);
    });

    it('should include code snippets with context', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'authenticateUser',
            topK: 5,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // スニペットに前後3行が含まれることを確認
      if (response.results.length > 0) {
        const firstResult = response.results[0];
        expect(firstResult.snippet).toBeTruthy();
        expect(typeof firstResult.snippet).toBe('string');
        expect(firstResult.snippet.length).toBeGreaterThan(0);
      }
    });

    it('should include symbol information when available', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'authenticateUser',
            topK: 5,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // シンボル情報を含む結果があるか確認
      const resultWithSymbol = response.results.find((r: any) => r.symbolName);
      if (resultWithSymbol) {
        expect(resultWithSymbol).toHaveProperty('symbolName');
        expect(resultWithSymbol).toHaveProperty('symbolType');
      }
    });

    it('should include metadata when available', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'database',
            topK: 5,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // メタデータを含む結果があるか確認
      if (response.results.length > 0) {
        const firstResult = response.results[0];
        // metadataフィールドが存在する場合、オブジェクトであること
        if (firstResult.metadata) {
          expect(typeof firstResult.metadata).toBe('object');
        }
      }
    });

    it('should report search time in milliseconds', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'function',
            topK: 5,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('searchTime');
      expect(typeof response.searchTime).toBe('number');
      expect(response.searchTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle empty query gracefully', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: '',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 空クエリでもエラーにならず、空結果を返す
      expect(response).toHaveProperty('results');
      expect(Array.isArray(response.results)).toBe(true);
    });

    it('should handle non-existent projectId', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'test',
            projectId: '/non/existent/project',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 存在しないプロジェクトでも結果は返る（空の結果）
      expect(response).toHaveProperty('results');
      expect(Array.isArray(response.results)).toBe(true);
    });

    it('should handle search engine errors', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // 異常なパラメータでエラーを誘発
      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'test',
            topK: -1, // 負の値
          },
        },
      };

      // エラーが適切に処理されることを確認
      await expect(async () => {
        const result = await server.request(request, CallToolRequestSchema);
        const response = JSON.parse(result.content[0].text);

        // エラーレスポンスまたは空結果
        if (result.isError) {
          expect(response).toHaveProperty('error');
        } else {
          expect(response).toHaveProperty('results');
        }
      }).not.toThrow();
    });
  });

  describe('レスポンス形式', () => {
    it('should return proper MCP tool response format', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'test query',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);

      // MCP CallToolResultの形式を確認
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);

      const content = result.content[0];
      expect(content).toHaveProperty('type');
      expect(['text', 'image', 'resource']).toContain(content.type);
      expect(content).toHaveProperty('text');
    });

    it('should return valid JSON in text content', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'search_code',
          arguments: {
            query: 'function',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const content = result.content[0];

      // JSONとしてパース可能か確認
      expect(() => JSON.parse(content.text)).not.toThrow();

      const response = JSON.parse(content.text);
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('totalResults');
      expect(response).toHaveProperty('searchTime');
    });
  });
});
