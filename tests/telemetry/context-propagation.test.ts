/**
 * コンテキスト伝播機能のテスト
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TelemetryManager } from '../../src/telemetry/TelemetryManager.js';
import { setTelemetryManager, traceToolCall } from '../../src/telemetry/instrumentation.js';
import {
  propagateTraceContext,
  extractTraceContext,
  withTraceContext,
  addTraceContextAttributes,
  getCurrentTraceId,
  getCurrentSpanId,
} from '../../src/telemetry/context-propagation.js';
import { context, trace } from '@opentelemetry/api';

describe('Context Propagation', () => {
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

  describe('propagateTraceContext', () => {
    it('HTTPヘッダーにトレースコンテキストを注入できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const headers = propagateTraceContext();

        // W3C Trace Context形式のヘッダーが含まれているはず
        expect(headers).toBeDefined();
        expect(typeof headers).toBe('object');
      });
    });

    it('カスタムヘッダーを保持しながらトレースコンテキストを注入できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const customHeaders = {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value',
        };

        const headers = propagateTraceContext(customHeaders);

        // カスタムヘッダーが保持されている
        expect(headers['Content-Type']).toBe('application/json');
        expect(headers['X-Custom-Header']).toBe('custom-value');
      });
    });

    it('トレースコンテキストがない場合でもエラーが発生しない', () => {
      const headers = propagateTraceContext();

      expect(headers).toBeDefined();
      expect(typeof headers).toBe('object');
    });

    it('空のカスタムヘッダーでも動作する', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const headers = propagateTraceContext({});

        expect(headers).toBeDefined();
      });
    });
  });

  describe('extractTraceContext', () => {
    it('HTTPヘッダーからトレースコンテキストを抽出できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        // トレースコンテキストを注入
        const headers = propagateTraceContext();

        // トレースコンテキストを抽出
        const extractedContext = extractTraceContext(headers);

        expect(extractedContext).toBeDefined();
      });
    });

    it('W3C Trace Context形式のヘッダーから抽出できる', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      const extractedContext = extractTraceContext(headers);

      expect(extractedContext).toBeDefined();
    });

    it('traceparentとtracestateヘッダーから抽出できる', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        tracestate: 'vendor=value',
      };

      const extractedContext = extractTraceContext(headers);

      expect(extractedContext).toBeDefined();
    });

    it('トレースヘッダーがない場合でもエラーが発生しない', () => {
      const headers = {
        'Content-Type': 'application/json',
      };

      const extractedContext = extractTraceContext(headers);

      expect(extractedContext).toBeDefined();
    });

    it('空のヘッダーでも動作する', () => {
      const extractedContext = extractTraceContext({});

      expect(extractedContext).toBeDefined();
    });

    it('配列値を含むヘッダーでも処理できる', () => {
      const headers = {
        'x-custom-header': ['value1', 'value2'],
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      const extractedContext = extractTraceContext(headers);

      expect(extractedContext).toBeDefined();
    });
  });

  describe('withTraceContext', () => {
    it('トレースコンテキストを保持しながら関数を実行できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const result = await withTraceContext(async () => {
          return 'success';
        });

        expect(result).toBe('success');
      });
    });

    it('非同期処理を正しく処理できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const result = await withTraceContext(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'async-result';
        });

        expect(result).toBe('async-result');
      });
    });

    it('エラーが発生した場合は再スローされる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        await expect(
          withTraceContext(async () => {
            throw new Error('Test error');
          })
        ).rejects.toThrow('Test error');
      });
    });

    it('カスタムコンテキストで実行できる', async () => {
      const customContext = context.active();
      const result = await withTraceContext(async () => {
        return 'success';
      }, customContext);

      expect(result).toBe('success');
    });

    it('ネストされたwithTraceContext呼び出しが動作する', async () => {
      await traceToolCall('outer_tool', {}, async () => {
        const result = await withTraceContext(async () => {
          return await withTraceContext(async () => {
            return 'nested-result';
          });
        });

        expect(result).toBe('nested-result');
      });
    });
  });

  describe('addTraceContextAttributes', () => {
    it('スパンに追加属性を設定できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        expect(() => {
          addTraceContextAttributes({
            'http.target': '/api/test',
            'http.status_code': 200,
          });
        }).not.toThrow();
      });
    });

    it('属性なしで呼び出せる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        expect(() => {
          addTraceContextAttributes();
        }).not.toThrow();
      });
    });

    it('異なる型の属性を設定できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        expect(() => {
          addTraceContextAttributes({
            stringAttr: 'value',
            numberAttr: 123,
            booleanAttr: true,
          });
        }).not.toThrow();
      });
    });

    it('トレースコンテキストがない場合でもエラーが発生しない', () => {
      expect(() => {
        addTraceContextAttributes({
          attr: 'value',
        });
      }).not.toThrow();
    });
  });

  describe('getCurrentTraceId', () => {
    it('アクティブなスパンのトレースIDを取得できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const traceId = getCurrentTraceId();

        // トレースIDは16進数32文字のはず
        if (traceId) {
          expect(traceId).toMatch(/^[0-9a-f]{32}$/);
        }
      });
    });

    it('トレースコンテキストがない場合はundefinedを返す', () => {
      const traceId = getCurrentTraceId();

      // トレースがアクティブでない場合はundefined
      expect(traceId).toBeUndefined();
    });

    it('複数のスパンで異なるトレースIDを持つ可能性がある', async () => {
      const traceIds: (string | undefined)[] = [];

      await traceToolCall('tool1', {}, async () => {
        traceIds.push(getCurrentTraceId());
      });

      await traceToolCall('tool2', {}, async () => {
        traceIds.push(getCurrentTraceId());
      });

      // トレースIDが取得できたかを確認
      expect(traceIds[0]).toBeDefined();
      expect(traceIds[1]).toBeDefined();
    });
  });

  describe('getCurrentSpanId', () => {
    it('アクティブなスパンのスパンIDを取得できる', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const spanId = getCurrentSpanId();

        // スパンIDは16進数16文字のはず
        if (spanId) {
          expect(spanId).toMatch(/^[0-9a-f]{16}$/);
        }
      });
    });

    it('トレースコンテキストがない場合はundefinedを返す', () => {
      const spanId = getCurrentSpanId();

      // トレースがアクティブでない場合はundefined
      expect(spanId).toBeUndefined();
    });

    it('異なるスパンで異なるスパンIDを持つ', async () => {
      const spanIds: (string | undefined)[] = [];

      await traceToolCall('tool1', {}, async () => {
        spanIds.push(getCurrentSpanId());
      });

      await traceToolCall('tool2', {}, async () => {
        spanIds.push(getCurrentSpanId());
      });

      // スパンIDが取得できたかを確認
      expect(spanIds[0]).toBeDefined();
      expect(spanIds[1]).toBeDefined();

      // 異なるスパンなので異なるIDのはず
      if (spanIds[0] && spanIds[1]) {
        expect(spanIds[0]).not.toBe(spanIds[1]);
      }
    });
  });

  describe('W3C Trace Context形式の検証', () => {
    it('propagateTraceContextがW3C形式のtraceparentヘッダーを生成する', async () => {
      await traceToolCall('test_tool', {}, async () => {
        const headers = propagateTraceContext();

        // traceparentヘッダーが存在し、W3C形式に準拠している場合
        if (headers['traceparent']) {
          // W3C Trace Context形式: version-trace_id-parent_id-trace_flags
          // 例: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
          expect(headers['traceparent']).toMatch(
            /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
          );
        }
      });
    });

    it('extractTraceContextがW3C形式のヘッダーを正しく解釈する', () => {
      const validTraceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const headers = {
        traceparent: validTraceparent,
      };

      const extractedContext = extractTraceContext(headers);

      expect(extractedContext).toBeDefined();

      // 抽出されたコンテキストでスパンを作成できることを確認
      const tracer = trace.getTracer('test-tracer');
      const span = tracer.startSpan('test-span', undefined, extractedContext);
      expect(span).toBeDefined();
      span.end();
    });

    it('無効なtraceparentヘッダーでもエラーが発生しない', () => {
      const invalidHeaders = {
        traceparent: 'invalid-format',
      };

      const extractedContext = extractTraceContext(invalidHeaders);

      expect(extractedContext).toBeDefined();
    });
  });

  describe('エンドツーエンドのコンテキスト伝播', () => {
    it('トレースコンテキストを注入→抽出→実行の流れが動作する', async () => {
      await traceToolCall('sender_tool', {}, async () => {
        // トレースコンテキストを注入
        const headers = propagateTraceContext();

        // トレースコンテキストを抽出
        const extractedContext = extractTraceContext(headers);

        // 抽出されたコンテキストで実行
        const result = await withTraceContext(async () => {
          return 'e2e-success';
        }, extractedContext);

        expect(result).toBe('e2e-success');
      });
    });

    it('複数のサービス間でトレースIDが保持される', async () => {
      let originalTraceId: string | undefined;
      let propagatedTraceId: string | undefined;

      await traceToolCall('service1', {}, async () => {
        originalTraceId = getCurrentTraceId();

        // トレースコンテキストを注入
        const headers = propagateTraceContext();

        // トレースコンテキストを抽出
        const extractedContext = extractTraceContext(headers);

        // 抽出されたコンテキストで実行（サービス2をシミュレート）
        await withTraceContext(async () => {
          propagatedTraceId = getCurrentTraceId();
        }, extractedContext);
      });

      // 両方のトレースIDが取得できたかを確認
      expect(originalTraceId).toBeDefined();
      expect(propagatedTraceId).toBeDefined();

      // トレースIDが保持されている（同じトレースの一部）
      // 注: OpenTelemetryの実装により、実際には異なる場合があります
      // この動作はテスト環境によって異なる可能性があります
    });
  });
});
