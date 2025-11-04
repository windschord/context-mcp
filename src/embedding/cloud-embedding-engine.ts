/**
 * Cloud Embedding Engine
 *
 * クラウドベースの埋め込みAPIを使用した埋め込みエンジン
 * OpenAI, VoyageAIに対応
 */

import type { EmbeddingEngine, CloudEmbeddingOptions } from './types';
import { traceEmbedding } from '../telemetry/instrumentation.js';
import { propagateTraceContext, withTraceContext } from '../telemetry/context-propagation.js';

/**
 * クラウド埋め込みエンジン
 *
 * OpenAIまたはVoyageAIのAPIを使用してテキストを埋め込みベクトルに変換します。
 *
 * @example
 * ```typescript
 * const engine = new CloudEmbeddingEngine({
 *   provider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   modelName: 'text-embedding-3-small',
 *   batchSize: 100,
 *   maxRetries: 3,
 * });
 *
 * await engine.initialize();
 * const vector = await engine.embed('Hello, world!');
 * console.log(vector.length); // 1536
 * await engine.dispose();
 * ```
 */
export class CloudEmbeddingEngine implements EmbeddingEngine {
  private options: Required<CloudEmbeddingOptions>;
  private client: any; // OpenAI or VoyageAI client
  private initialized: boolean = false;
  private dimension: number = 0;

  /**
   * モデル名と対応する次元数のマッピング
   */
  private static readonly MODEL_DIMENSIONS: Record<string, number> = {
    // OpenAI
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
    // VoyageAI
    'voyage-2': 1024,
    'voyage-large-2': 1536,
    'voyage-code-2': 1536,
  };

  /**
   * デフォルト設定
   */
  private static readonly DEFAULTS = {
    batchSize: 100,
    maxRetries: 3,
    timeout: 30000,
  };

  constructor(options: CloudEmbeddingOptions) {
    // APIキーの検証と環境変数からの取得
    const apiKey = this.resolveApiKey(options.apiKey, options.provider);
    if (!apiKey) {
      throw new Error(
        `API key is required for ${options.provider}. ` +
          `Provide it directly or set ${this.getEnvVarName(options.provider)} environment variable.`
      );
    }

    this.options = {
      ...CloudEmbeddingEngine.DEFAULTS,
      ...options,
      apiKey,
    };
  }

  /**
   * APIキーの解決
   * 環境変数参照（${VAR_NAME}）を展開します
   */
  private resolveApiKey(apiKey: string, _provider: string): string {
    if (apiKey.startsWith('${') && apiKey.endsWith('}')) {
      const envVar = apiKey.slice(2, -1);
      return process.env[envVar] || '';
    }
    return apiKey;
  }

  /**
   * プロバイダーに応じた環境変数名を取得
   */
  private getEnvVarName(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'OPENAI_API_KEY';
      case 'voyageai':
        return 'VOYAGEAI_API_KEY';
      default:
        return 'API_KEY';
    }
  }

  /**
   * エンジンの初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (this.options.provider === 'openai') {
        await this.initializeOpenAI();
      } else if (this.options.provider === 'voyageai') {
        await this.initializeVoyageAI();
      } else {
        throw new Error(`Unsupported provider: ${this.options.provider}`);
      }

      // 次元数を設定
      this.dimension =
        CloudEmbeddingEngine.MODEL_DIMENSIONS[this.options.modelName] || 1536;

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize ${this.options.provider} client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * OpenAIクライアントの初期化
   */
  private async initializeOpenAI(): Promise<void> {
    const { default: OpenAI } = await import('openai');
    this.client = new OpenAI({
      apiKey: this.options.apiKey,
      timeout: this.options.timeout,
      // デフォルトヘッダーにトレースコンテキストを含める
      defaultHeaders: propagateTraceContext(),
    });
  }

  /**
   * VoyageAIクライアントの初期化
   */
  private async initializeVoyageAI(): Promise<void> {
    const { VoyageAIClient } = await import('voyageai');
    this.client = new VoyageAIClient({
      apiKey: this.options.apiKey,
    });
  }

  /**
   * 単一テキストの埋め込み
   */
  async embed(text: string): Promise<number[]> {
    this.ensureInitialized();

    return await traceEmbedding(this.options.provider, this.options.modelName, 1, async () => {
      return await withTraceContext(async () => {
        const vectors = await this.embedBatch([text]);
        if (!vectors || vectors.length === 0 || !vectors[0]) {
          throw new Error('Failed to generate embedding');
        }
        return vectors[0];
      });
    });
  }

  /**
   * バッチテキストの埋め込み
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.ensureInitialized();

    return await traceEmbedding(this.options.provider, this.options.modelName, texts.length, async () => {
      return await withTraceContext(async () => {
        if (texts.length === 0) {
          return [];
        }

        const allVectors: number[][] = [];

        // バッチサイズに従って分割処理
        for (let i = 0; i < texts.length; i += this.options.batchSize) {
          const batch = texts.slice(i, i + this.options.batchSize);
          const vectors = await this.embedBatchWithRetry(batch);
          if (vectors) {
            allVectors.push(...vectors);
          }
        }

        return allVectors;
      });
    });
  }

  /**
   * リトライ付きバッチ埋め込み
   */
  private async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;
    let backoffDelay = 100; // 初期バックオフ時間（ミリ秒）

    for (let attempt = 0; attempt < this.options.maxRetries; attempt++) {
      try {
        if (this.options.provider === 'openai') {
          return await this.embedBatchOpenAI(texts);
        } else if (this.options.provider === 'voyageai') {
          return await this.embedBatchVoyageAI(texts);
        } else {
          throw new Error(`Unsupported provider: ${this.options.provider}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // レート制限エラーの場合は指数バックオフでリトライ
        const isRateLimitError =
          (error as any).status === 429 ||
          (error as any).code === 'rate_limit_exceeded' ||
          (lastError.message.includes('rate limit') ||
            lastError.message.includes('429'));

        if (attempt < this.options.maxRetries - 1) {
          // 最後の試行でない場合のみリトライ
          if (isRateLimitError) {
            // レート制限の場合は指数バックオフ
            await this.sleep(backoffDelay);
            backoffDelay *= 2; // 指数バックオフ
          } else {
            // その他のエラーは短い待機時間
            await this.sleep(100);
          }
        }
      }
    }

    throw new Error(
      `Failed to generate embeddings after ${this.options.maxRetries} retries: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * OpenAIでバッチ埋め込み
   */
  private async embedBatchOpenAI(texts: string[]): Promise<number[][]> {
    // トレースコンテキストを含むヘッダーを生成
    const headers = propagateTraceContext();

    const response = await this.client.embeddings.create(
      {
        model: this.options.modelName,
        input: texts,
      },
      {
        headers,
      }
    );

    return response.data.map((item: any) => item.embedding);
  }

  /**
   * VoyageAIでバッチ埋め込み
   */
  private async embedBatchVoyageAI(texts: string[]): Promise<number[][]> {
    const response = await this.client.embed({
      input: texts,
      model: this.options.modelName,
    });

    return response.embeddings;
  }

  /**
   * ベクトル次元数を取得
   */
  getDimension(): number {
    return this.dimension;
  }

  /**
   * リソースの解放
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    this.client = null;
    this.initialized = false;
    this.dimension = 0;
  }

  /**
   * 初期化済みかチェック
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'CloudEmbeddingEngine is not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * スリープ処理
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
