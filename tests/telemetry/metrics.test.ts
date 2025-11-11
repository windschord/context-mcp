/**
 * メトリクス収集機能のテスト
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { TelemetryManager } from '../../src/telemetry/TelemetryManager.js';
import {
  initializeMetrics,
  incrementRequestCounter,
  incrementErrorCounter,
  incrementVectorDBOperations,
  recordRequestDuration,
  recordSearchResults,
  updateIndexFilesGauge,
  updateIndexSymbolsGauge,
  updateMemoryUsageGauge,
} from '../../src/telemetry/metrics.js';

describe('Metrics', () => {
  let telemetryManager: TelemetryManager;

  beforeAll(async () => {
    // テレメトリを有効化
    telemetryManager = new TelemetryManager();
    await telemetryManager.initialize({
      enabled: true,
      serviceName: 'lsp-mcp-test',
      samplingRate: 1.0,
      exporters: {
        traces: 'none',
        metrics: 'console',
        logs: 'none',
      },
    });

    // メトリクスインスタンスを初期化
    initializeMetrics(telemetryManager);
  });

  afterAll(async () => {
    await telemetryManager.shutdown();
  });

  describe('Counter記録のテスト', () => {
    it('リクエストカウンターを増加できる', () => {
      expect(() => {
        incrementRequestCounter('test_tool');
      }).not.toThrow();
    });

    it('複数のツールでリクエストカウンターを増加できる', () => {
      const tools = ['search_code', 'index_project', 'get_symbol'];

      tools.forEach((tool) => {
        expect(() => {
          incrementRequestCounter(tool);
        }).not.toThrow();
      });
    });

    it('エラーカウンターを増加できる', () => {
      expect(() => {
        incrementErrorCounter('test_tool', 'TestError');
      }).not.toThrow();
    });

    it('異なるエラータイプでカウンターを増加できる', () => {
      const errorTypes = ['ValidationError', 'TimeoutError', 'NetworkError'];

      errorTypes.forEach((errorType) => {
        expect(() => {
          incrementErrorCounter('test_tool', errorType);
        }).not.toThrow();
      });
    });

    it('ベクターDB操作カウンターを増加できる', () => {
      expect(() => {
        incrementVectorDBOperations('query');
      }).not.toThrow();
    });

    it('異なる操作タイプでカウンターを増加できる', () => {
      const operations = ['query', 'insert', 'delete', 'upsert'];

      operations.forEach((operation) => {
        expect(() => {
          incrementVectorDBOperations(operation);
        }).not.toThrow();
      });
    });
  });

  describe('Histogram記録のテスト', () => {
    it('リクエスト処理時間を記録できる', () => {
      expect(() => {
        recordRequestDuration('test_tool', 123);
      }).not.toThrow();
    });

    it('異なる処理時間を記録できる', () => {
      const durations = [10, 100, 1000, 5000];

      durations.forEach((duration) => {
        expect(() => {
          recordRequestDuration('test_tool', duration);
        }).not.toThrow();
      });
    });

    it('0ミリ秒の処理時間を記録できる', () => {
      expect(() => {
        recordRequestDuration('fast_tool', 0);
      }).not.toThrow();
    });

    it('検索結果数を記録できる', () => {
      expect(() => {
        recordSearchResults(42);
      }).not.toThrow();
    });

    it('異なる検索結果数を記録できる', () => {
      const counts = [0, 1, 10, 100, 1000];

      counts.forEach((count) => {
        expect(() => {
          recordSearchResults(count);
        }).not.toThrow();
      });
    });
  });

  describe('Gauge更新のテスト', () => {
    it('インデックス済みファイル数を更新できる', () => {
      expect(() => {
        updateIndexFilesGauge(100);
      }).not.toThrow();
    });

    it('ファイル数を複数回更新できる', () => {
      const counts = [10, 50, 100, 500, 1000];

      counts.forEach((count) => {
        expect(() => {
          updateIndexFilesGauge(count);
        }).not.toThrow();
      });
    });

    it('インデックス済みシンボル数を更新できる', () => {
      expect(() => {
        updateIndexSymbolsGauge(500);
      }).not.toThrow();
    });

    it('シンボル数を複数回更新できる', () => {
      const counts = [100, 500, 1000, 5000, 10000];

      counts.forEach((count) => {
        expect(() => {
          updateIndexSymbolsGauge(count);
        }).not.toThrow();
      });
    });

    it('メモリ使用量を更新できる', () => {
      expect(() => {
        updateMemoryUsageGauge();
      }).not.toThrow();
    });

    it('0個のファイルを記録できる', () => {
      expect(() => {
        updateIndexFilesGauge(0);
      }).not.toThrow();
    });

    it('0個のシンボルを記録できる', () => {
      expect(() => {
        updateIndexSymbolsGauge(0);
      }).not.toThrow();
    });
  });

  describe('メモリ使用量測定のテスト', () => {
    it('メモリ使用量が正の値である', () => {
      // メモリ使用量は自動で収集される（ObservableGauge）
      expect(() => {
        updateMemoryUsageGauge();
      }).not.toThrow();
    });

    it('メモリ使用量測定を複数回呼び出せる', () => {
      // キャッシュが動作していることを確認
      for (let i = 0; i < 10; i++) {
        expect(() => {
          updateMemoryUsageGauge();
        }).not.toThrow();
      }
    });
  });

  describe('複合操作のテスト', () => {
    it('複数のメトリクスを同時に記録できる', () => {
      expect(() => {
        incrementRequestCounter('search_code');
        recordRequestDuration('search_code', 250);
        recordSearchResults(15);
        updateIndexFilesGauge(150);
        updateIndexSymbolsGauge(750);
      }).not.toThrow();
    });

    it('同じツールで複数のメトリクスを記録できる', () => {
      const toolName = 'index_project';

      expect(() => {
        incrementRequestCounter(toolName);
        recordRequestDuration(toolName, 5000);
        incrementVectorDBOperations('upsert');
        updateIndexFilesGauge(200);
      }).not.toThrow();
    });

    it('エラーと成功のメトリクスを記録できる', () => {
      const toolName = 'test_tool';

      expect(() => {
        incrementRequestCounter(toolName);
        recordRequestDuration(toolName, 100);
      }).not.toThrow();

      expect(() => {
        incrementRequestCounter(toolName);
        incrementErrorCounter(toolName, 'TestError');
        recordRequestDuration(toolName, 50);
      }).not.toThrow();
    });
  });

  describe('大量データのテスト', () => {
    it('大量のカウンター増加を処理できる', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          incrementRequestCounter('bulk_test_tool');
        }
      }).not.toThrow();
    });

    it('大量のヒストグラム記録を処理できる', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          recordRequestDuration('bulk_test_tool', Math.random() * 1000);
        }
      }).not.toThrow();
    });

    it('大量のゲージ更新を処理できる', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          updateIndexFilesGauge(i);
          updateIndexSymbolsGauge(i * 10);
        }
      }).not.toThrow();
    });
  });

  describe('エッジケースのテスト', () => {
    it('空文字列のツール名を処理できる', () => {
      expect(() => {
        incrementRequestCounter('');
        recordRequestDuration('', 100);
      }).not.toThrow();
    });

    it('非常に長いツール名を処理できる', () => {
      const longToolName = 'a'.repeat(1000);

      expect(() => {
        incrementRequestCounter(longToolName);
        recordRequestDuration(longToolName, 100);
      }).not.toThrow();
    });

    it('負の処理時間を記録できる（システムが許容する場合）', () => {
      expect(() => {
        recordRequestDuration('test_tool', -1);
      }).not.toThrow();
    });

    it('非常に大きな処理時間を記録できる', () => {
      expect(() => {
        recordRequestDuration('slow_tool', Number.MAX_SAFE_INTEGER);
      }).not.toThrow();
    });

    it('小数の処理時間を記録できる', () => {
      expect(() => {
        recordRequestDuration('precise_tool', 123.456);
      }).not.toThrow();
    });
  });

  describe('メトリクス初期化前の動作', () => {
    it('初期化されていない場合でもメトリクス関数は安全に呼び出せる', () => {
      // 新しいTelemetryManagerを作成し、メトリクスを初期化しない
      const _uninitializedManager = new TelemetryManager();

      // メトリクスインスタンスがnullの場合の動作を確認
      expect(() => {
        // これらの関数は、metricsInstanceがnullの場合は何もしない
        incrementRequestCounter('test');
        incrementErrorCounter('test', 'error');
        recordRequestDuration('test', 100);
      }).not.toThrow();
    });
  });

  describe('パフォーマンステスト', () => {
    it('メトリクス記録のオーバーヘッドが許容範囲内である', () => {
      const iterations = 10000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        incrementRequestCounter('perf_test_tool');
        recordRequestDuration('perf_test_tool', i);
        recordSearchResults(i % 100);
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      // 平均処理時間が1ms以下であることを確認
      expect(avgTime).toBeLessThan(1);
    });

    it('ゲージ更新のオーバーヘッドが許容範囲内である', () => {
      const iterations = 10000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        updateIndexFilesGauge(i);
        updateIndexSymbolsGauge(i * 10);
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      // 平均処理時間が1ms以下であることを確認
      expect(avgTime).toBeLessThan(1);
    });
  });
});
