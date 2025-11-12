/**
 * OpenTelemetryトレースインストルメンテーション
 * MCPツール、ベクターDB操作、AST解析、埋め込み生成のトレース機能を提供
 *
 * 使用例:
 * ```typescript
 * // TelemetryManagerの初期化と設定
 * const telemetryManager = new TelemetryManager();
 * await telemetryManager.initialize();
 * setTelemetryManager(telemetryManager);
 *
 * // MCPツール呼び出しのトレース
 * const result = await traceToolCall('search_code', { query: 'test' }, async () => {
 *   return await searchService.search('test');
 * });
 *
 * // ベクターDB操作のトレース
 * const vectors = await traceVectorDBOperation('query', 'milvus', async () => {
 *   return await vectorStore.query(embedding, 10);
 * });
 *
 * // AST解析のトレース
 * const ast = await traceASTParser('typescript', '/path/to/file.ts', async () => {
 *   return await parser.parse(code, 'typescript');
 * });
 *
 * // 埋め込み生成のトレース
 * const embeddings = await traceEmbedding('transformers', 'all-MiniLM-L6-v2', 10, async () => {
 *   return await embeddingEngine.generateEmbeddings(texts);
 * });
 * ```
 */

import { Tracer, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { TelemetryManager } from './TelemetryManager';

let telemetryManager: TelemetryManager | null = null;
let tracer: Tracer | null = null;

/**
 * TelemetryManagerインスタンスを設定
 */
export function setTelemetryManager(manager: TelemetryManager): void {
  telemetryManager = manager;
  tracer = manager.getTracer('lsp-mcp-instrumentation');
}

/**
 * Tracerインスタンスを取得
 * 未設定の場合はNoopTracerを返す
 */
function getTracer(): Tracer {
  if (!tracer) {
    // NoopTracerを返す（テレメトリ無効時）
    return trace.getTracer('noop');
  }
  return tracer;
}

/**
 * パラメータを切り捨てる（1KB以上の場合）
 */
function truncateParams(params: Record<string, unknown>): string {
  const jsonString = JSON.stringify(params);
  const maxLength = 1024; // 1KB

  if (jsonString.length > maxLength) {
    return jsonString.substring(0, maxLength) + '...[truncated]';
  }

  return jsonString;
}

/**
 * エラースタックトレースを切り捨てる（10行以内）
 */
function truncateStackTrace(error: Error): string {
  if (!error.stack) {
    return error.message;
  }

  const lines = error.stack.split('\n');
  if (lines.length <= 10) {
    return error.stack;
  }

  return lines.slice(0, 10).join('\n') + '\n...[truncated]';
}

/**
 * MCPツール呼び出しをトレース
 *
 * @param toolName ツール名（例: 'search_code', 'index_project'）
 * @param params ツールパラメータ
 * @param fn 実行する関数
 * @returns 関数の実行結果
 */
export async function traceToolCall<T>(
  toolName: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  // テレメトリ無効時の早期リターン
  if (!telemetryManager || !telemetryManager.isEnabled()) {
    return fn();
  }

  const activeTracer = getTracer();
  const span = activeTracer.startSpan(`mcp.tool.${toolName}`);
  const startTime = Date.now();

  // スパン属性の設定（大きなパラメータは切り捨て）
  span.setAttribute('tool.name', toolName);
  span.setAttribute('tool.params', truncateParams(params));

  try {
    // コンテキストを伝播して実行
    const result = await context.with(trace.setSpan(context.active(), span), fn);

    // 成功時の属性を追加
    const duration = Date.now() - startTime;
    span.setAttribute('tool.duration', duration);
    span.setAttribute('tool.status', 'success');
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (error) {
    // エラー時の処理
    const duration = Date.now() - startTime;
    span.setAttribute('tool.duration', duration);
    span.setAttribute('tool.status', 'error');

    // エラー情報を記録（スタックトレースは切り捨て）
    if (error instanceof Error) {
      span.setAttribute('error.stack', truncateStackTrace(error));
      span.recordException(error);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    // エラーを再スロー
    throw error;
  } finally {
    span.end();
  }
}

/**
 * ベクターDB操作をトレース
 *
 * @param operationType 操作タイプ（'query', 'upsert', 'delete'）
 * @param backend バックエンド名（'milvus', 'zilliz'）
 * @param fn 実行する関数
 * @returns 関数の実行結果
 */
export async function traceVectorDBOperation<T>(
  operationType: 'query' | 'upsert' | 'delete',
  backend: string,
  fn: () => Promise<T>
): Promise<T> {
  // テレメトリ無効時の早期リターン
  if (!telemetryManager || !telemetryManager.isEnabled()) {
    return fn();
  }

  const activeTracer = getTracer();
  const span = activeTracer.startSpan(`vectordb.${operationType}`);
  const startTime = Date.now();

  // スパン属性の設定
  span.setAttribute('operation.type', operationType);
  span.setAttribute('vectordb.backend', backend);

  try {
    // コンテキストを伝播して実行
    const result = await context.with(trace.setSpan(context.active(), span), fn);

    // 成功時の属性を追加
    const duration = Date.now() - startTime;
    span.setAttribute('operation.duration', duration);
    span.setAttribute('operation.status', 'success');
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (error) {
    // エラー時の処理
    const duration = Date.now() - startTime;
    span.setAttribute('operation.duration', duration);
    span.setAttribute('operation.status', 'error');

    // エラー情報を記録（スタックトレースは切り捨て）
    if (error instanceof Error) {
      span.setAttribute('error.stack', truncateStackTrace(error));
      span.recordException(error);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    // エラーを再スロー
    throw error;
  } finally {
    span.end();
  }
}

/**
 * AST解析をトレース
 *
 * @param language プログラミング言語
 * @param filePath ファイルパス
 * @param fn 実行する関数
 * @returns 関数の実行結果
 */
export async function traceASTParser<T>(
  language: string,
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  // テレメトリ無効時の早期リターン
  if (!telemetryManager || !telemetryManager.isEnabled()) {
    return fn();
  }

  const activeTracer = getTracer();
  const span = activeTracer.startSpan('ast.parse');
  const startTime = Date.now();

  // スパン属性の設定
  span.setAttribute('language', language);
  span.setAttribute('file.path', filePath);

  try {
    // コンテキストを伝播して実行
    const result = await context.with(trace.setSpan(context.active(), span), fn);

    // 成功時の属性を追加
    const duration = Date.now() - startTime;
    span.setAttribute('parse.duration', duration);
    span.setAttribute('parse.status', 'success');
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (error) {
    // エラー時の処理
    const duration = Date.now() - startTime;
    span.setAttribute('parse.duration', duration);
    span.setAttribute('parse.status', 'error');

    // エラー情報を記録（スタックトレースは切り捨て）
    if (error instanceof Error) {
      span.setAttribute('error.stack', truncateStackTrace(error));
      span.recordException(error);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    // エラーを再スロー
    throw error;
  } finally {
    span.end();
  }
}

/**
 * 埋め込み生成をトレース
 *
 * @param provider 埋め込みプロバイダー（'transformers', 'openai', 'voyageai'）
 * @param model モデル名
 * @param textCount テキスト数
 * @param fn 実行する関数
 * @returns 関数の実行結果
 */
export async function traceEmbedding<T>(
  provider: string,
  model: string,
  textCount: number,
  fn: () => Promise<T>
): Promise<T> {
  // テレメトリ無効時の早期リターン
  if (!telemetryManager || !telemetryManager.isEnabled()) {
    return fn();
  }

  const activeTracer = getTracer();
  const span = activeTracer.startSpan('embedding.generate');
  const startTime = Date.now();

  // スパン属性の設定
  span.setAttribute('embedding.provider', provider);
  span.setAttribute('embedding.model', model);
  span.setAttribute('embedding.text_count', textCount);

  try {
    // コンテキストを伝播して実行
    const result = await context.with(trace.setSpan(context.active(), span), fn);

    // 成功時の属性を追加
    const duration = Date.now() - startTime;
    span.setAttribute('embedding.duration', duration);
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (error) {
    // エラー時の処理
    const duration = Date.now() - startTime;
    span.setAttribute('embedding.duration', duration);

    // エラー情報を記録（スタックトレースは切り捨て）
    if (error instanceof Error) {
      span.setAttribute('error.stack', truncateStackTrace(error));
      span.recordException(error);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    // エラーを再スロー
    throw error;
  } finally {
    span.end();
  }
}

/**
 * 同期関数版: MCPツール呼び出しをトレース
 *
 * @param toolName ツール名
 * @param params ツールパラメータ
 * @param fn 実行する関数
 * @returns 関数の実行結果
 */
export function traceToolCallSync<T>(
  toolName: string,
  params: Record<string, unknown>,
  fn: () => T
): T {
  // テレメトリ無効時の早期リターン
  if (!telemetryManager || !telemetryManager.isEnabled()) {
    return fn();
  }

  const activeTracer = getTracer();
  const span = activeTracer.startSpan(`mcp.tool.${toolName}`);
  const startTime = Date.now();

  // スパン属性の設定（大きなパラメータは切り捨て）
  span.setAttribute('tool.name', toolName);
  span.setAttribute('tool.params', truncateParams(params));

  try {
    // コンテキストを伝播して実行
    const result = context.with(trace.setSpan(context.active(), span), fn);

    // 成功時の属性を追加
    const duration = Date.now() - startTime;
    span.setAttribute('tool.duration', duration);
    span.setAttribute('tool.status', 'success');
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (error) {
    // エラー時の処理
    const duration = Date.now() - startTime;
    span.setAttribute('tool.duration', duration);
    span.setAttribute('tool.status', 'error');

    // エラー情報を記録（スタックトレースは切り捨て）
    if (error instanceof Error) {
      span.setAttribute('error.stack', truncateStackTrace(error));
      span.recordException(error);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    // エラーを再スロー
    throw error;
  } finally {
    span.end();
  }
}

/**
 * 同期関数版: AST解析をトレース
 *
 * @param language プログラミング言語
 * @param filePath ファイルパス
 * @param fn 実行する関数
 * @returns 関数の実行結果
 */
export function traceASTParserSync<T>(language: string, filePath: string, fn: () => T): T {
  // テレメトリ無効時の早期リターン
  if (!telemetryManager || !telemetryManager.isEnabled()) {
    return fn();
  }

  const activeTracer = getTracer();
  const span = activeTracer.startSpan('ast.parse');
  const startTime = Date.now();

  // スパン属性の設定
  span.setAttribute('language', language);
  span.setAttribute('file.path', filePath);

  try {
    // コンテキストを伝播して実行
    const result = context.with(trace.setSpan(context.active(), span), fn);

    // 成功時の属性を追加
    const duration = Date.now() - startTime;
    span.setAttribute('parse.duration', duration);
    span.setAttribute('parse.status', 'success');
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (error) {
    // エラー時の処理
    const duration = Date.now() - startTime;
    span.setAttribute('parse.duration', duration);
    span.setAttribute('parse.status', 'error');

    // エラー情報を記録（スタックトレースは切り捨て）
    if (error instanceof Error) {
      span.setAttribute('error.stack', truncateStackTrace(error));
      span.recordException(error);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    // エラーを再スロー
    throw error;
  } finally {
    span.end();
  }
}
