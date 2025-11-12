/**
 * Background Update Queue
 *
 * バックグラウンドでファイル更新を非同期に処理するキュー管理システム
 * Promise + setTimeoutによる非同期処理でCPU使用率を制限しながら更新を実行
 */

import { IndexingService } from './indexing-service';
import { logger } from '../utils/logger';

/**
 * キューアイテム
 */
interface QueueItem {
  /** ファイルパス */
  filePath: string;
  /** プロジェクトID */
  projectId: string;
  /** 優先度（高いほど優先）*/
  priority: number;
  /** タイムスタンプ（エンキュー時刻） */
  timestamp: number;
}

/**
 * キュー統計情報
 */
export interface QueueStats {
  /** キューのサイズ */
  queueSize: number;
  /** 処理中かどうか */
  isProcessing: boolean;
  /** 処理済みカウント */
  processedCount: number;
}

/**
 * バックグラウンド更新キューのオプション
 */
export interface BackgroundUpdateQueueOptions {
  /**
   * 処理間隔（ミリ秒）
   * @default 100
   */
  processingIntervalMs?: number;
}

/**
 * Background Update Queue
 *
 * 特徴:
 * - FIFO（First In First Out）+ 優先度付きキュー
 * - 同じファイルの重複排除（最新のエントリで上書き）
 * - タイムスタンプベースの優先度（最近の変更ほど高優先度）
 * - Promise + setTimeoutによるバックグラウンド処理
 * - CPU使用率制限（処理間隔の調整）
 */
export class BackgroundUpdateQueue {
  private queue: Map<string, QueueItem> = new Map();
  private isProcessing = false;
  private processedCount = 0;
  private processingIntervalMs: number;

  constructor(
    private indexingService: IndexingService,
    options: BackgroundUpdateQueueOptions = {}
  ) {
    this.processingIntervalMs = options.processingIntervalMs ?? 100;
  }

  /**
   * ファイル更新をキューに追加
   *
   * 同じファイルパスが既にキューに存在する場合、優先度とタイムスタンプを更新
   */
  enqueue(filePath: string, projectId: string, priority?: number): void {
    const timestamp = Date.now();

    // 優先度が指定されていない場合、タイムスタンプを優先度として使用
    // これにより、最近の変更ほど高優先度になる
    const effectivePriority = priority ?? timestamp;

    // 既存のエントリがある場合は上書き（重複排除）
    this.queue.set(filePath, {
      filePath,
      projectId,
      priority: effectivePriority,
      timestamp,
    });

    logger.debug('File enqueued for background update', {
      filePath,
      projectId,
      priority: effectivePriority,
      queueSize: this.queue.size,
    });
  }

  /**
   * キューの処理を開始
   */
  start(): void {
    if (this.isProcessing) {
      logger.debug('Background update queue is already processing');
      return;
    }

    this.isProcessing = true;
    logger.info('Starting background update queue processing');

    // 非同期でキュー処理を開始
    this.processQueue();
  }

  /**
   * キューの処理を停止
   */
  stop(): void {
    if (!this.isProcessing) {
      logger.debug('Background update queue is not processing');
      return;
    }

    this.isProcessing = false;
    logger.info('Stopping background update queue processing');
  }

  /**
   * キューをクリア
   */
  clear(): void {
    this.queue.clear();
    logger.info('Background update queue cleared');
  }

  /**
   * キューの状態を取得
   */
  getStats(): QueueStats {
    return {
      queueSize: this.queue.size,
      isProcessing: this.isProcessing,
      processedCount: this.processedCount,
    };
  }

  /**
   * キューを処理（内部実装）
   */
  private async processQueue(): Promise<void> {
    while (this.isProcessing) {
      // キューが空の場合は待機
      if (this.queue.size === 0) {
        await this.sleep(this.processingIntervalMs);
        continue;
      }

      // 優先度順にソートして次のアイテムを取得
      const nextItem = this.getNextItem();
      if (!nextItem) {
        await this.sleep(this.processingIntervalMs);
        continue;
      }

      // キューから削除
      this.queue.delete(nextItem.filePath);

      try {
        // ファイルを更新
        logger.debug('Processing file update', {
          filePath: nextItem.filePath,
          projectId: nextItem.projectId,
          priority: nextItem.priority,
        });

        await this.indexingService.updateFile(nextItem.filePath, nextItem.projectId);

        this.processedCount++;

        logger.debug('File update completed', {
          filePath: nextItem.filePath,
          processedCount: this.processedCount,
        });
      } catch (error) {
        // エラーが発生してもキュー処理は継続
        logger.error('Error processing file update', {
          filePath: nextItem.filePath,
          error: error instanceof Error ? error.message : String(error),
        });

        // エラーでも処理済みとしてカウント
        this.processedCount++;
      }

      // CPU使用率制限のため、処理間隔を設ける
      await this.sleep(this.processingIntervalMs);
    }

    logger.info('Background update queue processing stopped');
  }

  /**
   * 次に処理するアイテムを取得
   * 優先度が高いものから取得し、優先度が同じ場合はタイムスタンプが新しいものを優先
   */
  private getNextItem(): QueueItem | null {
    if (this.queue.size === 0) {
      return null;
    }

    const items = Array.from(this.queue.values());

    // 優先度順、同じ優先度の場合はタイムスタンプ順（新しい方が優先）でソート
    items.sort((a, b) => {
      // 優先度が異なる場合は優先度が高い方を優先
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      // 優先度が同じ場合はタイムスタンプが新しい方を優先
      return b.timestamp - a.timestamp;
    });

    return items[0] ?? null;
  }

  /**
   * 指定されたミリ秒待機
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
