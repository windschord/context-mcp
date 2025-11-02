/**
 * Local Embedding Engine using Transformers.js
 *
 * Transformers.jsを使用したローカル実行可能な埋め込みエンジン
 * デフォルトモデル: Xenova/all-MiniLM-L6-v2 (384次元)
 *
 * 特徴:
 * - 完全オフライン動作（初回モデルダウンロード後）
 * - 外部通信なし（プライバシー保護）
 * - メモリ効率的なシングルトンパターン
 * - バッチ処理サポート
 */

import { pipeline, Pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { EmbeddingEngine, LocalEmbeddingOptions } from './types';
import { logger } from '../utils/logger';

/**
 * デフォルト設定
 */
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_CACHE_DIR = './.lsp-mcp/models';
const DEFAULT_BATCH_SIZE = 32;
const MODEL_DIMENSION = 384; // all-MiniLM-L6-v2の次元数

/**
 * ローカル埋め込みエンジン実装
 *
 * @example
 * ```typescript
 * const engine = new LocalEmbeddingEngine({
 *   modelName: 'Xenova/all-MiniLM-L6-v2',
 *   cacheDir: './.lsp-mcp/models',
 *   batchSize: 32
 * });
 *
 * await engine.initialize();
 * const vector = await engine.embed('Hello, world!');
 * await engine.dispose();
 * ```
 */
export class LocalEmbeddingEngine implements EmbeddingEngine {
  private model: Pipeline | null = null;
  private initialized = false;
  private readonly modelName: string;
  private readonly cacheDir: string;
  private readonly batchSize: number;

  constructor(options?: LocalEmbeddingOptions) {
    this.modelName = options?.modelName || DEFAULT_MODEL;
    this.cacheDir = options?.cacheDir || DEFAULT_CACHE_DIR;
    this.batchSize = options?.batchSize || DEFAULT_BATCH_SIZE;
  }

  /**
   * エンジンの初期化
   * Transformers.jsモデルをロードします
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('LocalEmbeddingEngine already initialized');
      return;
    }

    try {
      logger.info(`Initializing LocalEmbeddingEngine with model: ${this.modelName}`);

      // キャッシュディレクトリの作成
      this.ensureCacheDirectory();

      // 環境変数でキャッシュディレクトリを指定
      process.env['TRANSFORMERS_CACHE'] = path.resolve(this.cacheDir);

      // モデルのロード（feature-extractionパイプライン）
      // 初回はモデルをダウンロード、以降はキャッシュから読み込み
      this.model = (await pipeline('feature-extraction', this.modelName, {
        cache_dir: this.cacheDir,
      })) as any;

      this.initialized = true;
      logger.info('LocalEmbeddingEngine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize LocalEmbeddingEngine', error);
      throw new Error(`Failed to initialize embedding engine: ${error}`);
    }
  }

  /**
   * 単一テキストの埋め込み
   */
  async embed(text: string): Promise<number[]> {
    this.ensureInitialized();

    try {
      const output = await this.model!(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Tensorからプレーン配列に変換
      return Array.from(output.data as Float32Array);
    } catch (error) {
      logger.error('Failed to embed text', error);
      throw new Error(`Failed to embed text: ${error}`);
    }
  }

  /**
   * バッチテキストの埋め込み
   * バッチサイズで分割して処理することでメモリ効率を向上
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.ensureInitialized();

    if (texts.length === 0) {
      return [];
    }

    try {
      const results: number[][] = [];

      // バッチサイズごとに分割して処理
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        logger.debug(`Processing batch ${i / this.batchSize + 1}/${Math.ceil(texts.length / this.batchSize)}`);

        // バッチ処理
        const batchResults = await Promise.all(batch.map((text) => this.embed(text)));
        results.push(...batchResults);
      }

      logger.info(`Embedded ${texts.length} texts in ${Math.ceil(texts.length / this.batchSize)} batches`);
      return results;
    } catch (error) {
      logger.error('Failed to embed batch', error);
      throw new Error(`Failed to embed batch: ${error}`);
    }
  }

  /**
   * ベクトル次元数を取得
   */
  getDimension(): number {
    return this.initialized ? MODEL_DIMENSION : 0;
  }

  /**
   * リソースの解放
   * モデルインスタンスをクリアし、メモリを解放します
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      logger.warn('LocalEmbeddingEngine not initialized, nothing to dispose');
      return;
    }

    try {
      // モデルのdisposeメソッドがある場合は呼び出す
      if (this.model && typeof (this.model as any).dispose === 'function') {
        await (this.model as any).dispose();
      }

      this.model = null;
      this.initialized = false;
      logger.info('LocalEmbeddingEngine disposed successfully');
    } catch (error) {
      logger.error('Failed to dispose LocalEmbeddingEngine', error);
      throw new Error(`Failed to dispose embedding engine: ${error}`);
    }
  }

  /**
   * 初期化確認
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.model) {
      throw new Error('LocalEmbeddingEngine not initialized. Call initialize() first.');
    }
  }

  /**
   * キャッシュディレクトリの作成
   * @private
   */
  private ensureCacheDirectory(): void {
    const resolvedCacheDir = path.resolve(this.cacheDir);
    if (!fs.existsSync(resolvedCacheDir)) {
      fs.mkdirSync(resolvedCacheDir, { recursive: true });
      logger.debug(`Created cache directory: ${resolvedCacheDir}`);
    }
  }
}
