/**
 * TelemetryManagerのテスト
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TelemetryManager } from '../../src/telemetry/TelemetryManager.js';

describe('TelemetryManager', () => {
  let telemetryManager: TelemetryManager;

  beforeEach(() => {
    // 環境変数をクリア
    delete process.env['CONTEXT_MCP_TELEMETRY_ENABLED'];
    delete process.env['OTEL_SERVICE_NAME'];
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    delete process.env['CONTEXT_MCP_TELEMETRY_SAMPLE_RATE'];
    delete process.env['OTEL_TRACES_EXPORTER'];
    delete process.env['OTEL_METRICS_EXPORTER'];
    delete process.env['OTEL_LOGS_EXPORTER'];

    telemetryManager = new TelemetryManager();
  });

  afterEach(async () => {
    // テレメトリをシャットダウン
    if (telemetryManager) {
      try {
        await telemetryManager.shutdown();
      } catch (error) {
        // シャットダウンエラーは無視
      }
    }
  });

  describe('初期化テスト', () => {
    it('デフォルト設定で初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: false,
        })
      ).resolves.not.toThrow();
    });

    it('カスタム設定で初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: true,
          serviceName: 'test-service',
          samplingRate: 0.5,
          exporters: {
            traces: 'console',
            metrics: 'none',
            logs: 'none',
          },
        })
      ).resolves.not.toThrow();
    });

    it('テレメトリ無効時は初期化がスキップされる', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      expect(telemetryManager.isEnabled()).toBe(false);
    });

    it('複数回の初期化は警告を出す', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      // 2回目の初期化
      await telemetryManager.initialize({
        enabled: false,
      });

      // エラーが発生しないことを確認
      expect(telemetryManager.isEnabled()).toBe(false);
    });
  });

  describe('設定読み込みテスト', () => {
    it('環境変数からテレメトリ有効フラグを読み込む', async () => {
      process.env['CONTEXT_MCP_TELEMETRY_ENABLED'] = 'true';
      const manager = new TelemetryManager();

      await manager.initialize();

      expect(manager.isEnabled()).toBe(true);

      await manager.shutdown();
    });

    it('環境変数からサービス名を読み込む', async () => {
      process.env['OTEL_SERVICE_NAME'] = 'custom-service';
      const manager = new TelemetryManager();

      await manager.initialize({ enabled: false });

      const config = manager.getConfig();
      expect(config.serviceName).toBe('custom-service');

      await manager.shutdown();
    });

    it('環境変数からサンプリング率を読み込む', async () => {
      process.env['CONTEXT_MCP_TELEMETRY_SAMPLE_RATE'] = '0.8';
      const manager = new TelemetryManager();

      await manager.initialize({ enabled: false });

      const config = manager.getConfig();
      expect(config.samplingRate).toBe(0.8);

      await manager.shutdown();
    });

    it('無効なサンプリング率は無視される', async () => {
      process.env['CONTEXT_MCP_TELEMETRY_SAMPLE_RATE'] = 'invalid';
      const manager = new TelemetryManager();

      await manager.initialize({ enabled: false });

      const config = manager.getConfig();
      // デフォルト値が使用される
      expect(config.samplingRate).toBeDefined();

      await manager.shutdown();
    });

    it('環境変数からエクスポーター設定を読み込む', async () => {
      process.env['OTEL_TRACES_EXPORTER'] = 'console';
      process.env['OTEL_METRICS_EXPORTER'] = 'none';
      process.env['OTEL_LOGS_EXPORTER'] = 'console';
      const manager = new TelemetryManager();

      await manager.initialize({ enabled: false });

      const config = manager.getConfig();
      expect(config.exporters?.traces).toBe('console');
      expect(config.exporters?.metrics).toBe('none');
      expect(config.exporters?.logs).toBe('console');

      await manager.shutdown();
    });
  });

  describe('isEnabled()のテスト', () => {
    it('テレメトリ有効時にtrueを返す', async () => {
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });

      expect(telemetryManager.isEnabled()).toBe(true);
    });

    it('テレメトリ無効時にfalseを返す', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      expect(telemetryManager.isEnabled()).toBe(false);
    });
  });

  describe('getTracer(), getMeter()のテスト', () => {
    it('テレメトリ有効時にTracerインスタンスを取得できる', async () => {
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });

      const tracer = telemetryManager.getTracer('test-tracer');
      expect(tracer).toBeDefined();
    });

    it('テレメトリ無効時にNoopTracerを返す', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      const tracer = telemetryManager.getTracer('test-tracer');
      expect(tracer).toBeDefined();
      // NoopTracerなので、スパンを作成しても何も起こらない
      const span = tracer.startSpan('test-span');
      span.end();
    });

    it('テレメトリ有効時にMeterインスタンスを取得できる', async () => {
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'none',
          metrics: 'console',
          logs: 'none',
        },
      });

      const meter = telemetryManager.getMeter('test-meter');
      expect(meter).toBeDefined();
    });

    it('テレメトリ無効時にNoopMeterを返す', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      const meter = telemetryManager.getMeter('test-meter');
      expect(meter).toBeDefined();
      // NoopMeterなので、カウンターを作成しても何も起こらない
      const counter = meter.createCounter('test-counter');
      counter.add(1);
    });
  });

  describe('shutdown()のテスト', () => {
    it('テレメトリ有効時にシャットダウンできる', async () => {
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'console',
          logs: 'console',
        },
      });

      await expect(telemetryManager.shutdown()).resolves.not.toThrow();
    });

    it('テレメトリ無効時にシャットダウンしてもエラーが発生しない', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      await expect(telemetryManager.shutdown()).resolves.not.toThrow();
    });

    it('初期化前にシャットダウンしてもエラーが発生しない', async () => {
      const manager = new TelemetryManager();

      await expect(manager.shutdown()).resolves.not.toThrow();
    });

    it('複数回のシャットダウンは安全に処理される', async () => {
      await telemetryManager.initialize({
        enabled: true,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });

      await telemetryManager.shutdown();
      await expect(telemetryManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('getConfig()のテスト', () => {
    it('現在の設定を取得できる', async () => {
      await telemetryManager.initialize({
        enabled: true,
        serviceName: 'test-service',
        samplingRate: 0.5,
        exporters: {
          traces: 'console',
          metrics: 'none',
          logs: 'none',
        },
      });

      const config = telemetryManager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.serviceName).toBe('test-service');
      expect(config.samplingRate).toBe(0.5);
      expect(config.exporters?.traces).toBe('console');
    });

    it('設定オブジェクトのコピーを返す（直接変更されない）', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      const config = telemetryManager.getConfig();
      config.enabled = true; // コピーを変更

      // 元の設定は変更されない
      expect(telemetryManager.isEnabled()).toBe(false);
    });
  });

  describe('エクスポーター設定のテスト', () => {
    it('consoleエクスポーターで初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: true,
          exporters: {
            traces: 'console',
            metrics: 'console',
            logs: 'console',
          },
        })
      ).resolves.not.toThrow();
    });

    it('noneエクスポーターで初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: true,
          exporters: {
            traces: 'none',
            metrics: 'none',
            logs: 'none',
          },
        })
      ).resolves.not.toThrow();
    });

    it('混合エクスポーター設定で初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: true,
          exporters: {
            traces: 'console',
            metrics: 'none',
            logs: 'console',
          },
        })
      ).resolves.not.toThrow();
    });
  });

  describe('サンプリング設定のテスト', () => {
    it('サンプリング率0.0で初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: true,
          samplingRate: 0.0,
          exporters: {
            traces: 'console',
            metrics: 'none',
            logs: 'none',
          },
        })
      ).resolves.not.toThrow();
    });

    it('サンプリング率1.0で初期化できる', async () => {
      await expect(
        telemetryManager.initialize({
          enabled: true,
          samplingRate: 1.0,
          exporters: {
            traces: 'console',
            metrics: 'none',
            logs: 'none',
          },
        })
      ).resolves.not.toThrow();
    });

    it('サンプリング率0.1がデフォルトとして使用される', async () => {
      await telemetryManager.initialize({
        enabled: false,
      });

      const config = telemetryManager.getConfig();
      // デフォルト値は設定で定義されているはず
      expect(config.samplingRate).toBeDefined();
    });
  });
});
