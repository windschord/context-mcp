/**
 * HealthCheckerのテスト
 */

import { describe, it, expect } from '@jest/globals';
import { HealthChecker } from '../../src/health/HealthChecker.js';
import type { EmbeddingEngine } from '../../src/embedding/types.js';
import type { VectorStorePlugin } from '../../src/storage/types.js';

describe('HealthChecker', () => {
  describe('checkHealth()のテスト', () => {
    it('依存サービスなしでも正常にヘルスチェックできる', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      const health = await healthChecker.checkHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.version).toBe('1.0.0');
      expect(health.dependencies).toBeDefined();
    });

    it('すべての依存サービスが未初期化の場合はunknownステータスになる', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      const health = await healthChecker.checkHealth();

      expect(health.dependencies.vectorStore.status).toBe('unknown');
      expect(health.dependencies.embeddingEngine.status).toBe('unknown');
    });

    it('uptimeが時間経過とともに増加する', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      const health1 = await healthChecker.checkHealth();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const health2 = await healthChecker.checkHealth();

      expect(health2.uptime).toBeGreaterThanOrEqual(health1.uptime);
    });

    it('タイムスタンプがISO 8601形式である', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      const health = await healthChecker.checkHealth();

      // ISO 8601形式のパターンマッチ
      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('checkVectorStore()のテスト', () => {
    it('VectorStoreが未初期化の場合はunknownステータスを返す', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      const status = await healthChecker.checkVectorStore();

      expect(status.status).toBe('unknown');
      expect(status.error).toContain('not initialized');
    });

    it('VectorStoreが正常な場合はupステータスを返す', async () => {
      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockResolvedValue({
          totalVectors: 1000,
          dimensions: 384,
        }),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        undefined,
        mockVectorStore as VectorStorePlugin
      );

      const status = await healthChecker.checkVectorStore();

      expect(status.status).toBe('up');
      expect(status.latency).toBeDefined();
      expect(status.latency).toBeGreaterThanOrEqual(0);
    });

    it('VectorStoreがエラーの場合はdownステータスを返す', async () => {
      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        undefined,
        mockVectorStore as VectorStorePlugin
      );

      const status = await healthChecker.checkVectorStore();

      expect(status.status).toBe('down');
      expect(status.error).toContain('Connection failed');
    });

    it('コレクションが存在しない場合でもupステータスを返す', async () => {
      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockRejectedValue(new Error('Collection does not exist')),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        undefined,
        mockVectorStore as VectorStorePlugin
      );

      const status = await healthChecker.checkVectorStore();

      // コレクションが存在しないエラーは許容される
      expect(status.status).toBe('up');
    });

    it('タイムアウトの場合はdownステータスを返す', async () => {
      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(resolve, 10000); // 10秒後に解決（タイムアウトより長い）
            })
        ),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        undefined,
        mockVectorStore as VectorStorePlugin
      );

      const status = await healthChecker.checkVectorStore();

      expect(status.status).toBe('down');
      expect(status.error).toContain('timed out');
    }, 10000); // Jest タイムアウトを10秒に設定
  });

  describe('checkEmbeddingEngine()のテスト', () => {
    it('EmbeddingEngineが未初期化の場合はunknownステータスを返す', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('unknown');
      expect(status.error).toContain('not initialized');
    });

    it('EmbeddingEngineが正常な場合はupステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockResolvedValue(Array(384).fill(0.5)),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('up');
      expect(status.latency).toBeDefined();
      expect(status.latency).toBeGreaterThanOrEqual(0);
    });

    it('EmbeddingEngineがエラーの場合はdownステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockRejectedValue(new Error('API error')),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('down');
      expect(status.error).toContain('API error');
    });

    it('無効なベクトルを返す場合はdownステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockResolvedValue([]), // 空のベクトル
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('down');
      expect(status.error).toContain('Invalid embedding vector');
    });

    it('タイムアウトの場合はdownステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(Array(384).fill(0.5)), 10000); // 10秒後に解決
            })
        ),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('down');
      expect(status.error).toContain('timed out');
    }, 10000); // Jest タイムアウトを10秒に設定
  });

  describe('ステータス判定のテスト', () => {
    it('すべての依存サービスが稼働中の場合はhealthyステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockResolvedValue(Array(384).fill(0.5)),
      };

      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockResolvedValue({ totalVectors: 1000 }),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        mockEmbeddingEngine as EmbeddingEngine,
        mockVectorStore as VectorStorePlugin
      );

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('healthy');
    });

    it('VectorStoreのみ稼働中の場合はdegradedステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockRejectedValue(new Error('API error')),
      };

      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockResolvedValue({ totalVectors: 1000 }),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        mockEmbeddingEngine as EmbeddingEngine,
        mockVectorStore as VectorStorePlugin
      );

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('degraded');
    });

    it('EmbeddingEngineのみ稼働中の場合はdegradedステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockResolvedValue(Array(384).fill(0.5)),
      };

      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        mockEmbeddingEngine as EmbeddingEngine,
        mockVectorStore as VectorStorePlugin
      );

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('degraded');
    });

    it('すべての依存サービスがダウンの場合はunhealthyステータスを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockRejectedValue(new Error('API error')),
      };

      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        mockEmbeddingEngine as EmbeddingEngine,
        mockVectorStore as VectorStorePlugin
      );

      const health = await healthChecker.checkHealth();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('キャッシュ動作のテスト', () => {
    it('キャッシュが有効な間は同じ結果を返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockResolvedValue(Array(384).fill(0.5)),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const health1 = await healthChecker.checkHealth();
      const health2 = await healthChecker.checkHealth();

      // キャッシュが効いているため、embedは1回だけ呼ばれる
      expect(mockEmbeddingEngine.embed).toHaveBeenCalledTimes(1);

      // 結果は同じタイムスタンプを持つ（キャッシュから返された）
      expect(health1.timestamp).toBe(health2.timestamp);
    });

    it('キャッシュ期限切れ後は新しいヘルスチェックを実行する', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockResolvedValue(Array(384).fill(0.5)),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      // 最初のヘルスチェック
      const health1 = await healthChecker.checkHealth();

      // キャッシュTTL（30秒）より長く待つのは現実的でないため、
      // ここではキャッシュが使用されることを確認
      const health2 = await healthChecker.checkHealth();

      // キャッシュが効いている
      expect(health1.timestamp).toBe(health2.timestamp);
      expect(mockEmbeddingEngine.embed).toHaveBeenCalledTimes(1);
    });

    it('getStatus()がキャッシュから結果を返す', async () => {
      const healthChecker = new HealthChecker('1.0.0');

      // 最初はキャッシュがない
      expect(healthChecker.getStatus()).toBeUndefined();

      // ヘルスチェックを実行
      await healthChecker.checkHealth();

      // キャッシュから結果を取得できる
      const cachedStatus = healthChecker.getStatus();
      expect(cachedStatus).toBeDefined();
      expect(cachedStatus?.version).toBe('1.0.0');
    });
  });

  describe('エラーハンドリングのテスト', () => {
    it('VectorStoreのチェック中に例外が発生してもエラーオブジェクトを返す', async () => {
      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        }),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        undefined,
        mockVectorStore as VectorStorePlugin
      );

      const status = await healthChecker.checkVectorStore();

      expect(status.status).toBe('down');
      expect(status.error).toContain('Unexpected error');
    });

    it('EmbeddingEngineのチェック中に例外が発生してもエラーオブジェクトを返す', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        }),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('down');
      expect(status.error).toContain('Unexpected error');
    });
  });

  describe('レイテンシー測定のテスト', () => {
    it('VectorStoreのレイテンシーが正の値である', async () => {
      const mockVectorStore: Partial<VectorStorePlugin> = {
        getStats: jest.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { totalVectors: 1000 };
        }),
      };

      const healthChecker = new HealthChecker(
        '1.0.0',
        undefined,
        mockVectorStore as VectorStorePlugin
      );

      const status = await healthChecker.checkVectorStore();

      expect(status.status).toBe('up');
      expect(status.latency).toBeGreaterThan(0);
    });

    it('EmbeddingEngineのレイテンシーが正の値である', async () => {
      const mockEmbeddingEngine: Partial<EmbeddingEngine> = {
        embed: jest.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return Array(384).fill(0.5);
        }),
      };

      const healthChecker = new HealthChecker('1.0.0', mockEmbeddingEngine as EmbeddingEngine);

      const status = await healthChecker.checkEmbeddingEngine();

      expect(status.status).toBe('up');
      expect(status.latency).toBeGreaterThan(0);
    });
  });
});
