/**
 * テレメトリモジュール
 * OpenTelemetryによる監視・可観測性機能を提供
 */

export { TelemetryManager } from './TelemetryManager.js';
export type {
  TelemetryConfig,
  OTLPConfig,
  OTLPProtocol,
  ExporterType,
  ExportersConfig,
} from './types.js';
export { DEFAULT_TELEMETRY_CONFIG } from './types.js';
export { TelemetryLogger, telemetryLogger } from './logger.js';
export type { LogLevel, LogContext } from './logger.js';
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
} from './metrics.js';
export {
  setTelemetryManager,
  traceToolCall,
  traceVectorDBOperation,
  traceASTParser,
  traceEmbedding,
  traceToolCallSync,
  traceASTParserSync,
} from './instrumentation.js';
export {
  TraceToolCall,
  TraceVectorDB,
  TraceAST,
  TraceEmbedding,
  Trace,
} from './decorators.js';
export {
  propagateTraceContext,
  extractTraceContext,
  withTraceContext,
  addTraceContextAttributes,
  getCurrentTraceId,
  getCurrentSpanId,
} from './context-propagation.js';
