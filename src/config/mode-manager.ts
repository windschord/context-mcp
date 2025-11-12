/**
 * Mode Manager
 *
 * ローカルモードとクラウドモードの切り替え、
 * プロバイダー初期化、モード不一致の検証を管理
 */

import { ContextMcpConfig, Mode } from './types.js';
import {
  EmbeddingEngine,
  LocalEmbeddingOptions,
  CloudEmbeddingOptions,
} from '../embedding/types.js';
import { logger } from '../utils/logger.js';

/**
 * 埋め込みエンジンのファクトリー関数型
 */
export type LocalEmbeddingFactory = (options: LocalEmbeddingOptions) => EmbeddingEngine;
export type CloudEmbeddingFactory = (options: CloudEmbeddingOptions) => EmbeddingEngine;

/**
 * モード管理クラス
 *
 * ローカルモードとクラウドモードの切り替え、
 * 適切なプロバイダーの初期化、モード不一致の警告を提供します。
 */
export class ModeManager {
  private config: ContextMcpConfig;
  private embeddingEngine?: EmbeddingEngine;

  constructor(config: ContextMcpConfig) {
    this.config = config;
  }

  /**
   * 現在のモードを取得
   */
  getMode(): Mode {
    return this.config.mode;
  }

  /**
   * ローカルモードかどうかを判定
   */
  isLocalMode(): boolean {
    return this.config.mode === 'local';
  }

  /**
   * クラウドモードかどうかを判定
   */
  isCloudMode(): boolean {
    return this.config.mode === 'cloud';
  }

  /**
   * 外部通信をブロックすべきかを判定
   */
  shouldBlockExternalCalls(): boolean {
    return this.config.privacy?.blockExternalCalls ?? false;
  }

  /**
   * モードとプロバイダー設定の整合性を検証
   * @returns 警告メッセージの配列（問題がない場合は空配列）
   */
  validateModeConsistency(): string[] {
    const warnings: string[] = [];

    // ローカルモードの検証
    if (this.isLocalMode()) {
      // クラウド埋め込みプロバイダーの使用をチェック
      if (
        this.config.embedding.provider === 'openai' ||
        this.config.embedding.provider === 'voyageai'
      ) {
        warnings.push(
          `ローカルモードですが、クラウド埋め込みプロバイダー（${this.config.embedding.provider}）が指定されています`
        );
      }

      // クラウドベクターDBの使用をチェック
      if (
        this.config.vectorStore.backend === 'zilliz' ||
        this.config.vectorStore.backend === 'qdrant'
      ) {
        warnings.push(
          `ローカルモードですが、クラウドベクターDB（${this.config.vectorStore.backend}）が指定されています`
        );
      }

      // embedding.localフラグのチェック
      if (this.config.embedding.local === false) {
        warnings.push('ローカルモードですが、埋め込み設定でlocal=falseが指定されています');
      }
    }

    // クラウドモードの検証
    if (this.isCloudMode()) {
      // ローカル埋め込みプロバイダーの使用をチェック
      if (this.config.embedding.provider === 'transformers') {
        warnings.push(
          `クラウドモードですが、ローカル埋め込みプロバイダー（${this.config.embedding.provider}）が指定されています`
        );
      }

      // 外部通信ブロックのチェック
      if (this.shouldBlockExternalCalls()) {
        warnings.push('クラウドモードですが、外部通信ブロック（blockExternalCalls）が有効です');
      }

      // embedding.localフラグのチェック
      if (this.config.embedding.local === true) {
        warnings.push('クラウドモードですが、埋め込み設定でlocal=trueが指定されています');
      }
    }

    // 警告をログに出力
    warnings.forEach((warning) => {
      logger.warn(`[モード不一致] ${warning}`);
    });

    return warnings;
  }

  /**
   * 埋め込みエンジンを初期化
   *
   * モードに応じて適切なエンジンを初期化します。
   *
   * @param localFactory ローカル埋め込みエンジンのファクトリー関数
   * @param cloudFactory クラウド埋め込みエンジンのファクトリー関数
   */
  async initializeEmbeddingEngine(
    localFactory: LocalEmbeddingFactory,
    cloudFactory: CloudEmbeddingFactory
  ): Promise<void> {
    logger.info(`埋め込みエンジンを初期化中: ${this.config.embedding.provider}`);

    // モード整合性の検証と警告
    this.validateModeConsistency();

    // プロバイダーに応じてエンジンを作成
    if (this.config.embedding.provider === 'transformers') {
      // ローカル埋め込み
      const options: LocalEmbeddingOptions = {
        modelName: this.config.embedding.model,
        cacheDir: './.context-mcp/models',
      };

      this.embeddingEngine = localFactory(options);
    } else if (
      this.config.embedding.provider === 'openai' ||
      this.config.embedding.provider === 'voyageai'
    ) {
      // クラウド埋め込み
      const apiKey = this.config.embedding.apiKey;

      if (!apiKey) {
        throw new Error(
          `クラウド埋め込みプロバイダー（${this.config.embedding.provider}）にはAPIキーが必要です`
        );
      }

      const options: CloudEmbeddingOptions = {
        provider: this.config.embedding.provider,
        apiKey,
        modelName: this.config.embedding.model,
      };

      this.embeddingEngine = cloudFactory(options);
    } else {
      throw new Error(
        `未対応の埋め込みプロバイダーです: ${this.config.embedding.provider as string}`
      );
    }

    // エンジンを初期化
    await this.embeddingEngine.initialize();
    logger.info('埋め込みエンジンの初期化が完了しました');
  }

  /**
   * 埋め込みエンジンを取得
   *
   * @returns 初期化済みの埋め込みエンジン
   * @throws 初期化されていない場合
   */
  getEmbeddingEngine(): EmbeddingEngine {
    if (!this.embeddingEngine) {
      throw new Error(
        '埋め込みエンジンが初期化されていません。先に initializeEmbeddingEngine() を呼び出してください'
      );
    }
    return this.embeddingEngine;
  }

  /**
   * リソースを解放
   */
  async dispose(): Promise<void> {
    if (this.embeddingEngine) {
      logger.info('埋め込みエンジンを解放中...');
      await this.embeddingEngine.dispose();
      this.embeddingEngine = undefined;
      logger.info('埋め込みエンジンを解放しました');
    }
  }

  /**
   * 設定を取得
   */
  getConfig(): ContextMcpConfig {
    return this.config;
  }
}
