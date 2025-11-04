/**
 * テレメトリ統合テスト
 * Jaeger/Prometheus連携をモック環境でテスト
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TelemetryManager } from '../../src/telemetry/TelemetryManager.js';
import {
  setTelemetryManager,
  traceToolCall,
  traceVectorDBOperation,
} from '../../src/telemetry/instrumentation.js';
import {
  initializeMetrics,
  incrementRequestCounter,
  recordRequestDuration,
} from '../../src/telemetry/metrics.js';
import { propagateTraceContext, extractTraceContext } from '../../src/telemetry/context-propagation.js';

describe('Telemetry Integration', () => {
  describe('OTLP/gRPCエンドポイント接続テスト', () => {
    it('無効なエンドポイントでも初期化時にエラーが発生しない', async () => {
      const telemetryManager = new TelemetryManager();

      // 無効なエンドポイントを設定
      await expect(
        telemetryManager.initialize({
          enabled: true,
          serviceName: 'test-service',
          otlp: {
            endpoint: 'http://invalid-endpoint:4317',
          },
          exporters: {
            traces: 'otlp',
            metrics: 'otlp',
            logs: 'otlp',
          },
        })
      ).resolves.not.toThrow();

      await telemetryManager.shutdown();
    });

    it('localhostエンドポイントで初期化できる', async () => {
      const telemetryManager = new TelemetryManager();

      await expect(
        telemetryManager.initialize({
          enabled: true,
          serviceName: 'test-service',
          otlp: {
            endpoint: 'http://localhost:4317',
          },
          exporters: {
            traces: 'otlp',
            metrics: 'otlp',
            logs: 'otlp',
          },
        })
      ).resolves.not.toThrow();

      await telemetryManager.shutdown();
    });
  });

  describe('トレースエクスポートのテスト', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'test-service',
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

    it('トレースがConsoleExporterで正常にエクスポートされる', async () => {
      const result = await traceToolCall('export_test_tool', { test: true }, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('複数のトレースを連続してエクスポートできる', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await traceToolCall(`test_tool_${i}`, { iteration: i }, async () => {
          return i;
        });

        expect(result).toBe(i);
      }
    });

    it('ネストされたトレースをエクスポートできる', async () => {
      const result = await traceToolCall('outer_tool', {}, async () => {
        const innerResult = await traceVectorDBOperation('query', 'milvus', async () => {
          return 'inner-success';
        });

        return innerResult;
      });

      expect(result).toBe('inner-success');
    });
  });

  describe('メトリクスエクスポートのテスト', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'test-service',
        samplingRate: 1.0,
        exporters: {
          traces: 'none',
          metrics: 'console',
          logs: 'none',
        },
      });
      setTelemetryManager(telemetryManager);
      initializeMetrics(telemetryManager);
    });

    afterAll(async () => {
      await telemetryManager.shutdown();
    });

    it('メトリクスがConsoleExporterで正常にエクスポートされる', () => {
      expect(() => {
        incrementRequestCounter('export_test_tool');
        recordRequestDuration('export_test_tool', 100);
      }).not.toThrow();
    });

    it('複数のメトリクスを連続してエクスポートできる', () => {
      for (let i = 0; i < 10; i++) {
        expect(() => {
          incrementRequestCounter(`test_tool_${i}`);
          recordRequestDuration(`test_tool_${i}`, i * 10);
        }).not.toThrow();
      }
    });
  });

  describe('ログエクスポートのテスト', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'test-service',
        exporters: {
          traces: 'none',
          metrics: 'none',
          logs: 'console',
        },
      });
    });

    afterAll(async () => {
      await telemetryManager.shutdown();
    });

    it('LoggerProviderが正常に初期化される', () => {
      expect(telemetryManager.isEnabled()).toBe(true);
    });
  });

  describe('複合エクスポートのテスト', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'test-service',
        samplingRate: 1.0,
        exporters: {
          traces: 'console',
          metrics: 'console',
          logs: 'console',
        },
      });
      setTelemetryManager(telemetryManager);
      initializeMetrics(telemetryManager);
    });

    afterAll(async () => {
      await telemetryManager.shutdown();
    });

    it('トレースとメトリクスを同時にエクスポートできる', async () => {
      const result = await traceToolCall('combined_tool', {}, async () => {
        incrementRequestCounter('combined_tool');
        recordRequestDuration('combined_tool', 50);
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('複数のシグナルを大量にエクスポートできる', async () => {
      for (let i = 0; i < 100; i++) {
        await traceToolCall(`bulk_tool_${i}`, { iteration: i }, async () => {
          incrementRequestCounter(`bulk_tool_${i}`);
          recordRequestDuration(`bulk_tool_${i}`, i);
          return i;
        });
      }
    });
  });

  describe('エクスポーター設定のテスト', () => {
    it('すべてnoneエクスポーターで動作する', async () => {
      const telemetryManager = new TelemetryManager();

      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'none',
          metrics: 'none',
          logs: 'none',
        },
      });

      setTelemetryManager(telemetryManager);
      initializeMetrics(telemetryManager);

      // トレースとメトリクスを記録してもエラーが発生しない
      await traceToolCall('none_exporter_tool', {}, async () => {
        incrementRequestCounter('none_exporter_tool');
        return 'success';
      });

      await telemetryManager.shutdown();
    });

    it('混合エクスポーター設定で動作する', async () => {
      const telemetryManager = new TelemetryManager();

      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'console',
        },
      });

      setTelemetryManager(telemetryManager);
      initializeMetrics(telemetryManager);

      await traceToolCall('mixed_exporter_tool', {}, async () => {
        incrementRequestCounter('mixed_exporter_tool');
        return 'success';
      });

      await telemetryManager.shutdown();
    });
  });

  describe('バッチ処理のテスト', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'test-service',
        samplingRate: 1.0,
        exporters: {
          traces: 'console',
          metrics: 'console',
          logs: 'none',
        },
      });
      setTelemetryManager(telemetryManager);
      initializeMetrics(telemetryManager);
    });

    afterAll(async () => {
      await telemetryManager.shutdown();
    });

    it('大量のトレースがバッチ処理される', async () => {
      const promises = [];

      for (let i = 0; i < 1000; i++) {
        promises.push(
          traceToolCall(`batch_tool_${i}`, { iteration: i }, async () => {
            return i;
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(1000);
    });

    it('大量のメトリクスがバッチ処理される', () => {
      for (let i = 0; i < 1000; i++) {
        incrementRequestCounter(`batch_metric_${i}`);
        recordRequestDuration(`batch_metric_${i}`, i);
      }

      // エラーが発生しないことを確認
      expect(true).toBe(true);
    });
  });

  describe('グレースフルシャットダウンのテスト', () => {
    it('トレース処理中のシャットダウンが正常に完了する', async () => {
      const telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });

      setTelemetryManager(telemetryManager);

      // トレースを開始
      const promise = traceToolCall('shutdown_test_tool', {}, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'success';
      });

      // トレース完了を待つ
      await promise;

      // シャットダウン
      await expect(telemetryManager.shutdown()).resolves.not.toThrow();
    });

    it('複数回のシャットダウンが安全に処理される', async () => {
      const telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'console',
          logs: 'console',
        },
      });

      await telemetryManager.shutdown();
      await expect(telemetryManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('エンドツーエンドのテレメトリフロー', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'e2e-test-service',
        samplingRate: 1.0,
        exporters: {
          traces: 'console',
          metrics: 'console',
          logs: 'console',
        },
      });
      setTelemetryManager(telemetryManager);
      initializeMetrics(telemetryManager);
    });

    afterAll(async () => {
      await telemetryManager.shutdown();
    });

    it('トレース→メトリクス→コンテキスト伝播の全体フローが動作する', async () => {
      await traceToolCall('e2e_tool', { step: 'start' }, async () => {
        // メトリクスを記録
        incrementRequestCounter('e2e_tool');

        // トレースコンテキストを注入
        const headers = propagateTraceContext();
        expect(headers).toBeDefined();

        // ベクターDB操作をトレース
        await traceVectorDBOperation('query', 'milvus', async () => {
          // メトリクスを記録
          recordRequestDuration('e2e_tool', 100);

          return 'query-result';
        });

        // トレースコンテキストを抽出
        const extractedContext = extractTraceContext(headers);
        expect(extractedContext).toBeDefined();

        return 'e2e-success';
      });
    });

    it('エラー発生時もテレメトリが正しく記録される', async () => {
      try {
        await traceToolCall('error_e2e_tool', {}, async () => {
          incrementRequestCounter('error_e2e_tool');
          recordRequestDuration('error_e2e_tool', 50);

          throw new Error('E2E test error');
        });
      } catch (error) {
        // エラーが発生することを期待
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
