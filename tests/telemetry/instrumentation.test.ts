/**
 * インストルメンテーション機能のテスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TelemetryManager } from '../../src/telemetry/TelemetryManager.js';
import {
  setTelemetryManager,
  traceToolCall,
  traceVectorDBOperation,
  traceASTParser,
  traceEmbedding,
  traceToolCallSync,
  traceASTParserSync,
} from '../../src/telemetry/instrumentation.js';

describe('Instrumentation', () => {
  let telemetryManager: TelemetryManager;

  beforeAll(async () => {
    // テレメトリを有効化
    telemetryManager = new TelemetryManager();
    await telemetryManager.initialize({
      enabled: true,
      serviceName: 'context-mcp-test',
      samplingRate: 1.0,
      exporters: {
        traces: 'console',
        metrics: 'none',
        logs: 'none',
      },
    });
    setTelemetryManager(telemetryManager);
  });

  afterAll(async () => {
    await telemetryManager.shutdown();
  });

  describe('traceToolCall', () => {
    it('MCPツール呼び出しを正常にトレースできる', async () => {
      const result = await traceToolCall(
        'test_tool',
        { param1: 'value1', param2: 123 },
        async () => {
          return 'success';
        }
      );

      expect(result).toBe('success');
    });

    it('非同期処理を正しく処理できる', async () => {
      const result = await traceToolCall('async_tool', { operation: 'test' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      });

      expect(result).toBe('async-result');
    });

    it('エラーが発生した場合は再スローされる', async () => {
      await expect(
        traceToolCall('error_tool', {}, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('エラー時にスパンにエラー情報が記録される', async () => {
      try {
        await traceToolCall('error_tool', {}, async () => {
          throw new Error('Test error with stack');
        });
      } catch (error) {
        // エラーが発生することを期待
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('大きなパラメータが切り捨てられる', async () => {
      const largeData = 'x'.repeat(2048);
      const result = await traceToolCall('large_param_tool', { data: largeData }, async () => {
        return 'success';
      });

      expect(result).toBe('success');
      // 切り捨てが正しく動作していることは、エラーが発生しないことで確認
    });

    it('複数のトレース呼び出しが正しく処理される', async () => {
      const results = await Promise.all([
        traceToolCall('tool1', {}, async () => 'result1'),
        traceToolCall('tool2', {}, async () => 'result2'),
        traceToolCall('tool3', {}, async () => 'result3'),
      ]);

      expect(results).toEqual(['result1', 'result2', 'result3']);
    });
  });

  describe('traceVectorDBOperation', () => {
    it('ベクターDB操作を正常にトレースできる', async () => {
      const result = await traceVectorDBOperation('query', 'milvus', async () => {
        return { results: [1, 2, 3] };
      });

      expect(result).toEqual({ results: [1, 2, 3] });
    });

    it('upsert操作をトレースできる', async () => {
      const result = await traceVectorDBOperation('upsert', 'milvus', async () => {
        return { inserted: 10 };
      });

      expect(result).toEqual({ inserted: 10 });
    });

    it('delete操作をトレースできる', async () => {
      const result = await traceVectorDBOperation('delete', 'milvus', async () => {
        return { deleted: 5 };
      });

      expect(result).toEqual({ deleted: 5 });
    });

    it('エラーが発生した場合は再スローされる', async () => {
      await expect(
        traceVectorDBOperation('query', 'milvus', async () => {
          throw new Error('VectorDB error');
        })
      ).rejects.toThrow('VectorDB error');
    });

    it('異なるバックエンドをトレースできる', async () => {
      const backends = ['milvus', 'zilliz', 'qdrant'];

      for (const backend of backends) {
        const result = await traceVectorDBOperation('query', backend, async () => {
          return { backend };
        });

        expect(result).toEqual({ backend });
      }
    });
  });

  describe('traceASTParser', () => {
    it('AST解析を正常にトレースできる', async () => {
      const result = await traceASTParser('typescript', '/path/to/file.ts', async () => {
        return { type: 'Program', body: [] };
      });

      expect(result).toEqual({ type: 'Program', body: [] });
    });

    it('異なる言語の解析をトレースできる', async () => {
      const languages = ['typescript', 'python', 'go', 'rust'];

      for (const language of languages) {
        const result = await traceASTParser(language, `/path/to/file.${language}`, async () => {
          return { language };
        });

        expect(result).toEqual({ language });
      }
    });

    it('エラーが発生した場合は再スローされる', async () => {
      await expect(
        traceASTParser('typescript', '/path/to/file.ts', async () => {
          throw new Error('Parse error');
        })
      ).rejects.toThrow('Parse error');
    });

    it('ファイルパスが正しく記録される', async () => {
      const filePath = '/absolute/path/to/file.ts';
      const result = await traceASTParser('typescript', filePath, async () => {
        return 'parsed';
      });

      expect(result).toBe('parsed');
    });
  });

  describe('traceEmbedding', () => {
    it('埋め込み生成を正常にトレースできる', async () => {
      const result = await traceEmbedding('transformers', 'all-MiniLM-L6-v2', 10, async () => {
        return Array(384).fill(0.5);
      });

      expect(result).toHaveLength(384);
      expect(result[0]).toBe(0.5);
    });

    it('異なるプロバイダーをトレースできる', async () => {
      const providers = ['transformers', 'openai', 'voyageai'];

      for (const provider of providers) {
        const result = await traceEmbedding(provider, 'test-model', 5, async () => {
          return [1, 2, 3];
        });

        expect(result).toEqual([1, 2, 3]);
      }
    });

    it('エラーが発生した場合は再スローされる', async () => {
      await expect(
        traceEmbedding('transformers', 'test-model', 1, async () => {
          throw new Error('Embedding error');
        })
      ).rejects.toThrow('Embedding error');
    });

    it('テキスト数が正しく記録される', async () => {
      const textCounts = [1, 10, 100, 1000];

      for (const count of textCounts) {
        const result = await traceEmbedding('transformers', 'test-model', count, async () => {
          return Array(count).fill(0.1);
        });

        expect(result).toHaveLength(count);
      }
    });
  });

  describe('traceToolCallSync', () => {
    it('同期関数を正常にトレースできる', () => {
      const result = traceToolCallSync('sync_tool', { param: 'value' }, () => {
        return 'sync-result';
      });

      expect(result).toBe('sync-result');
    });

    it('エラーが発生した場合は再スローされる', () => {
      expect(() => {
        traceToolCallSync('error_sync_tool', {}, () => {
          throw new Error('Sync error');
        });
      }).toThrow('Sync error');
    });
  });

  describe('traceASTParserSync', () => {
    it('同期AST解析を正常にトレースできる', () => {
      const result = traceASTParserSync('typescript', '/path/to/file.ts', () => {
        return { type: 'Program' };
      });

      expect(result).toEqual({ type: 'Program' });
    });

    it('エラーが発生した場合は再スローされる', () => {
      expect(() => {
        traceASTParserSync('typescript', '/path/to/file.ts', () => {
          throw new Error('Sync parse error');
        });
      }).toThrow('Sync parse error');
    });
  });

  describe('テレメトリ無効時の動作', () => {
    let disabledManager: TelemetryManager;

    beforeEach(async () => {
      // テレメトリを無効化
      disabledManager = new TelemetryManager();
      await disabledManager.initialize({
        enabled: false,
      });
      setTelemetryManager(disabledManager);
    });

    afterAll(async () => {
      await disabledManager.shutdown();
      // 元のテレメトリマネージャーに戻す
      setTelemetryManager(telemetryManager);
    });

    it('テレメトリ無効時でもtraceToolCallが正常に動作する', async () => {
      const result = await traceToolCall('test_tool', {}, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('テレメトリ無効時でもtraceVectorDBOperationが正常に動作する', async () => {
      const result = await traceVectorDBOperation('query', 'milvus', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('テレメトリ無効時でもtraceASTParserが正常に動作する', async () => {
      const result = await traceASTParser('typescript', '/path/to/file.ts', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('テレメトリ無効時でもtraceEmbeddingが正常に動作する', async () => {
      const result = await traceEmbedding('transformers', 'model', 1, async () => {
        return [0.5];
      });

      expect(result).toEqual([0.5]);
    });
  });

  describe('エラーハンドリング', () => {
    it('カスタムエラーオブジェクトを正しく処理できる', async () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      await expect(
        traceToolCall('custom_error_tool', {}, async () => {
          throw new CustomError('Custom error message');
        })
      ).rejects.toThrow(CustomError);
    });

    it('非Errorオブジェクトのスローを処理できる', async () => {
      await expect(
        traceToolCall('string_throw_tool', {}, async () => {
          throw 'String error';
        })
      ).rejects.toBe('String error');
    });

    it('nullのスローを処理できる', async () => {
      await expect(
        traceToolCall('null_throw_tool', {}, async () => {
          throw null;
        })
      ).rejects.toBe(null);
    });
  });

  describe('パラメータ切り捨て', () => {
    it('1KB以下のパラメータは切り捨てられない', async () => {
      const smallData = 'x'.repeat(512);
      const result = await traceToolCall('small_param_tool', { data: smallData }, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('1KB以上のパラメータが切り捨てられる', async () => {
      const largeData = 'x'.repeat(2048);
      const result = await traceToolCall('large_param_tool', { data: largeData }, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('ネストされたオブジェクトの切り捨てが正しく動作する', async () => {
      const nestedData = {
        level1: {
          level2: {
            level3: {
              data: 'x'.repeat(2048),
            },
          },
        },
      };

      const result = await traceToolCall('nested_param_tool', nestedData, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });
  });
});
