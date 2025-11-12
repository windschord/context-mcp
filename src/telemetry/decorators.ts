/**
 * OpenTelemetryトレース用デコレーター（オプション）
 * メソッドデコレーターを使ってトレースを簡単に追加
 *
 * 注意: TypeScriptのデコレーターはexperimentalな機能です。
 * tsconfig.jsonで"experimentalDecorators": trueが必要です。
 *
 * 使用例:
 * ```typescript
 * class SearchService {
 *   @TraceToolCall('search_code')
 *   async search(query: string) {
 *     // 検索処理
 *   }
 *
 *   @TraceVectorDB('query', 'milvus')
 *   async queryVectors(vector: number[], topK: number) {
 *     // ベクターDB操作
 *   }
 * }
 * ```
 */

import {
  traceToolCall,
  traceVectorDBOperation,
  traceASTParser,
  traceEmbedding,
} from './instrumentation';

/**
 * MCPツール呼び出しをトレースするメソッドデコレーター
 *
 * @param toolName ツール名
 * @returns メソッドデコレーター
 */
export function TraceToolCall(toolName: string) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      // 引数からパラメータを抽出（最初の引数をパラメータとみなす）
      const params = args.length > 0 ? (args[0] as Record<string, unknown>) : {};

      return await traceToolCall(toolName, params, async () => {
        return await originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * ベクターDB操作をトレースするメソッドデコレーター
 *
 * @param operationType 操作タイプ
 * @param backend バックエンド名
 * @returns メソッドデコレーター
 */
export function TraceVectorDB(operationType: 'query' | 'upsert' | 'delete', backend: string) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return await traceVectorDBOperation(operationType, backend, async () => {
        return await originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * AST解析をトレースするメソッドデコレーター
 * 言語とファイルパスは引数から動的に取得
 *
 * @param languageArgIndex 言語引数のインデックス（デフォルト: 1）
 * @param filePathArgIndex ファイルパス引数のインデックス（デフォルト: 0）
 * @returns メソッドデコレーター
 */
export function TraceAST(languageArgIndex: number = 1, filePathArgIndex: number = 0) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const language = (args[languageArgIndex] as string) || 'unknown';
      const filePath = (args[filePathArgIndex] as string) || 'unknown';

      return await traceASTParser(language, filePath, async () => {
        return await originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * 埋め込み生成をトレースするメソッドデコレーター
 * プロバイダー、モデル、テキスト数は実行時に動的に決定
 *
 * @param getProvider プロバイダーを取得する関数
 * @param getModel モデルを取得する関数
 * @param getTextCount テキスト数を取得する関数
 * @returns メソッドデコレーター
 */
export function TraceEmbedding(
  getProvider: (instance: unknown) => string,
  getModel: (instance: unknown) => string,
  getTextCount: (args: unknown[]) => number
) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const provider = getProvider(this);
      const model = getModel(this);
      const textCount = getTextCount(args);

      return await traceEmbedding(provider, model, textCount, async () => {
        return await originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

/**
 * 汎用トレースデコレーター
 * スパン名をカスタマイズ可能
 *
 * @param spanName スパン名
 * @param getAttributes スパン属性を取得する関数（オプション）
 * @returns メソッドデコレーター
 */
export function Trace(
  spanName: string,
  getAttributes?: (instance: unknown, args: unknown[]) => Record<string, unknown>
) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const params = getAttributes ? getAttributes(this, args) : {};

      // traceToolCallを汎用的に利用
      return await traceToolCall(spanName, params, async () => {
        return await originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}
