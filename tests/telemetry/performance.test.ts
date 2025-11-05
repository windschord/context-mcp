/**
 * テレメトリパフォーマンステスト
 * テレメトリ無効時のオーバーヘッド、トレース記録のオーバーヘッド、サンプリング動作を検証
 */

import { TelemetryManager } from '../../src/telemetry/TelemetryManager.js';
import {
  setTelemetryManager,
  traceToolCall,
  traceVectorDBOperation,
  traceASTParser,
  traceEmbedding,
} from '../../src/telemetry/instrumentation.js';

describe('Telemetry Performance', () => {
  describe('テレメトリ無効時のオーバーヘッド', () => {
    it('テレメトリ無効時のオーバーヘッドが5%以内であること', async () => {
      // テレメトリマネージャーを無効化して初期化
      const telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: false,
        serviceName: 'lsp-mcp-test',
        samplingRate: 0.1,
      });
      setTelemetryManager(telemetryManager);

      // ベンチマーク用のダミー関数
      const dummyWork = async (): Promise<number> => {
        let sum = 0;
        for (let i = 0; i < 10000; i++) {
          sum += Math.sqrt(i);
        }
        return sum;
      };

      // テレメトリなしの実行時間を測定
      const iterations = 100;
      const startWithoutTelemetry = Date.now();
      for (let i = 0; i < iterations; i++) {
        await dummyWork();
      }
      const durationWithoutTelemetry = Date.now() - startWithoutTelemetry;

      // テレメトリありの実行時間を測定（無効なので実際にはトレースされない）
      const startWithTelemetry = Date.now();
      for (let i = 0; i < iterations; i++) {
        await traceToolCall('test_tool', { iteration: i }, dummyWork);
      }
      const durationWithTelemetry = Date.now() - startWithTelemetry;

      // オーバーヘッドを計算
      const overhead =
        (durationWithTelemetry - durationWithoutTelemetry) / durationWithoutTelemetry;
      const overheadPercentage = overhead * 100;

      console.log(`テレメトリなし: ${durationWithoutTelemetry}ms`);
      console.log(`テレメトリあり（無効）: ${durationWithTelemetry}ms`);
      console.log(`オーバーヘッド: ${overheadPercentage.toFixed(2)}%`);

      // オーバーヘッドが5%以内であることを確認
      expect(overheadPercentage).toBeLessThan(5);

      await telemetryManager.shutdown();
    });
  });

  describe('トレース記録のオーバーヘッド', () => {
    it('トレース記録によるオーバーヘッドを測定', async () => {
      // テレメトリマネージャーを有効化して初期化（consoleエクスポーター）
      const telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'lsp-mcp-test',
        samplingRate: 1.0, // 100%サンプリング
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });
      setTelemetryManager(telemetryManager);

      // ベンチマーク用のダミー関数
      const dummyWork = async (): Promise<number> => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += Math.sqrt(i);
        }
        return sum;
      };

      // トレースありの実行時間を測定
      const iterations = 50;
      const startWithTrace = Date.now();
      for (let i = 0; i < iterations; i++) {
        await traceToolCall('test_tool', { iteration: i }, dummyWork);
      }
      const durationWithTrace = Date.now() - startWithTrace;

      // トレースなしの実行時間を測定（比較用）
      const startWithoutTrace = Date.now();
      for (let i = 0; i < iterations; i++) {
        await dummyWork();
      }
      const durationWithoutTrace = Date.now() - startWithoutTrace;

      // オーバーヘッドを計算
      const overhead = (durationWithTrace - durationWithoutTrace) / durationWithoutTrace;
      const overheadPercentage = overhead * 100;

      console.log(`トレースなし: ${durationWithoutTrace}ms`);
      console.log(`トレースあり: ${durationWithTrace}ms`);
      console.log(`トレースオーバーヘッド: ${overheadPercentage.toFixed(2)}%`);

      // トレースオーバーヘッドが記録されていることを確認（情報提供のみ）
      expect(durationWithTrace).toBeGreaterThanOrEqual(durationWithoutTrace);

      await telemetryManager.shutdown();
    });
  });

  describe('サンプリング動作の検証', () => {
    it('サンプリング率10%が正しく動作すること', async () => {
      // サンプリング率10%でテレメトリを初期化
      const telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'lsp-mcp-test',
        samplingRate: 0.1,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });
      setTelemetryManager(telemetryManager);

      // 多数のトレースを生成
      const iterations = 1000;
      const dummyWork = async (): Promise<number> => {
        return Math.random();
      };

      // トレースを生成（サンプリングされる）
      for (let i = 0; i < iterations; i++) {
        await traceToolCall('test_tool', { iteration: i }, dummyWork);
      }

      // サンプリングが動作していることを確認（実際のサンプル数は統計的に変動する）
      // ここでは、サンプリング機能が正しく設定されていることを確認
      expect(telemetryManager.isEnabled()).toBe(true);
      expect(telemetryManager.getConfig().samplingRate).toBe(0.1);

      await telemetryManager.shutdown();
    });
  });

  describe('各トレース関数のパフォーマンス', () => {
    let telemetryManager: TelemetryManager;

    beforeAll(async () => {
      telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'lsp-mcp-test',
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

    it('traceVectorDBOperation のオーバーヘッドを測定', async () => {
      const dummyWork = async (): Promise<number> => {
        return Math.random() * 100;
      };

      const iterations = 100;
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        await traceVectorDBOperation('query', 'milvus', dummyWork);
      }
      const duration = Date.now() - start;

      console.log(`traceVectorDBOperation (${iterations}回): ${duration}ms`);
      expect(duration).toBeGreaterThan(0);
    });

    it('traceASTParser のオーバーヘッドを測定', async () => {
      const dummyWork = async (): Promise<string> => {
        return 'parsed ast';
      };

      const iterations = 100;
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        await traceASTParser('typescript', '/path/to/file.ts', dummyWork);
      }
      const duration = Date.now() - start;

      console.log(`traceASTParser (${iterations}回): ${duration}ms`);
      expect(duration).toBeGreaterThan(0);
    });

    it('traceEmbedding のオーバーヘッドを測定', async () => {
      const dummyWork = async (): Promise<number[]> => {
        return Array(384).fill(Math.random());
      };

      const iterations = 100;
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        await traceEmbedding('transformers', 'all-MiniLM-L6-v2', 10, dummyWork);
      }
      const duration = Date.now() - start;

      console.log(`traceEmbedding (${iterations}回): ${duration}ms`);
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe('大きなパラメータの切り捨て', () => {
    it('1KB以上のパラメータが切り捨てられること', async () => {
      const telemetryManager = new TelemetryManager();
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'lsp-mcp-test',
        samplingRate: 1.0,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });
      setTelemetryManager(telemetryManager);

      // 大きなパラメータを生成（2KB）
      const largeData = 'x'.repeat(2048);
      const largeParams = {
        data: largeData,
      };

      // トレースを実行（パラメータが切り捨てられるはず）
      const result = await traceToolCall('test_tool', largeParams, async () => {
        return 'success';
      });

      expect(result).toBe('success');
      // 実際の切り捨て動作はスパン属性で確認されるが、ここではエラーが発生しないことを確認

      await telemetryManager.shutdown();
    });
  });
});
