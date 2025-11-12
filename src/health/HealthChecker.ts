/**
 * Health Checker
 *
 * LSP-MCPサーバーと依存サービスのヘルスチェックを実行
 */

import type { EmbeddingEngine } from '../embedding/types';
import type { VectorStorePlugin } from '../storage/types';
import { Logger } from '../utils/logger';
import type { HealthStatus, DependencyStatus, HealthCheckCacheEntry } from './types';

/**
 * ヘルスチェッククラス
 *
 * サーバーの稼働状態と依存サービス（ベクターDB、埋め込みエンジン）の死活監視を実行します。
 * 結果は30秒間キャッシュされ、頻繁な呼び出しでも負荷を軽減します。
 */
export class HealthChecker {
  private logger: Logger;
  private startTime: number;
  private version: string;
  private embeddingEngine?: EmbeddingEngine;
  private vectorStore?: VectorStorePlugin;
  private cache?: HealthCheckCacheEntry;
  private readonly cacheTTL = 30000; // 30秒
  private readonly timeout = 5000; // 5秒

  constructor(version: string, embeddingEngine?: EmbeddingEngine, vectorStore?: VectorStorePlugin) {
    this.logger = new Logger();
    this.startTime = Date.now();
    this.version = version;
    this.embeddingEngine = embeddingEngine;
    this.vectorStore = vectorStore;
  }

  /**
   * 全体のヘルスチェックを実行
   *
   * キャッシュが有効な場合はキャッシュから結果を返します。
   * @returns ヘルスステータス
   */
  async checkHealth(): Promise<HealthStatus> {
    // キャッシュが有効な場合は返却
    if (this.cache && Date.now() - this.cache.cachedAt < this.cacheTTL) {
      this.logger.debug('Health check result from cache');
      return this.cache.status;
    }

    this.logger.debug('Executing health check');

    // 依存サービスをチェック
    const [vectorStoreStatus, embeddingEngineStatus] = await Promise.all([
      this.checkVectorStore(),
      this.checkEmbeddingEngine(),
    ]);

    // 全体のステータスを判定
    const overallStatus = this.determineOverallStatus(vectorStoreStatus, embeddingEngineStatus);

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: this.version,
      dependencies: {
        vectorStore: vectorStoreStatus,
        embeddingEngine: embeddingEngineStatus,
      },
    };

    // キャッシュを更新
    this.cache = {
      status: healthStatus,
      cachedAt: Date.now(),
    };

    return healthStatus;
  }

  /**
   * ベクターDBの死活監視
   *
   * コネクションチェックと軽量クエリを実行し、レイテンシーを測定します。
   * @returns ベクターDBのステータス
   */
  async checkVectorStore(): Promise<DependencyStatus> {
    if (!this.vectorStore) {
      return {
        status: 'unknown',
        error: 'VectorStore not initialized',
      };
    }

    try {
      const startTime = Date.now();

      // タイムアウト付きでチェックを実行
      await this.executeWithTimeout(async () => {
        // コレクションの統計情報を取得して接続をテスト
        // 実際のコレクション名は環境に応じて変更可能
        try {
          await this.vectorStore!.getStats('code_vectors');
        } catch (error) {
          // コレクションが存在しない場合もエラーとして扱わない
          // （まだインデックス化されていない可能性がある）
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (
            !errorMessage.includes('not exist') &&
            !errorMessage.includes('not found') &&
            !errorMessage.includes('does not exist')
          ) {
            throw error;
          }
        }
      }, this.timeout);

      const latency = Date.now() - startTime;

      return {
        status: 'up',
        latency,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('VectorStore health check failed', { error: errorMessage });

      return {
        status: 'down',
        error: errorMessage,
      };
    }
  }

  /**
   * 埋め込みエンジンの死活監視
   *
   * ダミーテキストの埋め込み生成テストを実行し、レイテンシーを測定します。
   * @returns 埋め込みエンジンのステータス
   */
  async checkEmbeddingEngine(): Promise<DependencyStatus> {
    if (!this.embeddingEngine) {
      return {
        status: 'unknown',
        error: 'EmbeddingEngine not initialized',
      };
    }

    try {
      const startTime = Date.now();

      // タイムアウト付きでチェックを実行
      await this.executeWithTimeout(async () => {
        // ダミーテキストで埋め込みをテスト
        const testText = 'health check';
        const vector = await this.embeddingEngine!.embed(testText);

        // ベクトルが正しく生成されたか検証
        if (!Array.isArray(vector) || vector.length === 0) {
          throw new Error('Invalid embedding vector generated');
        }
      }, this.timeout);

      const latency = Date.now() - startTime;

      return {
        status: 'up',
        latency,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('EmbeddingEngine health check failed', { error: errorMessage });

      return {
        status: 'down',
        error: errorMessage,
      };
    }
  }

  /**
   * 現在のステータスを取得（キャッシュのみ）
   *
   * 新しいヘルスチェックを実行せず、キャッシュから結果を返します。
   * @returns ヘルスステータス（キャッシュがない場合はundefined）
   */
  getStatus(): HealthStatus | undefined {
    if (this.cache && Date.now() - this.cache.cachedAt < this.cacheTTL) {
      return this.cache.status;
    }
    return undefined;
  }

  /**
   * 全体のステータスを判定
   *
   * @param vectorStoreStatus ベクターDBのステータス
   * @param embeddingEngineStatus 埋め込みエンジンのステータス
   * @returns 全体のステータス
   */
  private determineOverallStatus(
    vectorStoreStatus: DependencyStatus,
    embeddingEngineStatus: DependencyStatus
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const vectorStoreUp = vectorStoreStatus.status === 'up';
    const embeddingEngineUp = embeddingEngineStatus.status === 'up';

    // すべての依存サービスが稼働中の場合
    if (vectorStoreUp && embeddingEngineUp) {
      return 'healthy';
    }

    // どちらか一方が稼働中の場合（劣化）
    if (vectorStoreUp || embeddingEngineUp) {
      return 'degraded';
    }

    // すべての依存サービスがダウンまたは不明の場合
    return 'unhealthy';
  }

  /**
   * タイムアウト付きで処理を実行
   *
   * @param operation 実行する処理
   * @param timeoutMs タイムアウト時間（ミリ秒）
   * @returns 処理の結果
   * @throws タイムアウトまたは処理のエラー
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
}
