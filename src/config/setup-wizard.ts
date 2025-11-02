/**
 * Setup Wizard
 *
 * 初回セットアップ時のウィザード機能
 * ユーザーフレンドリーな設定ファイル生成をサポート
 */

import * as fs from 'fs';
import * as path from 'path';
import { LspMcpConfig, Mode, VectorStoreBackend, EmbeddingProvider } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * セットアップオプション
 */
export interface SetupOptions {
  mode: Mode;
  vectorBackend: VectorStoreBackend;
  embeddingProvider: EmbeddingProvider;
  vectorAddress?: string;
  vectorToken?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
}

/**
 * プリセット名
 */
export type PresetName = 'quickstart' | 'performance' | 'cloud';

/**
 * 保存オプション
 */
export interface SaveOptions {
  overwrite?: boolean;
}

/**
 * セットアップウィザードクラス
 *
 * 初回セットアップ時の設定ファイル生成をサポートします。
 */
export class SetupWizard {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.lsp-mcp.json');
  }

  /**
   * ユーザーオプションから設定を生成
   *
   * @param options セットアップオプション
   * @returns 生成された設定
   */
  async generateConfig(options: SetupOptions): Promise<LspMcpConfig> {
    // バリデーション
    this.validateOptions(options);

    // 基本設定
    const config: LspMcpConfig = {
      mode: options.mode,
      vectorStore: this.createVectorStoreConfig(options),
      embedding: this.createEmbeddingConfig(options),
      privacy: this.createPrivacyConfig(options),
      search: {
        bm25Weight: 0.3,
        vectorWeight: 0.7,
      },
      indexing: {
        languages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'c', 'cpp'],
        excludePatterns: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '.git/**',
          '*.min.js',
          '.env',
          '.env.*',
          'credentials.json',
          '**/secret/**',
          '**/secrets/**',
        ],
        includeDocuments: true,
      },
    };

    // モード不一致の警告
    this.checkConsistency(config);

    return config;
  }

  /**
   * ベクターストア設定を生成
   */
  private createVectorStoreConfig(options: SetupOptions) {
    const { vectorBackend, vectorAddress, vectorToken, mode } = options;

    switch (vectorBackend) {
      case 'milvus':
        return {
          backend: 'milvus' as const,
          config: {
            address: vectorAddress || 'localhost:19530',
            standalone: mode === 'local',
            dataPath: './volumes',
          },
        };

      case 'chroma':
        return {
          backend: 'chroma' as const,
          config: {
            path: './.lsp-mcp/chroma',
          },
        };

      case 'zilliz':
        return {
          backend: 'zilliz' as const,
          config: {
            address: vectorAddress || '',
            token: vectorToken || '',
          },
        };

      case 'qdrant':
        return {
          backend: 'qdrant' as const,
          config: {
            address: vectorAddress || '',
            token: vectorToken || '',
          },
        };

      default:
        throw new Error(`未対応のベクターDBバックエンドです: ${vectorBackend}`);
    }
  }

  /**
   * 埋め込み設定を生成
   */
  private createEmbeddingConfig(options: SetupOptions) {
    const { embeddingProvider, embeddingApiKey, embeddingModel, mode } = options;

    switch (embeddingProvider) {
      case 'transformers':
        return {
          provider: 'transformers' as const,
          model: embeddingModel || 'Xenova/all-MiniLM-L6-v2',
          local: true,
        };

      case 'openai':
        if (mode === 'cloud' && !embeddingApiKey) {
          throw new Error('クラウドモードではAPIキーが必要です');
        }
        return {
          provider: 'openai' as const,
          model: embeddingModel || 'text-embedding-3-small',
          local: false,
          apiKey: embeddingApiKey,
        };

      case 'voyageai':
        if (mode === 'cloud' && !embeddingApiKey) {
          throw new Error('クラウドモードではAPIキーが必要です');
        }
        return {
          provider: 'voyageai' as const,
          model: embeddingModel || 'voyage-2',
          local: false,
          apiKey: embeddingApiKey,
        };

      default:
        throw new Error(`未対応の埋め込みプロバイダーです: ${embeddingProvider}`);
    }
  }

  /**
   * プライバシー設定を生成
   */
  private createPrivacyConfig(options: SetupOptions) {
    return {
      blockExternalCalls: options.mode === 'local',
    };
  }

  /**
   * オプションのバリデーション
   */
  private validateOptions(options: SetupOptions): void {
    const validModes: Mode[] = ['local', 'cloud'];
    if (!validModes.includes(options.mode)) {
      throw new Error(`無効なモードです: ${options.mode}`);
    }

    const validBackends: VectorStoreBackend[] = ['milvus', 'chroma', 'zilliz', 'qdrant'];
    if (!validBackends.includes(options.vectorBackend)) {
      throw new Error(`無効なベクターDBバックエンドです: ${options.vectorBackend}`);
    }

    const validProviders: EmbeddingProvider[] = ['transformers', 'openai', 'voyageai'];
    if (!validProviders.includes(options.embeddingProvider)) {
      throw new Error(`無効な埋め込みプロバイダーです: ${options.embeddingProvider}`);
    }
  }

  /**
   * モード整合性をチェックして警告
   */
  private checkConsistency(config: LspMcpConfig): void {
    if (config.mode === 'local') {
      if (config.embedding.provider !== 'transformers') {
        console.warn(
          `警告: ローカルモードですが、クラウド埋め込みプロバイダー（${config.embedding.provider}）が指定されています`
        );
      }
      if (config.vectorStore.backend === 'zilliz' || config.vectorStore.backend === 'qdrant') {
        console.warn(
          `警告: ローカルモードですが、クラウドベクターDB（${config.vectorStore.backend}）が指定されています`
        );
      }
    }
  }

  /**
   * 設定をファイルに保存
   *
   * @param config 保存する設定
   * @param options 保存オプション
   */
  async saveConfig(config: LspMcpConfig, options?: SaveOptions): Promise<void> {
    const { overwrite = false } = options || {};

    // ファイルが既に存在する場合のチェック
    if (fs.existsSync(this.configPath) && !overwrite) {
      throw new Error(`設定ファイルが既に存在します: ${this.configPath}`);
    }

    // ディレクトリの作成
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 設定をJSON形式で保存
    const json = this.exportConfig(config);
    fs.writeFileSync(this.configPath, json, 'utf-8');

    logger.info(`設定ファイルを保存しました: ${this.configPath}`);
  }

  /**
   * プリセットを使用して設定を生成
   *
   * @param preset プリセット名
   * @param cloudOptions クラウドプリセット用のオプション
   * @returns 生成された設定
   */
  async usePreset(preset: PresetName, cloudOptions?: Partial<SetupOptions>): Promise<LspMcpConfig> {
    switch (preset) {
      case 'quickstart':
        // Docker不要の最速セットアップ
        return this.generateConfig({
          mode: 'local',
          vectorBackend: 'chroma',
          embeddingProvider: 'transformers',
        });

      case 'performance':
        // パフォーマンス重視（Milvus使用）
        return this.generateConfig({
          mode: 'local',
          vectorBackend: 'milvus',
          embeddingProvider: 'transformers',
        });

      case 'cloud':
        // クラウドモード
        if (!cloudOptions?.vectorAddress || !cloudOptions?.vectorToken || !cloudOptions?.embeddingApiKey) {
          throw new Error('クラウドプリセットにはvectorAddress, vectorToken, embeddingApiKeyが必要です');
        }
        return this.generateConfig({
          mode: 'cloud',
          vectorBackend: 'zilliz',
          embeddingProvider: 'openai',
          vectorAddress: cloudOptions.vectorAddress,
          vectorToken: cloudOptions.vectorToken,
          embeddingApiKey: cloudOptions.embeddingApiKey,
        });

      default:
        throw new Error(`無効なプリセット名です: ${preset}`);
    }
  }

  /**
   * インタラクティブセットアップを実行
   *
   * @param userInput ユーザー入力
   * @returns 生成された設定
   */
  async runInteractive(userInput: SetupOptions): Promise<LspMcpConfig> {
    return this.generateConfig(userInput);
  }

  /**
   * 設定をJSON文字列としてエクスポート
   *
   * @param config 設定オブジェクト
   * @returns JSON文字列
   */
  exportConfig(config: LspMcpConfig): string {
    return JSON.stringify(config, null, 2);
  }

  /**
   * JSON文字列から設定をインポート
   *
   * @param json JSON文字列
   * @returns 設定オブジェクト
   */
  async importConfig(json: string): Promise<LspMcpConfig> {
    try {
      const config = JSON.parse(json) as LspMcpConfig;
      return config;
    } catch (error) {
      throw new Error('無効なJSON形式です');
    }
  }
}
