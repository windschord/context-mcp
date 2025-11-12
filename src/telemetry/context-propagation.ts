/**
 * OpenTelemetry Context Propagation
 * W3C Trace Context準拠のトレースコンテキスト伝播ヘルパー
 *
 * 使用例:
 * ```typescript
 * import { propagateTraceContext, withTraceContext } from './context-propagation';
 *
 * // HTTPヘッダーにトレースコンテキストを注入
 * const headers = propagateTraceContext();
 * await fetch(url, { headers });
 *
 * // 関数実行時にトレースコンテキストを保持
 * await withTraceContext(async () => {
 *   // トレースコンテキストが伝播される
 *   await someAsyncOperation();
 * });
 * ```
 */

import { context, trace, propagation, Context } from '@opentelemetry/api';

/**
 * トレースコンテキストをHTTPヘッダーに注入
 * W3C Trace Context形式（traceparent, tracestate）でヘッダーを生成
 *
 * @param customHeaders カスタムヘッダー（オプション）
 * @returns トレースコンテキストが注入されたHTTPヘッダー
 *
 * @example
 * ```typescript
 * const headers = propagateTraceContext({ 'Content-Type': 'application/json' });
 * await fetch(url, { headers });
 * ```
 */
export function propagateTraceContext(
  customHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };

  try {
    // 現在のコンテキストを取得
    const activeContext = context.active();

    // コンテキストをHTTPヘッダーに注入
    // W3C Trace Context形式で "traceparent" と "tracestate" ヘッダーを追加
    propagation.inject(activeContext, headers);
  } catch (error) {
    // トレースコンテキスト伝播の失敗は警告のみ（処理継続）
    console.warn('Failed to propagate trace context:', error);
  }

  return headers;
}

/**
 * HTTPヘッダーからトレースコンテキストを抽出
 * W3C Trace Context形式のヘッダーから新しいコンテキストを生成
 *
 * @param headers HTTPヘッダー
 * @returns 抽出されたトレースコンテキスト
 *
 * @example
 * ```typescript
 * const incomingContext = extractTraceContext(request.headers);
 * const result = await context.with(incomingContext, async () => {
 *   return await processRequest();
 * });
 * ```
 */
export function extractTraceContext(
  headers: Record<string, string | string[] | undefined>
): Context {
  try {
    // 現在のコンテキストをベースに、ヘッダーからトレース情報を抽出
    const activeContext = context.active();
    const extractedContext = propagation.extract(activeContext, headers);

    return extractedContext;
  } catch (error) {
    // トレースコンテキスト抽出の失敗は警告のみ（処理継続）
    console.warn('Failed to extract trace context:', error);
    return context.active();
  }
}

/**
 * 関数実行時にトレースコンテキストを保持
 * 非同期関数を実行する際に、現在のトレースコンテキストを確実に伝播
 *
 * @param fn 実行する関数
 * @param customContext カスタムコンテキスト（オプション）
 * @returns 関数の実行結果
 *
 * @example
 * ```typescript
 * const result = await withTraceContext(async () => {
 *   // この中でトレースコンテキストが保持される
 *   return await vectorStore.query(embedding, 10);
 * });
 * ```
 */
export async function withTraceContext<T>(
  fn: () => Promise<T>,
  customContext?: Context
): Promise<T> {
  try {
    const activeContext = customContext || context.active();
    return await context.with(activeContext, fn);
  } catch (error) {
    // コンテキスト保持の失敗は警告のみ（処理継続）
    console.warn('Failed to execute with trace context:', error);
    // フォールバック: コンテキストなしで実行
    return await fn();
  }
}

/**
 * 現在のスパンにトレースコンテキスト情報を属性として追加
 * デバッグや監視のために使用
 *
 * @param additionalAttributes 追加の属性（オプション）
 *
 * @example
 * ```typescript
 * addTraceContextAttributes({ 'http.target': '/api/search' });
 * ```
 */
export function addTraceContextAttributes(
  additionalAttributes?: Record<string, string | number | boolean>
): void {
  try {
    const activeSpan = trace.getSpan(context.active());
    if (!activeSpan) {
      return;
    }

    // スパンコンテキストから情報を取得
    const spanContext = activeSpan.spanContext();
    if (!spanContext) {
      return;
    }

    // トレース情報を属性として追加
    activeSpan.setAttribute('trace.trace_id', spanContext.traceId);
    activeSpan.setAttribute('trace.span_id', spanContext.spanId);
    activeSpan.setAttribute('trace.trace_flags', spanContext.traceFlags);

    // 追加の属性を設定
    if (additionalAttributes) {
      Object.entries(additionalAttributes).forEach(([key, value]) => {
        activeSpan.setAttribute(key, value);
      });
    }
  } catch (error) {
    // 属性追加の失敗は警告のみ（処理継続）
    console.warn('Failed to add trace context attributes:', error);
  }
}

/**
 * 現在のトレースIDを取得
 * ログ記録や相関付けのために使用
 *
 * @returns トレースID（16進数文字列）、またはundefined
 *
 * @example
 * ```typescript
 * const traceId = getCurrentTraceId();
 * console.log(`Processing request with trace ID: ${traceId}`);
 * ```
 */
export function getCurrentTraceId(): string | undefined {
  try {
    const activeSpan = trace.getSpan(context.active());
    if (!activeSpan) {
      return undefined;
    }

    const spanContext = activeSpan.spanContext();
    return spanContext?.traceId;
  } catch (error) {
    console.warn('Failed to get current trace ID:', error);
    return undefined;
  }
}

/**
 * 現在のスパンIDを取得
 * ログ記録や相関付けのために使用
 *
 * @returns スパンID（16進数文字列）、またはundefined
 *
 * @example
 * ```typescript
 * const spanId = getCurrentSpanId();
 * console.log(`Current operation span ID: ${spanId}`);
 * ```
 */
export function getCurrentSpanId(): string | undefined {
  try {
    const activeSpan = trace.getSpan(context.active());
    if (!activeSpan) {
      return undefined;
    }

    const spanContext = activeSpan.spanContext();
    return spanContext?.spanId;
  } catch (error) {
    console.warn('Failed to get current span ID:', error);
    return undefined;
  }
}
