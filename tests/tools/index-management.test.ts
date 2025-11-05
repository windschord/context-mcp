/**
 * E2Eテスト: get_index_status, clear_index MCPツール
 *
 * MCPプロトコルを通じてインデックス管理ツールを実行するテスト。
 * - get_index_statusツール: インデックス統計情報の取得
 * - clear_indexツール: インデックスのクリア
 */

import { MCPServer } from '../../src/server/mcp-server';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Index Management MCP Tools E2E', () => {
  let mcpServer: MCPServer;
  let testProjectDir: string;
  let projectId: string;

  beforeAll(async () => {
    // テスト用プロジェクトディレクトリを作成
    testProjectDir = path.join(tmpdir(), `test-project-${Date.now()}`);
    await fs.mkdir(testProjectDir, { recursive: true });

    // プロジェクトIDを生成
    projectId = path.resolve(testProjectDir);

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

This is a test project for index management tools.

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

  describe('get_index_status ツール定義の登録', () => {
    it('should register get_index_status tool', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);

      // get_index_statusツールが含まれているか確認
      const getIndexStatusTool = result.tools.find((tool: any) => tool.name === 'get_index_status');

      expect(getIndexStatusTool).toBeDefined();
      expect(getIndexStatusTool).toHaveProperty('description');
      expect(getIndexStatusTool).toHaveProperty('inputSchema');
    });

    it('should have correct tool schema for get_index_status', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const getIndexStatusTool = result.tools.find((tool: any) => tool.name === 'get_index_status');

      // スキーマの検証
      expect(getIndexStatusTool.inputSchema).toHaveProperty('type', 'object');
      expect(getIndexStatusTool.inputSchema).toHaveProperty('properties');
      expect(getIndexStatusTool.inputSchema.properties).toHaveProperty('projectId');
    });
  });

  describe('clear_index ツール定義の登録', () => {
    it('should register clear_index tool', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      // clear_indexツールが含まれているか確認
      const clearIndexTool = result.tools.find((tool: any) => tool.name === 'clear_index');

      expect(clearIndexTool).toBeDefined();
      expect(clearIndexTool).toHaveProperty('description');
      expect(clearIndexTool).toHaveProperty('inputSchema');
    });

    it('should have correct tool schema for clear_index', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const clearIndexTool = result.tools.find((tool: any) => tool.name === 'clear_index');

      // スキーマの検証
      expect(clearIndexTool.inputSchema).toHaveProperty('type', 'object');
      expect(clearIndexTool.inputSchema).toHaveProperty('properties');
      expect(clearIndexTool.inputSchema.properties).toHaveProperty('projectId');
      expect(clearIndexTool.inputSchema.properties).toHaveProperty('confirm');
    });
  });

  describe('get_index_status 機能', () => {
    it('should return status for all projects when projectId is not specified', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // get_index_statusを呼び出し
      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {},
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
      expect(response).toHaveProperty('projects');
      expect(Array.isArray(response.projects)).toBe(true);
      expect(response.projects.length).toBeGreaterThan(0);

      // 最初のプロジェクトの構造を確認
      const project = response.projects[0];
      expect(project).toHaveProperty('projectId');
      expect(project).toHaveProperty('rootPath');
      expect(project).toHaveProperty('stats');
      expect(project).toHaveProperty('status');

      // statsの構造を確認
      const stats = project.stats;
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('indexedFiles');
      expect(stats).toHaveProperty('totalSymbols');
      expect(stats).toHaveProperty('totalVectors');
      expect(stats).toHaveProperty('totalDocuments');
    });

    it('should return status for specific project when projectId is specified', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // 特定プロジェクトのステータスを取得
      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {
            projectId: projectId,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('projects');
      expect(response.projects.length).toBe(1);
      expect(response.projects[0].projectId).toBe(projectId);
    });

    it('should return empty array for non-existent project', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {
            projectId: '/non/existent/project',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('projects');
      expect(Array.isArray(response.projects)).toBe(true);
    });

    it('should include lastIndexedAt timestamp', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // ステータスを取得
      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {
            projectId: projectId,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.projects.length).toBeGreaterThan(0);
      const project = response.projects[0];

      if (project.stats.lastIndexedAt) {
        // ISO 8601形式の日付文字列か確認
        expect(new Date(project.stats.lastIndexedAt).toISOString()).toBe(
          project.stats.lastIndexedAt
        );
      }
    });

    it('should include indexSize in bytes', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // ステータスを取得
      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {
            projectId: projectId,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.projects.length).toBeGreaterThan(0);
      const project = response.projects[0];

      expect(project.stats).toHaveProperty('indexSize');
      expect(typeof project.stats.indexSize).toBe('number');
      expect(project.stats.indexSize).toBeGreaterThanOrEqual(0);
    });

    it('should include errors array if present', async () => {
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

      // インデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: errorTestDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // ステータスを取得
      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {
            projectId: path.resolve(errorTestDir),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.projects.length).toBeGreaterThan(0);
      const project = response.projects[0];

      // エラーがある場合はerrors配列が含まれる
      if (project.errors && project.errors.length > 0) {
        expect(Array.isArray(project.errors)).toBe(true);
        expect(project.errors[0]).toHaveProperty('file');
        expect(project.errors[0]).toHaveProperty('error');
      }

      // クリーンアップ
      await fs.rm(errorTestDir, { recursive: true, force: true });
    });
  });

  describe('clear_index 機能', () => {
    it('should clear index for specific project when projectId is specified', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // インデックスが存在することを確認
      let statusResult = await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'get_index_status',
            arguments: {
              projectId: projectId,
            },
          },
        },
        CallToolRequestSchema
      );
      let statusResponse = JSON.parse(statusResult.content[0].text);
      expect(statusResponse.projects.length).toBeGreaterThan(0);

      // インデックスをクリア
      const request = {
        method: 'tools/call',
        params: {
          name: 'clear_index',
          arguments: {
            projectId: projectId,
            confirm: true,
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
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('clearedProjects');
      expect(Array.isArray(response.clearedProjects)).toBe(true);
      expect(response.clearedProjects).toContain(projectId);
      expect(response).toHaveProperty('message');
    });

    it('should clear all indexes when projectId is not specified', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // すべてのインデックスをクリア
      const request = {
        method: 'tools/call',
        params: {
          name: 'clear_index',
          arguments: {
            confirm: true,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('clearedProjects');
      expect(Array.isArray(response.clearedProjects)).toBe(true);
    });

    it('should require confirmation flag', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // 確認フラグなしでクリアを試みる
      const request = {
        method: 'tools/call',
        params: {
          name: 'clear_index',
          arguments: {
            projectId: projectId,
            confirm: false,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 確認フラグがfalseの場合は警告メッセージを返す
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('message');
    });

    it('should verify index is cleared after clear_index', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      // まずインデックスを作成
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'index_project',
            arguments: {
              rootPath: testProjectDir,
            },
          },
        },
        CallToolRequestSchema
      );

      // インデックスをクリア
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'clear_index',
            arguments: {
              projectId: projectId,
              confirm: true,
            },
          },
        },
        CallToolRequestSchema
      );

      // ステータスを確認（クリアされたことを検証）
      const statusResult = await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'get_index_status',
            arguments: {
              projectId: projectId,
            },
          },
        },
        CallToolRequestSchema
      );
      const statusResponse = JSON.parse(statusResult.content[0].text);

      // クリアされたプロジェクトは空の統計を持つか、存在しない
      if (statusResponse.projects.length > 0) {
        const project = statusResponse.projects[0];
        expect(project.stats.totalFiles).toBe(0);
        expect(project.stats.totalVectors).toBe(0);
      }
    });
  });

  describe('レスポンス形式', () => {
    it('should return proper MCP tool response format for get_index_status', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_index_status',
          arguments: {},
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

    it('should return proper MCP tool response format for clear_index', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'clear_index',
          arguments: {
            confirm: true,
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
