import { promises as fsPromises } from 'fs';
import * as path from 'path';
import {
  LspMcpConfig,
  DEFAULT_CONFIG,
  Mode,
  VectorStoreBackend,
  EmbeddingProvider,
} from './types.js';
import { ConfigValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * 設定ファイル管理クラス
 * .lsp-mcp.jsonの読み込み、バリデーション、デフォルト値の提供を行う
 */
export class ConfigManager {
  private config?: LspMcpConfig;
  private readonly configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), '.lsp-mcp.json');
  }

  /**
   * 設定ファイルを読み込み、バリデーションとマージを行う
   * @returns バリデーション済みの設定オブジェクト
   */
  async loadConfig(): Promise<LspMcpConfig> {
    let userConfig: Partial<LspMcpConfig> = {};

    // 設定ファイルが存在する場合は読み込む
    try {
      const fileContent = await fsPromises.readFile(this.configPath, 'utf-8');
      userConfig = JSON.parse(fileContent);
      logger.info(`設定ファイルを読み込みました: ${this.configPath}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info(`設定ファイルが見つかりません。デフォルト設定を使用します: ${this.configPath}`);
      } else if (error instanceof SyntaxError) {
        throw new ConfigValidationError(
          `設定ファイルのJSON形式が不正です: ${this.configPath}`,
          { cause: error },
          'JSONの構文エラーを修正してください。末尾のカンマ、引用符の不一致、括弧の不一致などを確認してください。'
        );
      } else {
        throw error;
      }
    }

    // デフォルト設定とマージ
    const mergedConfig = this.mergeConfigs(DEFAULT_CONFIG, userConfig);

    // 環境変数からのオーバーライド
    const finalConfig = this.applyEnvironmentOverrides(mergedConfig);

    // バリデーション
    this.validateConfig(finalConfig);

    // 設定を保存
    this.config = finalConfig;

    return finalConfig;
  }

  /**
   * 設定ファイルのバリデーション
   * @param config バリデーション対象の設定
   * @throws ConfigValidationError バリデーションエラー
   */
  validateConfig(config: LspMcpConfig): void {
    // 必須フィールドのチェック
    if (!config.mode) {
      throw new ConfigValidationError(
        'mode フィールドは必須です',
        undefined,
        '設定ファイルに "mode": "local" または "mode": "cloud" を追加してください。'
      );
    }

    if (!config.vectorStore) {
      throw new ConfigValidationError(
        'vectorStore フィールドは必須です',
        undefined,
        '設定ファイルに "vectorStore": {"backend": "milvus", "config": {...}} を追加してください。'
      );
    }

    if (!config.embedding) {
      throw new ConfigValidationError(
        'embedding フィールドは必須です',
        undefined,
        '設定ファイルに "embedding": {"provider": "transformers", "model": "Xenova/all-MiniLM-L6-v2", "local": true} を追加してください。'
      );
    }

    // mode のバリデーション
    const validModes: Mode[] = ['local', 'cloud'];
    if (!validModes.includes(config.mode)) {
      throw new ConfigValidationError(
        `無効なモードです: ${config.mode}。有効な値: ${validModes.join(', ')}`,
        undefined,
        `"mode"を"${validModes[0]}"または"${validModes[1]}"に設定してください。ローカル実行の場合は"local"、クラウド連携する場合は"cloud"を選択します。`
      );
    }

    // vectorStore.backend のバリデーション
    const validBackends: VectorStoreBackend[] = ['milvus', 'zilliz', 'qdrant'];
    if (!validBackends.includes(config.vectorStore.backend)) {
      throw new ConfigValidationError(
        `無効なベクターDBバックエンドです: ${config.vectorStore.backend}。有効な値: ${validBackends.join(', ')}`,
        undefined,
        'ローカル実行の場合は"milvus"（Docker必要）または"chroma"（軽量）、クラウド連携の場合は"zilliz"または"qdrant"を選択してください。'
      );
    }

    // embedding.provider のバリデーション
    const validProviders: EmbeddingProvider[] = ['transformers', 'openai', 'voyageai'];
    if (!validProviders.includes(config.embedding.provider)) {
      throw new ConfigValidationError(
        `無効な埋め込みプロバイダーです: ${config.embedding.provider}。有効な値: ${validProviders.join(', ')}`,
        undefined,
        'ローカル実行の場合は"transformers"、クラウドAPIを使用する場合は"openai"または"voyageai"を選択してください。'
      );
    }

    // search weights のバリデーション（警告のみ）
    if (config.search) {
      const totalWeight = config.search.bm25Weight + config.search.vectorWeight;
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        logger.warn(
          `検索スコアの重み合計が1.0ではありません（現在: ${totalWeight}）。bm25Weight=${config.search.bm25Weight}, vectorWeight=${config.search.vectorWeight}`
        );
      }
    }

    // ローカルモードの制約チェック
    if (config.mode === 'local') {
      if (!config.embedding.local) {
        logger.warn('ローカルモードですが、埋め込み設定でlocal=falseが指定されています');
      }

      if (config.vectorStore.backend === 'zilliz' || config.vectorStore.backend === 'qdrant') {
        logger.warn(
          `ローカルモードでクラウドベクターDB（${config.vectorStore.backend}）が指定されています`
        );
      }
    }

    // クラウドモードの推奨チェック
    if (config.mode === 'cloud') {
      if (config.privacy?.blockExternalCalls) {
        logger.warn('クラウドモードですが、外部通信ブロック（blockExternalCalls）が有効です');
      }
    }

    logger.info('設定ファイルのバリデーションに成功しました');
  }

  /**
   * デフォルト設定とユーザー設定をマージする
   * @param defaultConfig デフォルト設定
   * @param userConfig ユーザー設定
   * @returns マージされた設定
   */
  private mergeConfigs(
    defaultConfig: LspMcpConfig,
    userConfig: Partial<LspMcpConfig>
  ): LspMcpConfig {
    // ディープマージを実行（配列は上書き、オブジェクトは再帰的にマージ）
    const merged = { ...defaultConfig };

    // トップレベルのフィールドをマージ
    if (userConfig.mode !== undefined) {
      merged.mode = userConfig.mode;
    }

    // vectorStore のマージ
    if (userConfig.vectorStore) {
      merged.vectorStore = {
        backend: userConfig.vectorStore.backend || defaultConfig.vectorStore.backend,
        config: {
          ...defaultConfig.vectorStore.config,
          ...userConfig.vectorStore.config,
        },
      };
    }

    // embedding のマージ
    if (userConfig.embedding) {
      merged.embedding = {
        ...defaultConfig.embedding,
        ...userConfig.embedding,
      };
    }

    // privacy のマージ
    if (userConfig.privacy) {
      merged.privacy = {
        ...defaultConfig.privacy,
        ...userConfig.privacy,
      };
    }

    // search のマージ
    if (userConfig.search) {
      merged.search = {
        ...defaultConfig.search,
        ...userConfig.search,
      };
    }

    // indexing のマージ（配列は上書き）
    if (userConfig.indexing) {
      merged.indexing = {
        languages: userConfig.indexing.languages || defaultConfig.indexing?.languages || [],
        excludePatterns:
          userConfig.indexing.excludePatterns || defaultConfig.indexing?.excludePatterns || [],
        includeDocuments:
          userConfig.indexing.includeDocuments ?? defaultConfig.indexing?.includeDocuments ?? true,
      };
    }

    return merged;
  }

  /**
   * 環境変数から設定をオーバーライドする
   * @param config 現在の設定
   * @returns オーバーライドされた設定
   */
  private applyEnvironmentOverrides(config: LspMcpConfig): LspMcpConfig {
    const overridden = { ...config };

    // LSP_MCP_MODE
    if (process.env['LSP_MCP_MODE']) {
      const mode = process.env['LSP_MCP_MODE'] as Mode;
      overridden.mode = mode;
      logger.info(`環境変数 LSP_MCP_MODE からモードをオーバーライド: ${mode}`);
    }

    // LSP_MCP_VECTOR_BACKEND
    if (process.env['LSP_MCP_VECTOR_BACKEND']) {
      const backend = process.env['LSP_MCP_VECTOR_BACKEND'] as VectorStoreBackend;
      overridden.vectorStore = {
        ...overridden.vectorStore,
        backend,
      };
      logger.info(`環境変数 LSP_MCP_VECTOR_BACKEND からベクターDBをオーバーライド: ${backend}`);
    }

    // LSP_MCP_EMBEDDING_PROVIDER
    if (process.env['LSP_MCP_EMBEDDING_PROVIDER']) {
      const provider = process.env['LSP_MCP_EMBEDDING_PROVIDER'] as EmbeddingProvider;
      overridden.embedding = {
        ...overridden.embedding,
        provider,
      };
      logger.info(
        `環境変数 LSP_MCP_EMBEDDING_PROVIDER から埋め込みプロバイダーをオーバーライド: ${provider}`
      );
    }

    // LSP_MCP_EMBEDDING_API_KEY
    if (process.env['LSP_MCP_EMBEDDING_API_KEY']) {
      overridden.embedding = {
        ...overridden.embedding,
        apiKey: process.env['LSP_MCP_EMBEDDING_API_KEY'],
      };
      logger.info('環境変数 LSP_MCP_EMBEDDING_API_KEY から埋め込みAPIキーをオーバーライド');
    }

    // LSP_MCP_VECTOR_ADDRESS
    if (process.env['LSP_MCP_VECTOR_ADDRESS']) {
      overridden.vectorStore = {
        ...overridden.vectorStore,
        config: {
          ...overridden.vectorStore.config,
          address: process.env['LSP_MCP_VECTOR_ADDRESS'],
        },
      };
      logger.info(
        `環境変数 LSP_MCP_VECTOR_ADDRESS からベクターDBアドレスをオーバーライド: ${process.env['LSP_MCP_VECTOR_ADDRESS']}`
      );
    }

    // LSP_MCP_VECTOR_TOKEN
    if (process.env['LSP_MCP_VECTOR_TOKEN']) {
      overridden.vectorStore = {
        ...overridden.vectorStore,
        config: {
          ...overridden.vectorStore.config,
          token: process.env['LSP_MCP_VECTOR_TOKEN'],
        },
      };
      logger.info('環境変数 LSP_MCP_VECTOR_TOKEN からベクターDBトークンをオーバーライド');
    }

    return overridden;
  }

  /**
   * 現在の設定を取得する
   * @returns 現在の設定
   * @throws Error 設定が読み込まれていない場合
   */
  getConfig(): LspMcpConfig {
    if (!this.config) {
      throw new Error('設定がまだ読み込まれていません。先に loadConfig() を呼び出してください');
    }
    return this.config;
  }

  /**
   * 設定ファイルのパスを取得する
   * @returns 設定ファイルのパス
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
