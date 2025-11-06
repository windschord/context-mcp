/**
 * Health Check Types
 *
 * ヘルスチェック関連の型定義
 */

/**
 * 依存サービスのステータス
 */
export interface DependencyStatus {
  /** ステータス（up: 稼働中, down: ダウン, unknown: 不明） */
  status: 'up' | 'down' | 'unknown';
  /** レイテンシー（ミリ秒） */
  latency?: number;
  /** エラーメッセージ */
  error?: string;
}

/**
 * 全体のヘルスステータス
 */
export interface HealthStatus {
  /** 全体のステータス（healthy: 正常, degraded: 劣化, unhealthy: 異常） */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** タイムスタンプ（ISO 8601形式） */
  timestamp: string;
  /** 稼働時間（秒） */
  uptime: number;
  /** バージョン */
  version: string;
  /** 依存サービスのステータス */
  dependencies: {
    vectorStore: DependencyStatus;
    embeddingEngine: DependencyStatus;
  };
}

/**
 * ヘルスチェックキャッシュエントリ
 */
export interface HealthCheckCacheEntry {
  /** ヘルスステータス */
  status: HealthStatus;
  /** キャッシュ作成時刻 */
  cachedAt: number;
}
