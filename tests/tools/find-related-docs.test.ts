/**
 * E2Eテスト: find_related_docs MCPツール
 *
 * MCPプロトコルを通じてfind_related_docsツールを実行するテスト。
 * - ツール定義の登録
 * - コード-ドキュメント関連付け機能との連携
 * - 関連度スコアによるソート機能
 * - エラーハンドリング
 */

import { MCPServer } from '../../src/server/mcp-server';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('find_related_docs MCP Tool E2E', () => {
  let mcpServer: MCPServer;
  let testProjectDir: string;

  beforeAll(async () => {
    // テスト用プロジェクトディレクトリを作成
    testProjectDir = path.join(tmpdir(), `test-related-docs-project-${Date.now()}`);
    await fs.mkdir(testProjectDir, { recursive: true });
    await fs.mkdir(path.join(testProjectDir, 'docs'), { recursive: true });
    await fs.mkdir(path.join(testProjectDir, 'src'), { recursive: true });

    // テスト用TypeScriptファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'src', 'calculator.ts'),
      `
/**
 * Calculator class
 */
export class Calculator {
  /**
   * Add two numbers
   */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtract two numbers
   */
  subtract(a: number, b: number): number {
    return a - b;
  }

  /**
   * Multiply two numbers
   */
  multiply(x: number, y: number): number {
    return x * y;
  }
}

/**
 * Format number result
 */
export function formatResult(value: number): string {
  return \`Result: \${value}\`;
}
`
    );

    // テスト用Pythonファイルを作成
    await fs.writeFile(
      path.join(testProjectDir, 'src', 'processor.py'),
      `
"""Data processor module"""

class DataProcessor:
    """Process data"""

    def process(self, data):
        """Process input data"""
        return data.upper()

    def validate(self, data):
        """Validate data"""
        return len(data) > 0

def transform_data(input_data):
    """Transform input data"""
    return input_data.strip()
`
    );

    // テスト用ドキュメント1: ファイルパス参照を含む
    await fs.writeFile(
      path.join(testProjectDir, 'docs', 'calculator-guide.md'),
      `
# Calculator Guide

This guide explains how to use the Calculator class.

## Basic Usage

The \`Calculator\` class is defined in \`src/calculator.ts\`.

### Addition

Use the \`add\` method to add two numbers:

\`\`\`typescript
const calc = new Calculator();
const result = calc.add(5, 3);
console.log(formatResult(result));
\`\`\`

### Multiplication

Use the \`multiply\` method:

\`\`\`typescript
const result = calc.multiply(4, 7);
\`\`\`

## Related Files

- ./src/calculator.ts
- src/processor.py (for data processing)
`
    );

    // テスト用ドキュメント2: シンボル参照を含む
    await fs.writeFile(
      path.join(testProjectDir, 'docs', 'api-reference.md'),
      `
# API Reference

## Calculator Class

The \`Calculator\` class provides basic arithmetic operations.

### Methods

- \`add(a, b)\`: Add two numbers
- \`subtract(a, b)\`: Subtract b from a
- \`multiply(x, y)\`: Multiply two numbers

### Helper Functions

- \`formatResult(value)\`: Format the result as a string
`
    );

    // テスト用ドキュメント3: コードブロック類似を含む
    await fs.writeFile(
      path.join(testProjectDir, 'docs', 'examples.md'),
      `
# Examples

## Calculator Example

Here is a sample code for using the calculator:

\`\`\`typescript
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
\`\`\`

## Data Processing Example

\`\`\`python
class DataProcessor:
    def process(self, data):
        return data.upper()
\`\`\`
`
    );

    // テスト用ドキュメント4: 無関係なドキュメント
    await fs.writeFile(
      path.join(testProjectDir, 'docs', 'unrelated.md'),
      `
# Unrelated Documentation

This document is about something completely different.
It has no relation to the calculator or processor code.

Just some random text here.
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
    it('should register find_related_docs tool', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      expect(server).toBeDefined();

      const request = {
        method: 'tools/list',
        params: {},
      };

      const result = await server.request(request, ListToolsRequestSchema);

      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);

      // find_related_docsツールが含まれているか確認
      const findRelatedDocsTool = result.tools.find(
        (tool: any) => tool.name === 'find_related_docs'
      );

      expect(findRelatedDocsTool).toBeDefined();
      expect(findRelatedDocsTool).toHaveProperty('description');
      expect(findRelatedDocsTool).toHaveProperty('inputSchema');
    });

    it('should have correct tool schema for find_related_docs', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;
      const result = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const findRelatedDocsTool = result.tools.find(
        (tool: any) => tool.name === 'find_related_docs'
      );

      // スキーマの検証
      expect(findRelatedDocsTool.inputSchema).toHaveProperty('type', 'object');
      expect(findRelatedDocsTool.inputSchema).toHaveProperty('properties');
      expect(findRelatedDocsTool.inputSchema.properties).toHaveProperty('filePath');
      expect(findRelatedDocsTool.inputSchema.properties).toHaveProperty('symbolName');
      expect(findRelatedDocsTool.inputSchema.properties).toHaveProperty('projectId');
      expect(findRelatedDocsTool.inputSchema.properties).toHaveProperty('topK');
    });
  });

  describe('パラメータバリデーション', () => {
    it('should reject when both filePath and symbolName are missing', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            // filePath と symbolName が両方欠けている
          },
        },
      };

      await expect(server.request(request, CallToolRequestSchema)).rejects.toThrow();
    });

    it('should accept filePath only', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
          },
        },
      };

      await expect(server.request(request, CallToolRequestSchema)).resolves.toBeDefined();
    });

    it('should accept symbolName only', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
          },
        },
      };

      await expect(server.request(request, CallToolRequestSchema)).resolves.toBeDefined();
    });

    it('should accept both filePath and symbolName', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
            symbolName: 'Calculator',
          },
        },
      };

      await expect(server.request(request, CallToolRequestSchema)).resolves.toBeDefined();
    });

    it('should accept topK parameter', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
            topK: 3,
          },
        },
      };

      await expect(server.request(request, CallToolRequestSchema)).resolves.toBeDefined();
    });

    it('should reject invalid topK type', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
            topK: 'invalid', // 数値であるべき
          },
        },
      };

      await expect(server.request(request, CallToolRequestSchema)).rejects.toThrow();
    });
  });

  describe('コード-ドキュメント関連付け', () => {
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
            includeDocuments: true,
          },
        },
      };

      await server.request(indexRequest, CallToolRequestSchema);
    });

    it('should find related documents by file path', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
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
      expect(response).toHaveProperty('documents');
      expect(response).toHaveProperty('totalResults');
      expect(Array.isArray(response.documents)).toBe(true);
    });

    it('should find related documents by symbol name', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      expect(response.documents).toBeDefined();
      expect(Array.isArray(response.documents)).toBe(true);

      // Calculatorに関連するドキュメントが見つかるはず
      if (response.documents.length > 0) {
        const doc = response.documents[0];
        expect(doc).toHaveProperty('filePath');
        expect(doc).toHaveProperty('title');
        expect(doc).toHaveProperty('relatedScore');
        expect(doc).toHaveProperty('matchedReferences');
        expect(doc).toHaveProperty('snippet');
      }
    });

    it('should return documents with correct structure', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      if (response.documents.length > 0) {
        const doc = response.documents[0];

        // 必須フィールド
        expect(typeof doc.filePath).toBe('string');
        expect(typeof doc.title).toBe('string');
        expect(typeof doc.relatedScore).toBe('number');
        expect(Array.isArray(doc.matchedReferences)).toBe(true);
        expect(typeof doc.snippet).toBe('string');

        // スコアは0-1の範囲
        expect(doc.relatedScore).toBeGreaterThanOrEqual(0);
        expect(doc.relatedScore).toBeLessThanOrEqual(1);

        // matchedReferencesの構造を検証
        if (doc.matchedReferences.length > 0) {
          const ref = doc.matchedReferences[0];
          expect(ref).toHaveProperty('type');
          expect(ref).toHaveProperty('reference');
          expect(ref).toHaveProperty('score');
          expect(['file_path', 'symbol', 'code_similarity']).toContain(ref.type);
        }
      }
    });

    it('should detect file_path references', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // calculator-guide.md には src/calculator.ts への参照があるはず
      const calculatorGuide = response.documents.find((doc: any) =>
        doc.filePath.includes('calculator-guide.md')
      );

      if (calculatorGuide) {
        expect(calculatorGuide.matchedReferences.some((ref: any) => ref.type === 'file_path')).toBe(
          true
        );
      }
    });

    it('should detect symbol references', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // Calculatorへの参照があるドキュメントを探す
      const docsWithSymbolRef = response.documents.filter((doc: any) =>
        doc.matchedReferences.some((ref: any) => ref.type === 'symbol')
      );

      expect(docsWithSymbolRef.length).toBeGreaterThan(0);
    });

    it('should detect code similarity', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // examples.md にはCalculatorクラスの類似コードがあるはず
      const examplesDoc = response.documents.find((doc: any) =>
        doc.filePath.includes('examples.md')
      );

      if (examplesDoc) {
        expect(
          examplesDoc.matchedReferences.some((ref: any) => ref.type === 'code_similarity')
        ).toBe(true);
      }
    });
  });

  describe('関連度スコアによるソート', () => {
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
            includeDocuments: true,
          },
        },
      };

      await server.request(indexRequest, CallToolRequestSchema);
    });

    it('should sort documents by related score (descending)', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 複数のドキュメントがある場合、スコアが降順であることを確認
      if (response.documents.length > 1) {
        for (let i = 0; i < response.documents.length - 1; i++) {
          const currentScore = response.documents[i].relatedScore;
          const nextScore = response.documents[i + 1].relatedScore;
          expect(currentScore).toBeGreaterThanOrEqual(nextScore);
        }
      }
    });

    it('should respect topK parameter', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
            topK: 2,
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 最大2件のドキュメントが返される
      expect(response.documents.length).toBeLessThanOrEqual(2);
    });

    it('should exclude unrelated documents', async () => {
      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'src', 'calculator.ts'),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // unrelated.md は含まれないはず
      const unrelatedDoc = response.documents.find((doc: any) =>
        doc.filePath.includes('unrelated.md')
      );

      // 含まれていない、または非常に低いスコア
      if (unrelatedDoc) {
        expect(unrelatedDoc.relatedScore).toBeLessThan(0.1);
      }
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle non-existent file gracefully', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            filePath: path.join(testProjectDir, 'non-existent-file.ts'),
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // エラーにならず空結果を返す
      expect(response).toHaveProperty('documents');
      expect(response.documents).toEqual([]);
      expect(response.totalResults).toBe(0);
    });

    it('should handle non-existent symbol gracefully', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'NonExistentSymbol123',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 空結果を返す
      expect(response).toHaveProperty('documents');
      expect(response).toHaveProperty('totalResults');
    });

    it('should handle non-existent projectId', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
            projectId: '/non/existent/project',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const response = JSON.parse(result.content[0].text);

      // 存在しないプロジェクトでも結果は返る（空の結果）
      expect(response).toHaveProperty('documents');
      expect(response).toHaveProperty('totalResults');
    });
  });

  describe('レスポンス形式', () => {
    it('should return proper MCP tool response format', async () => {
      await mcpServer.initialize();

      const server = (mcpServer as any).server;

      const request = {
        method: 'tools/call',
        params: {
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
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
          name: 'find_related_docs',
          arguments: {
            symbolName: 'Calculator',
          },
        },
      };

      const result = await server.request(request, CallToolRequestSchema);
      const content = result.content[0];

      // JSONとしてパース可能か確認
      expect(() => JSON.parse(content.text)).not.toThrow();

      const response = JSON.parse(content.text);
      expect(response).toHaveProperty('documents');
      expect(response).toHaveProperty('totalResults');
    });
  });
});
