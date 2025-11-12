/**
 * テレメトリモジュール
 * OpenTelemetryによる監視・可観測性機能を提供
 */

export { TelemetryManager } from './TelemetryManager';
export type {
  TelemetryConfig,
  OTLPConfig,
  OTLPProtocol,
  ExporterType,
  ExportersConfig,
} from './types';
export { DEFAULT_TELEMETRY_CONFIG } from './types';
export { TelemetryLogger, telemetryLogger } from './logger';
export type { LogLevel, LogContext } from './logger';
export {
  initializeMetrics,
  incrementRequestCounter,
  incrementErrorCounter,
  incrementVectorDBOperations,
  recordRequestDuration,
  recordSearchResults,
  updateIndexFilesGauge,
  updateIndexSymbolsGauge,
  updateMemoryUsageGauge,
} from './metrics';
export {
  setTelemetryManager,
  traceToolCall,
  traceVectorDBOperation,
  traceASTParser,
  traceEmbedding,
  traceToolCallSync,
  traceASTParserSync,
} from './instrumentation';
export { TraceToolCall, TraceVectorDB, TraceAST, TraceEmbedding, Trace } from './decorators';
export {
  propagateTraceContext,
  extractTraceContext,
  withTraceContext,
  addTraceContextAttributes,
  getCurrentTraceId,
  getCurrentSpanId,
} from './context-propagation';
