/**
 * メトリクス収集モジュール
 * OpenTelemetry Metrics APIを使用してアプリケーションのメトリクスを記録
 */

import { Meter, Counter, Histogram, ObservableGauge } from '@opentelemetry/api';
import { TelemetryManager } from './TelemetryManager.js';

/**
 * メトリクスインスタンス
 */
class Metrics {
  private meter: Meter;

  // Counter（累積カウンター）
  private requestsTotal: Counter;
  private requestsErrors: Counter;
  private vectordbOperations: Counter;

  // Histogram（分布記録）
  private requestsDuration: Histogram;
  private searchResults: Histogram;

  // Gauge（現在値）- ObservableGaugeとして実装
  private indexFiles: ObservableGauge;
  private indexSymbols: ObservableGauge;
  private memoryUsage: ObservableGauge;

  // Gauge用の内部状態
  private indexFilesValue = 0;
  private indexSymbolsValue = 0;

  constructor(telemetryManager: TelemetryManager) {
    this.meter = telemetryManager.getMeter('lsp-mcp-metrics');

    // Counter定義
    this.requestsTotal = this.meter.createCounter('lsp_mcp.requests.total', {
      description: 'リクエスト総数',
      unit: '1',
    });

    this.requestsErrors = this.meter.createCounter('lsp_mcp.requests.errors', {
      description: 'エラー発生回数',
      unit: '1',
    });

    this.vectordbOperations = this.meter.createCounter('lsp_mcp.vectordb.operations', {
      description: 'ベクターDB操作回数',
      unit: '1',
    });

    // Histogram定義
    this.requestsDuration = this.meter.createHistogram('lsp_mcp.requests.duration', {
      description: 'リクエスト処理時間',
      unit: 'ms',
    });

    this.searchResults = this.meter.createHistogram('lsp_mcp.search.results', {
      description: '検索結果数',
      unit: '1',
    });

    // ObservableGauge定義
    this.indexFiles = this.meter.createObservableGauge('lsp_mcp.index.files', {
      description: 'インデックス済みファイル数',
      unit: '1',
    });

    this.indexSymbols = this.meter.createObservableGauge('lsp_mcp.index.symbols', {
      description: 'インデックス済みシンボル数',
      unit: '1',
    });

    this.memoryUsage = this.meter.createObservableGauge('lsp_mcp.memory.usage', {
      description: 'メモリ使用量',
      unit: 'MB',
    });

    // ObservableGaugeのコールバック設定
    this.indexFiles.addCallback((observableResult) => {
      observableResult.observe(this.indexFilesValue);
    });

    this.indexSymbols.addCallback((observableResult) => {
      observableResult.observe(this.indexSymbolsValue);
    });

    this.memoryUsage.addCallback((observableResult) => {
      const used = process.memoryUsage();
      const usageMB = used.heapUsed / 1024 / 1024;
      observableResult.observe(usageMB);
    });
  }

  /**
   * リクエストカウンターを増加
   * @param toolName MCPツール名
   */
  incrementRequestCounter(toolName: string): void {
    this.requestsTotal.add(1, {
      'tool.name': toolName,
    });
  }

  /**
   * エラーカウンターを増加
   * @param toolName MCPツール名
   * @param errorType エラータイプ
   */
  incrementErrorCounter(toolName: string, errorType: string): void {
    this.requestsErrors.add(1, {
      'tool.name': toolName,
      'error.type': errorType,
    });
  }

  /**
   * ベクターDB操作カウンターを増加
   * @param operationType 操作タイプ（insert, search, delete等）
   */
  incrementVectorDBOperations(operationType: string): void {
    this.vectordbOperations.add(1, {
      'operation.type': operationType,
    });
  }

  /**
   * リクエスト処理時間を記録
   * @param toolName MCPツール名
   * @param duration 処理時間（ms）
   */
  recordRequestDuration(toolName: string, duration: number): void {
    this.requestsDuration.record(duration, {
      'tool.name': toolName,
    });
  }

  /**
   * 検索結果数を記録
   * @param count 検索結果数
   */
  recordSearchResults(count: number): void {
    this.searchResults.record(count);
  }

  /**
   * インデックス済みファイル数を更新
   * @param count ファイル数
   */
  updateIndexFilesGauge(count: number): void {
    this.indexFilesValue = count;
  }

  /**
   * インデックス済みシンボル数を更新
   * @param count シンボル数
   */
  updateIndexSymbolsGauge(count: number): void {
    this.indexSymbolsValue = count;
  }

  /**
   * メモリ使用量を更新（自動収集されるため、明示的な呼び出しは不要）
   * このメソッドは互換性のために残しているが、ObservableGaugeが自動で収集する
   */
  updateMemoryUsageGauge(): void {
    // ObservableGaugeのコールバックで自動収集されるため、何もしない
    // このメソッドは呼び出されても問題ないが、実質的には不要
  }
}

// グローバルインスタンス（遅延初期化）
let metricsInstance: Metrics | null = null;

/**
 * Metricsインスタンスを初期化
 * @param telemetryManager TelemetryManagerインスタンス
 */
export function initializeMetrics(telemetryManager: TelemetryManager): void {
  if (metricsInstance) {
    return;
  }
  metricsInstance = new Metrics(telemetryManager);
}

/**
 * リクエストカウンターを増加
 * @param toolName MCPツール名
 */
export function incrementRequestCounter(toolName: string): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.incrementRequestCounter(toolName);
}

/**
 * エラーカウンターを増加
 * @param toolName MCPツール名
 * @param errorType エラータイプ
 */
export function incrementErrorCounter(toolName: string, errorType: string): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.incrementErrorCounter(toolName, errorType);
}

/**
 * ベクターDB操作カウンターを増加
 * @param operationType 操作タイプ（insert, search, delete等）
 */
export function incrementVectorDBOperations(operationType: string): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.incrementVectorDBOperations(operationType);
}

/**
 * リクエスト処理時間を記録
 * @param toolName MCPツール名
 * @param duration 処理時間（ms）
 */
export function recordRequestDuration(toolName: string, duration: number): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.recordRequestDuration(toolName, duration);
}

/**
 * 検索結果数を記録
 * @param count 検索結果数
 */
export function recordSearchResults(count: number): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.recordSearchResults(count);
}

/**
 * インデックス済みファイル数を更新
 * @param count ファイル数
 */
export function updateIndexFilesGauge(count: number): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.updateIndexFilesGauge(count);
}

/**
 * インデックス済みシンボル数を更新
 * @param count シンボル数
 */
export function updateIndexSymbolsGauge(count: number): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.updateIndexSymbolsGauge(count);
}

/**
 * メモリ使用量を更新（自動収集されるため、明示的な呼び出しは不要）
 * このメソッドは互換性のために残しているが、ObservableGaugeが自動で収集する
 */
export function updateMemoryUsageGauge(): void {
  if (!metricsInstance) {
    return;
  }
  metricsInstance.updateMemoryUsageGauge();
}
