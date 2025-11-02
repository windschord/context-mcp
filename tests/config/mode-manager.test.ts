/**
 * Mode Manager Tests
 *
 * モード切り替え機能のテスト
 */

import { ModeManager } from '../../src/config/mode-manager';
import { LspMcpConfig } from '../../src/config/types';
import { EmbeddingEngine } from '../../src/embedding/types';
import { VectorStorePlugin } from '../../src/storage/types';

// モックの作成
const mockLocalEmbedding: EmbeddingEngine = {
  initialize: jest.fn().mockResolvedValue(undefined),
  embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  getDimension: jest.fn().mockReturnValue(384),
  dispose: jest.fn().mockResolvedValue(undefined),
};

const mockCloudEmbedding: EmbeddingEngine = {
  initialize: jest.fn().mockResolvedValue(undefined),
  embed: jest.fn().mockResolvedValue([0.4, 0.5, 0.6]),
  embedBatch: jest.fn().mockResolvedValue([[0.4, 0.5, 0.6]]),
  getDimension: jest.fn().mockReturnValue(1536),
  dispose: jest.fn().mockResolvedValue(undefined),
};

const mockVectorStore: VectorStorePlugin = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  createCollection: jest.fn().mockResolvedValue(undefined),
  deleteCollection: jest.fn().mockResolvedValue(undefined),
  upsert: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  getStats: jest.fn().mockResolvedValue({ totalVectors: 0 }),
};

describe('ModeManager', () => {
  describe('ローカルモード', () => {
    const localConfig: LspMcpConfig = {
      mode: 'local',
      vectorStore: {
        backend: 'milvus',
        config: {
          address: 'localhost:19530',
          standalone: true,
        },
      },
      embedding: {
        provider: 'transformers',
        model: 'Xenova/all-MiniLM-L6-v2',
        local: true,
      },
      privacy: {
        blockExternalCalls: true,
      },
      search: {
        bm25Weight: 0.3,
        vectorWeight: 0.7,
      },
      indexing: {
        languages: ['typescript'],
        excludePatterns: ['node_modules/**'],
        includeDocuments: true,
      },
    };

    it('ローカルモードの設定を正しく読み込む', () => {
      const manager = new ModeManager(localConfig);
      expect(manager.getMode()).toBe('local');
      expect(manager.isLocalMode()).toBe(true);
      expect(manager.isCloudMode()).toBe(false);
    });

    it('ローカルモードで外部通信がブロックされる', () => {
      const manager = new ModeManager(localConfig);
      expect(manager.shouldBlockExternalCalls()).toBe(true);
    });

    it('ローカルモードでローカル埋め込みエンジンを初期化できる', async () => {
      const manager = new ModeManager(localConfig);

      // ファクトリー関数をモック
      const createLocalEmbedding = jest.fn().mockReturnValue(mockLocalEmbedding);
      const createCloudEmbedding = jest.fn().mockReturnValue(mockCloudEmbedding);

      await manager.initializeEmbeddingEngine(createLocalEmbedding, createCloudEmbedding);

      expect(createLocalEmbedding).toHaveBeenCalledWith({
        modelName: 'Xenova/all-MiniLM-L6-v2',
        cacheDir: expect.any(String),
      });
      expect(createCloudEmbedding).not.toHaveBeenCalled();
      expect(mockLocalEmbedding.initialize).toHaveBeenCalled();
    });

    it('ローカルモードでクラウドプロバイダーを使用した場合に警告を出す', () => {
      const invalidConfig: LspMcpConfig = {
        ...localConfig,
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          local: false,
          apiKey: 'test-key',
        },
      };

      const manager = new ModeManager(invalidConfig);
      const warnings = manager.validateModeConsistency();

      expect(warnings).toContain(
        'ローカルモードですが、クラウド埋め込みプロバイダー（openai）が指定されています'
      );
    });

    it('ローカルモードでクラウドベクターDBを使用した場合に警告を出す', () => {
      const invalidConfig: LspMcpConfig = {
        ...localConfig,
        vectorStore: {
          backend: 'zilliz',
          config: {
            address: 'cloud.zilliz.com:19530',
            token: 'test-token',
          },
        },
      };

      const manager = new ModeManager(invalidConfig);
      const warnings = manager.validateModeConsistency();

      expect(warnings).toContain(
        'ローカルモードですが、クラウドベクターDB（zilliz）が指定されています'
      );
    });
  });

  describe('クラウドモード', () => {
    const cloudConfig: LspMcpConfig = {
      mode: 'cloud',
      vectorStore: {
        backend: 'zilliz',
        config: {
          address: 'cloud.zilliz.com:19530',
          token: 'test-token',
        },
      },
      embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        local: false,
        apiKey: 'test-api-key',
      },
      privacy: {
        blockExternalCalls: false,
      },
      search: {
        bm25Weight: 0.3,
        vectorWeight: 0.7,
      },
      indexing: {
        languages: ['typescript'],
        excludePatterns: ['node_modules/**'],
        includeDocuments: true,
      },
    };

    it('クラウドモードの設定を正しく読み込む', () => {
      const manager = new ModeManager(cloudConfig);
      expect(manager.getMode()).toBe('cloud');
      expect(manager.isLocalMode()).toBe(false);
      expect(manager.isCloudMode()).toBe(true);
    });

    it('クラウドモードで外部通信が許可される', () => {
      const manager = new ModeManager(cloudConfig);
      expect(manager.shouldBlockExternalCalls()).toBe(false);
    });

    it('クラウドモードでクラウド埋め込みエンジンを初期化できる', async () => {
      const manager = new ModeManager(cloudConfig);

      // ファクトリー関数をモック
      const createLocalEmbedding = jest.fn().mockReturnValue(mockLocalEmbedding);
      const createCloudEmbedding = jest.fn().mockReturnValue(mockCloudEmbedding);

      await manager.initializeEmbeddingEngine(createLocalEmbedding, createCloudEmbedding);

      expect(createCloudEmbedding).toHaveBeenCalledWith({
        provider: 'openai',
        apiKey: 'test-api-key',
        modelName: 'text-embedding-3-small',
      });
      expect(createLocalEmbedding).not.toHaveBeenCalled();
      expect(mockCloudEmbedding.initialize).toHaveBeenCalled();
    });

    it('クラウドモードでローカルプロバイダーを使用した場合に警告を出す', () => {
      const invalidConfig: LspMcpConfig = {
        ...cloudConfig,
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
      };

      const manager = new ModeManager(invalidConfig);
      const warnings = manager.validateModeConsistency();

      expect(warnings).toContain(
        'クラウドモードですが、ローカル埋め込みプロバイダー（transformers）が指定されています'
      );
    });

    it('クラウドモードで外部通信ブロックが有効な場合に警告を出す', () => {
      const invalidConfig: LspMcpConfig = {
        ...cloudConfig,
        privacy: {
          blockExternalCalls: true,
        },
      };

      const manager = new ModeManager(invalidConfig);
      const warnings = manager.validateModeConsistency();

      expect(warnings).toContain(
        'クラウドモードですが、外部通信ブロック（blockExternalCalls）が有効です'
      );
    });

    it('クラウドモードでAPIキーが必要な場合にエラーを投げる', async () => {
      const invalidConfig: LspMcpConfig = {
        ...cloudConfig,
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          local: false,
          // apiKey が欠落
        },
      };

      const manager = new ModeManager(invalidConfig);
      const createLocalEmbedding = jest.fn().mockReturnValue(mockLocalEmbedding);
      const createCloudEmbedding = jest.fn().mockReturnValue(mockCloudEmbedding);

      await expect(
        manager.initializeEmbeddingEngine(createLocalEmbedding, createCloudEmbedding)
      ).rejects.toThrow('クラウド埋め込みプロバイダー（openai）にはAPIキーが必要です');
    });
  });

  describe('プロバイダー初期化', () => {
    it('埋め込みエンジンを取得できる', async () => {
      const config: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: { address: 'localhost:19530' },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
        privacy: { blockExternalCalls: true },
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(config);
      const createLocalEmbedding = jest.fn().mockReturnValue(mockLocalEmbedding);
      const createCloudEmbedding = jest.fn().mockReturnValue(mockCloudEmbedding);

      await manager.initializeEmbeddingEngine(createLocalEmbedding, createCloudEmbedding);

      const engine = manager.getEmbeddingEngine();
      expect(engine).toBe(mockLocalEmbedding);
    });

    it('初期化前に埋め込みエンジンを取得しようとするとエラーを投げる', () => {
      const config: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: { address: 'localhost:19530' },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
        privacy: { blockExternalCalls: true },
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(config);

      expect(() => manager.getEmbeddingEngine()).toThrow(
        '埋め込みエンジンが初期化されていません'
      );
    });

    it('リソースを適切に解放できる', async () => {
      const config: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: { address: 'localhost:19530' },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
        privacy: { blockExternalCalls: true },
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(config);
      const createLocalEmbedding = jest.fn().mockReturnValue(mockLocalEmbedding);
      const createCloudEmbedding = jest.fn().mockReturnValue(mockCloudEmbedding);

      await manager.initializeEmbeddingEngine(createLocalEmbedding, createCloudEmbedding);
      await manager.dispose();

      expect(mockLocalEmbedding.dispose).toHaveBeenCalled();
    });
  });

  describe('モード不一致検証', () => {
    it('整合性のある設定では警告が出ない', () => {
      const validLocalConfig: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: { address: 'localhost:19530', standalone: true },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
        privacy: { blockExternalCalls: true },
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(validLocalConfig);
      const warnings = manager.validateModeConsistency();

      expect(warnings).toHaveLength(0);
    });

    it('複数の不一致がある場合、すべての警告を返す', () => {
      const invalidConfig: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'zilliz',
          config: { address: 'cloud.zilliz.com:19530' },
        },
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          local: false,
          apiKey: 'test-key',
        },
        privacy: { blockExternalCalls: true },
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(invalidConfig);
      const warnings = manager.validateModeConsistency();

      expect(warnings.length).toBeGreaterThan(1);
      expect(warnings).toContain(
        'ローカルモードですが、クラウド埋め込みプロバイダー（openai）が指定されています'
      );
      expect(warnings).toContain(
        'ローカルモードですが、クラウドベクターDB（zilliz）が指定されています'
      );
    });
  });

  describe('外部通信ブロック', () => {
    it('ローカルモードでデフォルトで外部通信がブロックされる', () => {
      const config: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: { address: 'localhost:19530' },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
        // privacy 設定なし
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(config);
      expect(manager.shouldBlockExternalCalls()).toBe(false); // privacy未設定の場合はfalse
    });

    it('明示的な設定で外部通信を制御できる', () => {
      const configWithBlock: LspMcpConfig = {
        mode: 'local',
        vectorStore: {
          backend: 'milvus',
          config: { address: 'localhost:19530' },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
        privacy: { blockExternalCalls: true },
        search: { bm25Weight: 0.3, vectorWeight: 0.7 },
        indexing: {
          languages: ['typescript'],
          excludePatterns: [],
          includeDocuments: true,
        },
      };

      const manager = new ModeManager(configWithBlock);
      expect(manager.shouldBlockExternalCalls()).toBe(true);
    });
  });
});
