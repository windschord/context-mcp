import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import {
  ConsoleSpanExporter,
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { trace, Tracer, metrics, Meter } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { TelemetryConfig, DEFAULT_TELEMETRY_CONFIG, ExporterType } from './types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OpenTelemetryテレメトリ管理クラス
 * SDK初期化、設定読み込み、条件付き有効化を管理
 */
export class TelemetryManager {
  private sdk?: NodeSDK;
  private loggerProvider?: LoggerProvider;
  private config: TelemetryConfig;
  private initialized = false;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * 設定を読み込む
   * 優先順位: 環境変数 > 設定ファイル > デフォルト
   */
  private loadConfig(): TelemetryConfig {
    // デフォルト設定から開始
    const config: TelemetryConfig = { ...DEFAULT_TELEMETRY_CONFIG };

    // 環境変数からの読み込み
    if (process.env['LSP_MCP_TELEMETRY_ENABLED'] !== undefined) {
      config.enabled = process.env['LSP_MCP_TELEMETRY_ENABLED']?.toLowerCase() === 'true';
    }

    if (process.env['OTEL_SERVICE_NAME']) {
      config.serviceName = process.env['OTEL_SERVICE_NAME'];
    }

    if (process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
      config.otlp = {
        ...config.otlp!,
        endpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'],
      };
    }

    if (process.env['LSP_MCP_TELEMETRY_SAMPLE_RATE']) {
      const rate = parseFloat(process.env['LSP_MCP_TELEMETRY_SAMPLE_RATE']);
      if (!isNaN(rate) && rate >= 0 && rate <= 1) {
        config.samplingRate = rate;
      }
    }

    if (process.env['OTEL_TRACES_EXPORTER']) {
      if (!config.exporters) {
        config.exporters = {};
      }
      config.exporters.traces = process.env['OTEL_TRACES_EXPORTER'] as ExporterType;
    }

    if (process.env['OTEL_METRICS_EXPORTER']) {
      if (!config.exporters) {
        config.exporters = {};
      }
      config.exporters.metrics = process.env['OTEL_METRICS_EXPORTER'] as ExporterType;
    }

    if (process.env['OTEL_LOGS_EXPORTER']) {
      if (!config.exporters) {
        config.exporters = {};
      }
      config.exporters.logs = process.env['OTEL_LOGS_EXPORTER'] as ExporterType;
    }

    // 設定ファイルからの読み込み（.lsp-mcp.json）
    try {
      const configPath = process.env['LSP_MCP_CONFIG_PATH'] || '.lsp-mcp.json';
      const fullPath = path.resolve(process.cwd(), configPath);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const fileConfig = JSON.parse(fileContent);

        if (fileConfig.telemetry) {
          // 設定ファイルの値で上書き（環境変数が優先）
          if (
            fileConfig.telemetry.enabled !== undefined &&
            process.env['LSP_MCP_TELEMETRY_ENABLED'] === undefined
          ) {
            config.enabled = fileConfig.telemetry.enabled;
          }

          if (fileConfig.telemetry.serviceName && !process.env['OTEL_SERVICE_NAME']) {
            config.serviceName = fileConfig.telemetry.serviceName;
          }

          if (fileConfig.telemetry.otlp && !process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
            config.otlp = {
              ...config.otlp!,
              ...fileConfig.telemetry.otlp,
            };
          }

          if (
            fileConfig.telemetry.samplingRate !== undefined &&
            !process.env['LSP_MCP_TELEMETRY_SAMPLE_RATE']
          ) {
            config.samplingRate = fileConfig.telemetry.samplingRate;
          }

          if (fileConfig.telemetry.exporters) {
            config.exporters = {
              traces:
                process.env['OTEL_TRACES_EXPORTER'] ||
                fileConfig.telemetry.exporters.traces ||
                config.exporters?.traces,
              metrics:
                process.env['OTEL_METRICS_EXPORTER'] ||
                fileConfig.telemetry.exporters.metrics ||
                config.exporters?.metrics,
              logs:
                process.env['OTEL_LOGS_EXPORTER'] ||
                fileConfig.telemetry.exporters.logs ||
                config.exporters?.logs,
            };
          }
        }
      }
    } catch (error) {
      // 設定ファイルの読み込みエラーは無視（デフォルト設定を使用）
      logger.warn(`テレメトリ設定ファイルの読み込みに失敗しました: ${error}`);
    }

    return config;
  }

  /**
   * OpenTelemetry SDKを初期化する
   */
  async initialize(customConfig?: TelemetryConfig): Promise<void> {
    if (this.initialized) {
      logger.warn('TelemetryManagerは既に初期化されています');
      return;
    }

    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    if (!this.config.enabled) {
      logger.info('テレメトリは無効です（enabled: false）');
      this.initialized = true;
      return;
    }

    try {
      const packageJson = this.getPackageVersion();

      // Resource設定
      const resource = new Resource({
        [ATTR_SERVICE_NAME]: this.config.serviceName || 'lsp-mcp',
        [ATTR_SERVICE_VERSION]: packageJson.version || '0.1.0',
      });

      // Trace Exporter と SpanProcessor
      const spanProcessor = this.createSpanProcessor(this.config.exporters?.traces || 'none');

      // Metric Exporter
      const metricReader = this.createMetricReader(this.config.exporters?.metrics || 'none');

      // Logger Provider
      this.loggerProvider = this.createLoggerProvider(
        resource,
        this.config.exporters?.logs || 'none'
      );

      // サンプリング設定
      const samplingRate = this.config.samplingRate ?? 0.1; // デフォルト10%
      const sampler = new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(samplingRate),
      });

      // SDK初期化
      this.sdk = new NodeSDK({
        resource,
        spanProcessor,
        metricReader,
        sampler,
      });

      await this.sdk.start();

      this.initialized = true;
      logger.info(
        `OpenTelemetryテレメトリを初期化しました（endpoint: ${this.config.otlp?.endpoint}）`
      );
    } catch (error) {
      logger.error(`テレメトリの初期化に失敗しました: ${error}`);
      throw error;
    }
  }

  /**
   * SpanProcessorを作成
   * BatchSpanProcessorを使用して非同期バッチエクスポートを実現
   */
  private createSpanProcessor(type: ExporterType) {
    let exporter;
    switch (type) {
      case 'otlp':
        exporter = new OTLPTraceExporter({
          url: this.config.otlp?.endpoint,
        });
        break;
      case 'console':
        exporter = new ConsoleSpanExporter();
        break;
      case 'none':
      default:
        // NoopTracerProviderを使用するため、nullを返す
        return undefined;
    }

    // BatchSpanProcessorでラップして非同期バッチ処理を有効化
    return new BatchSpanProcessor(exporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000, // 5秒ごとにエクスポート
      exportTimeoutMillis: 30000, // 30秒タイムアウト
    });
  }

  /**
   * Metric Readerを作成
   * PeriodicExportingMetricReaderで1分ごとのバッチエクスポート
   */
  private createMetricReader(type: ExporterType) {
    switch (type) {
      case 'otlp':
        return new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: this.config.otlp?.endpoint,
          }),
          exportIntervalMillis: 60000, // 1分ごとにエクスポート
        });
      case 'console':
        return new PeriodicExportingMetricReader({
          exporter: new ConsoleMetricExporter(),
          exportIntervalMillis: 60000, // 1分ごとにエクスポート
        });
      case 'none':
      default:
        return undefined;
    }
  }

  /**
   * Logger Providerを作成
   */
  private createLoggerProvider(resource: Resource, type: ExporterType): LoggerProvider {
    const loggerProvider = new LoggerProvider({ resource });

    switch (type) {
      case 'otlp': {
        const exporter = new OTLPLogExporter({
          url: this.config.otlp?.endpoint,
        });
        // バッチ処理でエクスポート
        loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(exporter));
        break;
      }
      case 'console': {
        const exporter = new ConsoleLogRecordExporter();
        // シンプルな即時エクスポート
        loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(exporter));
        break;
      }
      case 'none':
      default:
        // プロセッサーなし（NoOp）
        break;
    }

    // グローバルLoggerProviderとして設定
    logs.setGlobalLoggerProvider(loggerProvider);

    return loggerProvider;
  }

  /**
   * package.jsonからバージョン情報を取得
   */
  private getPackageVersion(): { version: string } {
    try {
      const packagePath = path.resolve(process.cwd(), 'package.json');

      if (fs.existsSync(packagePath)) {
        const packageContent = fs.readFileSync(packagePath, 'utf-8');
        return JSON.parse(packageContent);
      }
    } catch (error) {
      logger.warn(`package.jsonの読み込みに失敗しました: ${error}`);
    }

    return { version: '0.1.0' };
  }

  /**
   * Tracerインスタンスを取得
   */
  getTracer(name?: string): Tracer {
    if (!this.config.enabled) {
      // NoopTracerを返す
      return trace.getTracer('noop');
    }

    return trace.getTracer(name || 'lsp-mcp');
  }

  /**
   * Meterインスタンスを取得
   */
  getMeter(name?: string): Meter {
    if (!this.config.enabled) {
      // NoopMeterを返す
      return metrics.getMeter('noop');
    }

    return metrics.getMeter(name || 'lsp-mcp');
  }

  /**
   * テレメトリが有効かチェック
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * グレースフルシャットダウン
   */
  async shutdown(): Promise<void> {
    if (!this.sdk && !this.loggerProvider) {
      return;
    }

    try {
      // LoggerProviderのシャットダウン
      if (this.loggerProvider) {
        await this.loggerProvider.shutdown();
      }

      // SDKのシャットダウン
      if (this.sdk) {
        await this.sdk.shutdown();
      }

      logger.info('OpenTelemetryテレメトリをシャットダウンしました');
    } catch (error) {
      logger.error(`テレメトリのシャットダウンに失敗しました: ${error}`);
      throw error;
    } finally {
      this.initialized = false;
    }
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }
}
