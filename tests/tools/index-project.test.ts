/**
 * E2Eテスト: index_project MCPツール
 *
 * MCPプロトコルを通じてindex_projectツールを実行するテスト。
 * - ツール定義の登録
 * - パラメータバリデーション
 * - Indexing Serviceとの連携
 * - 進捗通知
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

describe('index_project MCP Tool E2E', () => {
  let mcpServer: MCPServer;
  let testProjectDir: string;

  beforeAll(async () => {
    // テスト用プロジェクトディレクトリを作成
    testProjectDir = path.join(tmpdir(), `test-project-${Date.now()}`);
    await fs.mkdir(testProjectDir, { recursive: true });

    // テスト用ファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'test.ts'),
      `
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export { greet };
`
    );

    await fs.writeFile(
      path.join(testProjectDir, 'README.md'),
      `
# Test Project

This is a test project for index_project tool.

\`\`\`typescript
console.log("Hello, world!");
\`\`\`
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
    it('should register index_project tool', async () => {
      await mcpServer.initialize();

      // ListToolsRequestを実行
      const server = (mcpServer as any).server;
      expect(server).toBeDefined();

      // ListToolsRequestハンドラーが登録されているか確認
      const request = {
        method: 'tools/list',
        params: {},
      };

      const result = await server.request(
        request,
        ListToolsRequestSchema
      );

      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);

      // index_projectツールが含まれているか確認
      const indexProjectTool = result.tools.find(
        (tool: any) => tool.name === 'index_project'
      );

      expect(indexProjectTool).toBeDefined();
      expect(indexProjectTool).toHaveProperty('description');
      expect(indexProjectTool).toHaveProperty('inputSchema');
    });

    it('should have correct tool schema for index_project', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const indexProjectTool = result.tools.find(
        (tool: any) => tool.name === 'index_project'
      );

      // スキーマの検証
      expect(indexProjectTool.inputSchema).toHaveProperty('type', 'object');
      expect(indexProjectTool.inputSchema).toHaveProperty('properties');
      expect(indexProjectTool.inputSchema.properties).toHaveProperty('rootPath');
      expect(indexProjectTool.inputSchema.properties).toHaveProperty('languages');
      expect(indexProjectTool.inputSchema.properties).toHaveProperty('excludePatterns');
      expect(indexProjectTool.inputSchema.properties).toHaveProperty('includeDocuments');
      expect(indexProjectTool.inputSchema).toHaveProperty('required');
      expect(indexProjectTool.inputSchema.required).toContain('rootPath');
    });
  });

  describe('パラメータバリデーション', () => {
    it('should reject missing rootPath parameter', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            // rootPathが欠けている
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).rejects.toThrow();
    });

    it('should reject invalid rootPath type', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: 123, // 数値（文字列であるべき）
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
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
            languages: ['typescript'],
            excludePatterns: ['node_modules/**'],
            includeDocuments: true,
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).resolves.toBeDefined();
    });
  });

  describe('Indexing Serviceとの連携', () => {
    it('should call indexing service with correct parameters', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
            includeDocuments: true,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      // レスポンス内容を検証
      const content = result.content[0];
      expect(content).toHaveProperty('type', 'text');
      expect(content).toHaveProperty('text');

      // JSONレスポンスをパース
      const response = JSON.parse(content.text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('projectId');
      expect(response).toHaveProperty('stats');
      expect(response.stats).toHaveProperty('totalFiles');
      expect(response.stats).toHaveProperty('processedFiles');
      expect(response.stats).toHaveProperty('failedFiles');
      expect(response.stats).toHaveProperty('totalSymbols');
      expect(response.stats).toHaveProperty('totalVectors');
      expect(response.stats).toHaveProperty('processingTime');
    });

    it('should return success=true for valid project', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.stats.totalFiles).toBeGreaterThan(0);
      expect(response.stats.processedFiles).toBeGreaterThan(0);
    });
  });

  describe('進捗通知', () => {
    it('should support progress token in request', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
          },
          _meta: {
            progressToken: 'test-progress-token',
          },
        },
      };

      // 進捗トークンがあってもエラーにならないことを確認
      await expect(
        server.request(request, CallToolRequestSchema)
      ).resolves.toBeDefined();
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle non-existent directory', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: '/non/existent/directory',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // エラーでも成功扱い（エラー情報を含む）
      expect(response).toHaveProperty('success');
      if (!response.success) {
        expect(response).toHaveProperty('errors');
        expect(Array.isArray(response.errors)).toBe(true);
      }
    });

    it('should report errors for individual files', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // 不正なファイルを含むディレクトリを作成
      const errorTestDir = path.join(tmpdir(), `error-test-${Date.now()}`);
      await fs.mkdir(errorTestDir, { recursive: true });

      // 不正な構文のファイルを作成
      await fs.writeFile(
        path.join(errorTestDir, 'invalid.ts'),
        'this is not valid typescript code {{{}}}'
      );

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: errorTestDir,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // エラーでも処理は継続される（エラー耐性）
      expect(response).toHaveProperty('stats');
      if (response.errors && response.errors.length > 0) {
        expect(response.errors[0]).toHaveProperty('file');
        expect(response.errors[0]).toHaveProperty('error');
      }

      // クリーンアップ
      await fs.rm(errorTestDir, { recursive: true, force: true });
    });
  });

  describe('レスポンス形式', () => {
    it('should return proper MCP tool response format', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'index_project',
          arguments: {
            rootPath: testProjectDir,
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
  });
});
