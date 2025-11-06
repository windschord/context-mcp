/**
 * テレメトリ設定のスキーマ定義
 */

/**
 * OTLPプロトコル
 */
export type OTLPProtocol = 'grpc' | 'http/protobuf';

/**
 * エクスポータータイプ
 */
export type ExporterType = 'otlp' | 'console' | 'none';

/**
 * OTLP設定
 */
export interface OTLPConfig {
  endpoint: string;
  protocol: OTLPProtocol;
}

/**
 * エクスポーター設定
 */
export interface ExportersConfig {
  traces?: ExporterType;
  metrics?: ExporterType;
  logs?: ExporterType;
}

/**
 * テレメトリ設定
 */
export interface TelemetryConfig {
  enabled: boolean;
  otlp?: OTLPConfig;
  serviceName?: string;
  samplingRate?: number;
  exporters?: ExportersConfig;
}

/**
 * デフォルトのテレメトリ設定
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: false,
  otlp: {
    endpoint: 'http://localhost:4317',
    protocol: 'grpc',
  },
  serviceName: 'lsp-mcp',
  samplingRate: 0.1,
  exporters: {
    traces: 'none',
    metrics: 'none',
    logs: 'none',
  },
};
