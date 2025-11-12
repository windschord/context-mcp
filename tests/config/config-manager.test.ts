import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../../src/config/config-manager.js';
import { ContextMcpConfig, DEFAULT_CONFIG } from '../../src/config/types.js';
import { ConfigValidationError } from '../../src/utils/errors.js';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testConfigPath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 環境変数のバックアップ
    originalEnv = { ...process.env };

    // テスト用の設定ファイルパス
    testConfigPath = path.join(process.cwd(), 'tmp', '.context-mcp.test.json');

    // tmpディレクトリを作成
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    configManager = new ConfigManager(testConfigPath);
  });

  afterEach(() => {
    // テストファイルのクリーンアップ
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }

    // 環境変数の復元
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('設定ファイルが存在しない場合、デフォルト設定を返す', async () => {
      const config = await configManager.loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('有効な設定ファイルを読み込める', async () => {
      const testConfig: ContextMcpConfig = {
        mode: 'cloud',
        vectorStore: {
          backend: 'zilliz',
          config: {
            address: 'test.zilliz.com:19530',
            token: 'test-token',
          },
        },
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          apiKey: 'test-key',
          local: false,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

      const config = await configManager.loadConfig();
      expect(config.mode).toBe('cloud');
      expect(config.vectorStore.backend).toBe('zilliz');
      expect(config.embedding.provider).toBe('openai');
    });

    it('部分的な設定ファイルの場合、デフォルト値でマージされる', async () => {
      const partialConfig = {
        mode: 'cloud',
        vectorStore: {
          backend: 'zilliz',
          config: {
            address: 'test.zilliz.com:19530',
          },
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig, null, 2));

      const config = await configManager.loadConfig();
      expect(config.mode).toBe('cloud');
      expect(config.vectorStore.backend).toBe('zilliz');
      // デフォルト値がマージされている
      expect(config.embedding).toBeDefined();
      expect(config.privacy).toBeDefined();
      expect(config.search).toBeDefined();
      expect(config.indexing).toBeDefined();
    });

    it('不正なJSON形式の場合、エラーをスローする', async () => {
      fs.writeFileSync(testConfigPath, '{ invalid json }');

      await expect(configManager.loadConfig()).rejects.toThrow(ConfigValidationError);
    });

    it('無効なモード値の場合、エラーをスローする', async () => {
      const invalidConfig = {
        mode: 'invalid-mode',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow(ConfigValidationError);
    });

    it('無効なベクターDBバックエンドの場合、エラーをスローする', async () => {
      const invalidConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'invalid-backend',
          config: {},
        },
        embedding: DEFAULT_CONFIG.embedding,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow(ConfigValidationError);
    });

    it('無効な埋め込みプロバイダーの場合、エラーをスローする', async () => {
      const invalidConfig = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: {
          provider: 'invalid-provider',
          model: 'test-model',
          local: true,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(invalidConfig));

      await expect(configManager.loadConfig()).rejects.toThrow(ConfigValidationError);
    });
  });

  describe('環境変数オーバーライド', () => {
    it('CONTEXT_MCP_MODE環境変数でモードをオーバーライドできる', async () => {
      const testConfig: ContextMcpConfig = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      process.env.CONTEXT_MCP_MODE = 'cloud';

      const config = await configManager.loadConfig();
      expect(config.mode).toBe('cloud');
    });

    it('CONTEXT_MCP_VECTOR_BACKEND環境変数でベクターDBをオーバーライドできる', async () => {
      const testConfig: ContextMcpConfig = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      process.env.CONTEXT_MCP_VECTOR_BACKEND = 'chroma';

      const config = await configManager.loadConfig();
      expect(config.vectorStore.backend).toBe('chroma');
    });

    it('CONTEXT_MCP_EMBEDDING_PROVIDER環境変数で埋め込みプロバイダーをオーバーライドできる', async () => {
      const testConfig: ContextMcpConfig = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      process.env.CONTEXT_MCP_EMBEDDING_PROVIDER = 'openai';

      const config = await configManager.loadConfig();
      expect(config.embedding.provider).toBe('openai');
    });

    it('複数の環境変数を同時にオーバーライドできる', async () => {
      const testConfig: ContextMcpConfig = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      process.env.CONTEXT_MCP_MODE = 'cloud';
      process.env.CONTEXT_MCP_VECTOR_BACKEND = 'zilliz';
      process.env.CONTEXT_MCP_EMBEDDING_PROVIDER = 'openai';

      const config = await configManager.loadConfig();
      expect(config.mode).toBe('cloud');
      expect(config.vectorStore.backend).toBe('zilliz';
      expect(config.embedding.provider).toBe('openai');
    });

    it('環境変数に無効な値が設定されている場合、エラーをスローする', async () => {
      const testConfig: ContextMcpConfig = DEFAULT_CONFIG;
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      process.env.CONTEXT_MCP_MODE = 'invalid-mode';

      await expect(configManager.loadConfig()).rejects.toThrow(ConfigValidationError);
    });
  });

  describe('設定のマージ', () => {
    it('ネストされた設定を正しくマージする', async () => {
      const partialConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: {
            address: 'custom-address:19530',
          },
        },
        search: {
          bm25Weight: 0.5,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig));

      const config = await configManager.loadConfig();

      // カスタム値が適用されている
      expect(config.vectorStore.config.address).toBe('custom-address:19530');
      expect(config.search?.bm25Weight).toBe(0.5);

      // デフォルト値が保持されている
      expect(config.vectorStore.config.standalone).toBe(true);
      expect(config.search?.vectorWeight).toBe(0.7);
      expect(config.privacy?.blockExternalCalls).toBe(true);
    });

    it('配列の設定は上書きされる（マージされない）', async () => {
      const partialConfig = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
        indexing: {
          languages: ['typescript', 'python'],
          excludePatterns: ['node_modules/**'],
          includeDocuments: true,
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(partialConfig));

      const config = await configManager.loadConfig();

      // 配列は完全に上書きされる
      expect(config.indexing?.languages).toEqual(['typescript', 'python']);
      expect(config.indexing?.excludePatterns).toEqual(['node_modules/**']);
    });
  });

  describe('validateConfig', () => {
    it('有効な設定をバリデーションする', () => {
      expect(() => configManager.validateConfig(DEFAULT_CONFIG)).not.toThrow();
    });

    it('必須フィールドが欠けている場合、エラーをスローする', () => {
      const invalidConfig = {
        mode: 'local',
        // vectorStoreが欠けている
        embedding: DEFAULT_CONFIG.embedding,
      } as any;

      expect(() => configManager.validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    });

    it('重みの合計が1.0でない場合、警告を出す（エラーにはしない）', async () => {
      const configWithInvalidWeights = {
        mode: 'local',
        vectorStore: DEFAULT_CONFIG.vectorStore,
        embedding: DEFAULT_CONFIG.embedding,
        search: {
          bm25Weight: 0.5,
          vectorWeight: 0.3, // 合計が0.8
        },
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(configWithInvalidWeights));

      // 警告は出るがエラーにはならない
      const config = await configManager.loadConfig();
      expect(config.search?.bm25Weight).toBe(0.5);
      expect(config.search?.vectorWeight).toBe(0.3);
    });
  });

  describe('getConfig', () => {
    it('loadConfig()を呼んだ後、getConfig()で設定を取得できる', async () => {
      await configManager.loadConfig();
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.mode).toBeDefined();
    });

    it('loadConfig()を呼ぶ前にgetConfig()を呼ぶとエラーをスローする', () => {
      expect(() => configManager.getConfig()).toThrow();
    });
  });
});
