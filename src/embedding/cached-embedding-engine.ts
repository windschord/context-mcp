/**
 * Cached Embedding Engine
 *
 * EmbeddingEngineをラップし、クエリキャッシュ機能を提供します。
 * 頻繁に使用されるクエリの埋め込みベクトルをキャッシュすることで、
 * 検索のレスポンス時間を改善します。
 */

import { EmbeddingEngine } from './types';
import { QueryCache, QueryCacheOptions } from '../services/query-cache.js';
import { Logger } from '../utils/logger.js';

/**
 * CachedEmbeddingEngineのオプション
 */
export interface CachedEmbeddingEngineOptions {
  cacheOptions?: QueryCacheOptions;
}

/**
 * CachedEmbeddingEngine
 *
 * EmbeddingEngineの実装をラップし、LRUキャッシュを使用して
 * 埋め込みベクトルをキャッシュします。
 */
export class CachedEmbeddingEngine implements EmbeddingEngine {
  private cache: QueryCache;
  private logger = new Logger('CachedEmbeddingEngine');

  constructor(
    private engine: EmbeddingEngine,
    options: CachedEmbeddingEngineOptions = {}
  ) {
    this.cache = new QueryCache(options.cacheOptions);
    this.logger.info('Cached embedding engine initialized');
  }

  /**
   * 単一テキストの埋め込みベクトルを取得（キャッシュ付き）
   */
  async embed(text: string): Promise<number[]> {
    // キャッシュを確認
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      return cached;
    }

    // キャッシュミス: エンジンから埋め込みを生成
    const embedding = await this.engine.embed(text);

    // キャッシュに保存
    this.cache.set(text, embedding);

    return embedding;
  }

  /**
   * バッチテキストの埋め込みベクトルを取得
   * Note: バッチ処理はキャッシュを使用しません（複雑性を避けるため）
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.engine.embedBatch(texts);
  }

  /**
   * 埋め込みの次元数を取得
   */
  getDimension(): number {
    return this.engine.getDimension();
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * キャッシュ統計をリセット
   */
  resetCacheStats(): void {
    this.cache.resetStats();
  }
}
