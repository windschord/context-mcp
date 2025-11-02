/**
 * E2Eテスト: get_symbol MCPツール
 *
 * MCPプロトコルを通じてget_symbolツールを実行するテスト。
 * - ツール定義の登録
 * - シンボル定義検索の実装
 * - シンボル参照検索の実装
 * - 複数定義の区別（スコープ別）の実装
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

describe('get_symbol MCP Tool E2E', () => {
  let mcpServer: MCPServer;
  let testProjectDir: string;

  beforeAll(async () => {
    // テスト用プロジェクトディレクトリを作成
    testProjectDir = path.join(tmpdir(), `test-symbol-project-${Date.now()}`);
    await fs.mkdir(testProjectDir, { recursive: true });

    // テスト用TypeScriptファイルを作成（複数のスコープでの同名シンボル）
    await fs.writeFile(
      path.join(testProjectDir, 'math.ts'),
      `
/**
 * Math utility module
 */

// グローバルスコープのcalculate関数
export function calculate(a: number, b: number): number {
  return a + b;
}

export class Calculator {
  /**
   * クラススコープのcalculate関数
   */
  calculate(x: number, y: number): number {
    return x * y;
  }

  /**
   * Calculate result with operator
   */
  calculateWithOperator(a: number, b: number, op: string): number {
    if (op === '+') {
      return a + b;
    }
    return a - b;
  }
}

// 別のグローバル関数
export function multiply(x: number, y: number): number {
  return x * y;
}

const helper = {
  /**
   * ヘルパーオブジェクト内のcalculate関数
   */
  calculate: (n: number) => n * 2
};
`
    );

    // テスト用Pythonファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'utils.py'),
      `
"""Utility functions"""

def process_data(data):
    """Process data function"""
    return data.upper()

class DataProcessor:
    """Data processor class"""

    def process_data(self, data):
        """Process data method"""
        return data.lower()

    def transform(self, value):
        """Transform value"""
        return value * 2

def calculate(a, b):
    """Calculate sum"""
    return a + b
`
    );

    // テスト用JavaScriptファイルを作成（参照を含む）
    await fs.writeFile(
      path.join(testProjectDir, 'app.js'),
      `
import { calculate, multiply } from './math';

function main() {
  const result1 = calculate(10, 20);
  const result2 = multiply(5, 3);

  const calc = new Calculator();
  const result3 = calc.calculate(2, 4);

  return result1 + result2 + result3;
}

// calculate関数の別の参照
const sum = calculate(100, 200);
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
    it('should register get_symbol tool', async () => {
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

      // get_symbolツールが含まれているか確認
      const getSymbolTool = result.tools.find(
        (tool: any) => tool.name === 'get_symbol'
      );

      expect(getSymbolTool).toBeDefined();
      expect(getSymbolTool).toHaveProperty('description');
      expect(getSymbolTool).toHaveProperty('inputSchema');
    });

    it('should have correct tool schema for get_symbol', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const getSymbolTool = result.tools.find(
        (tool: any) => tool.name === 'get_symbol'
      );

      // スキーマの検証
      expect(getSymbolTool.inputSchema).toHaveProperty('type', 'object');
      expect(getSymbolTool.inputSchema).toHaveProperty('properties');
      expect(getSymbolTool.inputSchema.properties).toHaveProperty('symbolName');
      expect(getSymbolTool.inputSchema.properties).toHaveProperty('symbolType');
      expect(getSymbolTool.inputSchema.properties).toHaveProperty('projectId');
      expect(getSymbolTool.inputSchema.properties).toHaveProperty('scope');
      expect(getSymbolTool.inputSchema).toHaveProperty('required');
      expect(getSymbolTool.inputSchema.required).toContain('symbolName');
    });
  });

  describe('パラメータバリデーション', () => {
    it('should reject missing symbolName parameter', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            // symbolNameが欠けている
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).rejects.toThrow();
    });

    it('should reject invalid symbolName type', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 123, // 数値（文字列であるべき）
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
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
            symbolType: 'function',
            projectId: testProjectDir,
            scope: 'global',
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).resolves.toBeDefined();
    });

    it('should accept symbolName only', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
          },
        },
      };

      await expect(
        server.request(request, CallToolRequestSchema)
      ).resolves.toBeDefined();
    });
  });

  describe('シンボル定義検索', () => {
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

    it('should find symbol definitions', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
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
      expect(response).toHaveProperty('definitions');
      expect(response).toHaveProperty('references');
      expect(Array.isArray(response.definitions)).toBe(true);
      expect(Array.isArray(response.references)).toBe(true);
    });

    it('should return definition with correct structure', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'multiply',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.definitions.length).toBeGreaterThan(0);

      const firstDef = response.definitions[0];
      expect(firstDef).toHaveProperty('filePath');
      expect(firstDef).toHaveProperty('language');
      expect(firstDef).toHaveProperty('symbolType');
      expect(firstDef).toHaveProperty('scope');
      expect(firstDef).toHaveProperty('lineStart');
      expect(firstDef).toHaveProperty('lineEnd');
      expect(firstDef).toHaveProperty('snippet');

      // オプショナルフィールド
      if (firstDef.docstring !== undefined) {
        expect(typeof firstDef.docstring).toBe('string');
      }
      if (firstDef.parameters !== undefined) {
        expect(Array.isArray(firstDef.parameters)).toBe(true);
      }
      if (firstDef.returnType !== undefined) {
        expect(typeof firstDef.returnType).toBe('string');
      }
    });

    it('should filter by symbolType', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'Calculator',
            symbolType: 'class',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // すべての定義がclass型
      response.definitions.forEach((def: any) => {
        expect(def.symbolType).toBe('class');
      });
    });

    it('should filter by projectId', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
            projectId: testProjectDir,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // すべての定義がtestProjectDir内
      response.definitions.forEach((def: any) => {
        expect(def.filePath).toContain(testProjectDir);
      });
    });
  });

  describe('シンボル参照検索', () => {
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

    it('should find symbol references', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('references');
      expect(Array.isArray(response.references)).toBe(true);

      // 参照が見つかった場合、正しい構造を持つことを確認
      if (response.references.length > 0) {
        const firstRef = response.references[0];
        expect(firstRef).toHaveProperty('filePath');
        expect(firstRef).toHaveProperty('line');
        expect(firstRef).toHaveProperty('column');
        expect(firstRef).toHaveProperty('context');

        // contextは前後1行を含む
        expect(typeof firstRef.context).toBe('string');
        expect(firstRef.context.length).toBeGreaterThan(0);
      }
    });

    it('should include context around references', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'multiply',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      if (response.references.length > 0) {
        const firstRef = response.references[0];

        // コンテキストには複数行が含まれる
        const lines = firstRef.context.split('\n');
        expect(lines.length).toBeGreaterThan(1);
      }
    });
  });

  describe('複数定義の区別（スコープ別）', () => {
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

    it('should distinguish multiple definitions by scope', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 複数の定義が見つかるはず（グローバル、クラス、オブジェクト）
      expect(response.definitions.length).toBeGreaterThan(1);

      // 各定義が異なるスコープを持つ
      const scopes = response.definitions.map((def: any) => def.scope);
      const uniqueScopes = new Set(scopes);
      expect(uniqueScopes.size).toBeGreaterThan(1);
    });

    it('should filter by scope parameter', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
            scope: 'global',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // globalスコープのみが返される
      response.definitions.forEach((def: any) => {
        expect(def.scope).toBe('global');
      });
    });

    it('should distinguish same-named symbols in different languages', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'process_data',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      if (response.definitions.length > 1) {
        // 異なる言語の定義が含まれる可能性
        const languages = response.definitions.map((def: any) => def.language);
        // 少なくともPythonが含まれる
        expect(languages).toContain('Python');
      }
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle non-existent symbol gracefully', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'nonExistentSymbol123',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 見つからない場合も空配列を返す
      expect(response).toHaveProperty('definitions');
      expect(response).toHaveProperty('references');
      expect(response.definitions).toEqual([]);
      expect(response.references).toEqual([]);
    });

    it('should handle empty symbolName', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: '',
          },
        },
      };

      // 空文字列はバリデーションエラーになるべき
      await expect(
        server.request(request, CallToolRequestSchema)
      ).rejects.toThrow();
    });

    it('should handle non-existent projectId', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
            projectId: '/non/existent/project',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 存在しないプロジェクトでも結果は返る（空の結果）
      expect(response).toHaveProperty('definitions');
      expect(response).toHaveProperty('references');
    });
  });

  describe('レスポンス形式', () => {
    it('should return proper MCP tool response format', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
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
          name: 'get_symbol',
          arguments: {
            symbolName: 'calculate',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const content = result.content[0];

      // JSONとしてパース可能か確認
      expect(() => JSON.parse(content.text)).not.toThrow();

      const response = JSON.parse(content.text);
      expect(response).toHaveProperty('definitions');
      expect(response).toHaveProperty('references');
    });
  });
});
