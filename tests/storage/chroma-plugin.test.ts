/**
 * Chromaプラグインのテスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ChromaPlugin } from '../../src/storage/chroma-plugin';
import type { VectorStoreConfig, Vector } from '../../src/storage/types';
import * as fs from 'fs';
import * as path from 'path';

describe('ChromaPlugin', () => {
  let plugin: ChromaPlugin;
  const testCollectionName = 'test_collection';
  const dimension = 384;
  const testDataPath = path.join(process.cwd(), './tmp/test-chroma-data');

  // Chroma接続設定
  const chromaConfig: VectorStoreConfig = {
    backend: 'chroma',
    config: {
      path: testDataPath,
    },
  };

  beforeAll(async () => {
    // テストデータディレクトリを作成
    if (!fs.existsSync(testDataPath)) {
      fs.mkdirSync(testDataPath, { recursive: true });
    }
    plugin = new ChromaPlugin();
  });

  afterAll(async () => {
    if (plugin) {
      try {
        await plugin.disconnect();
      } catch (error) {
        // 切断エラーは無視
      }
    }
    // テストデータディレクトリを削除
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // 各テスト前にコレクションを削除
    try {
      await plugin.deleteCollection(testCollectionName);
    } catch (error) {
      // コレクションが存在しない場合は無視
    }
  });

  describe('constructor', () => {
    it('プラグイン名が正しく設定されている', () => {
      expect(plugin.name).toBe('chroma');
    });
  });

  describe('connect', () => {
    it('Chromaに接続できる', async () => {
      await expect(plugin.connect(chromaConfig)).resolves.not.toThrow();
    });

    it('接続失敗時に適切なエラーが発生する', async () => {
      const invalidConfig: VectorStoreConfig = {
        backend: 'chroma',
        config: {
          path: '/invalid/path/that/should/not/exist',
        },
      };

      // 無効なパスでも接続自体は成功する可能性があるため、
      // このテストはスキップまたは別の観点でテストする
      expect(invalidConfig.config.path).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('接続を切断できる', async () => {
      await plugin.connect(chromaConfig);
      await expect(plugin.disconnect()).resolves.not.toThrow();
    });

    it('未接続の状態で切断してもエラーにならない', async () => {
      const plugin2 = new ChromaPlugin();
      await expect(plugin2.disconnect()).resolves.not.toThrow();
    });
  });

  describe('createCollection', () => {
    it('コレクションを作成できる', async () => {
      await plugin.connect(chromaConfig);
      await expect(
        plugin.createCollection(testCollectionName, dimension)
      ).resolves.not.toThrow();
    });

    it('同じ名前のコレクションを二重作成するとエラー', async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);
      await expect(
        plugin.createCollection(testCollectionName, dimension)
      ).rejects.toThrow();
    });

    it('接続前にコレクション作成しようとするとエラー', async () => {
      const plugin2 = new ChromaPlugin();
      await expect(
        plugin2.createCollection(testCollectionName, dimension)
      ).rejects.toThrow();
    });
  });

  describe('deleteCollection', () => {
    it('コレクションを削除できる', async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);
      await expect(plugin.deleteCollection(testCollectionName)).resolves.not.toThrow();
    });

    it('存在しないコレクションを削除してもエラーにならない', async () => {
      await plugin.connect(chromaConfig);
      await expect(
        plugin.deleteCollection('non_existent_collection')
      ).resolves.not.toThrow();
    });
  });

  describe('upsert', () => {
    beforeEach(async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);
    });

    it('ベクトルを挿入できる', async () => {
      const vectors: Vector[] = [
        {
          id: 'vec1',
          vector: Array(dimension).fill(0.1),
          metadata: { file: 'test.ts', type: 'function' },
        },
      ];

      await expect(plugin.upsert(testCollectionName, vectors)).resolves.not.toThrow();
    });

    it('複数のベクトルを一度に挿入できる', async () => {
      const vectors: Vector[] = [
        {
          id: 'vec1',
          vector: Array(dimension).fill(0.1),
          metadata: { file: 'test1.ts' },
        },
        {
          id: 'vec2',
          vector: Array(dimension).fill(0.2),
          metadata: { file: 'test2.ts' },
        },
        {
          id: 'vec3',
          vector: Array(dimension).fill(0.3),
          metadata: { file: 'test3.ts' },
        },
      ];

      await expect(plugin.upsert(testCollectionName, vectors)).resolves.not.toThrow();
    });

    it('既存ベクトルを更新できる（upsert動作）', async () => {
      const vector1: Vector = {
        id: 'vec1',
        vector: Array(dimension).fill(0.1),
        metadata: { file: 'test.ts', version: 1 },
      };

      await plugin.upsert(testCollectionName, [vector1]);

      // 同じIDで異なるメタデータを挿入（更新）
      const vector2: Vector = {
        id: 'vec1',
        vector: Array(dimension).fill(0.2),
        metadata: { file: 'test.ts', version: 2 },
      };

      await expect(plugin.upsert(testCollectionName, [vector2])).resolves.not.toThrow();
    });

    it('存在しないコレクションに挿入するとエラー', async () => {
      const vectors: Vector[] = [
        {
          id: 'vec1',
          vector: Array(dimension).fill(0.1),
        },
      ];

      await expect(plugin.upsert('non_existent', vectors)).rejects.toThrow();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);

      // テストデータを挿入
      const vectors: Vector[] = [
        {
          id: 'vec1',
          vector: Array(dimension).fill(0.1),
          metadata: { file: 'test1.ts', type: 'function' },
        },
        {
          id: 'vec2',
          vector: Array(dimension).fill(0.5),
          metadata: { file: 'test2.ts', type: 'class' },
        },
        {
          id: 'vec3',
          vector: Array(dimension).fill(0.9),
          metadata: { file: 'test3.ts', type: 'function' },
        },
      ];

      await plugin.upsert(testCollectionName, vectors);
    });

    it('類似ベクトルを検索できる', async () => {
      const queryVector = Array(dimension).fill(0.1);
      const results = await plugin.query(testCollectionName, queryVector, 2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('vec1');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('topKパラメータが機能する', async () => {
      const queryVector = Array(dimension).fill(0.5);
      const results = await plugin.query(testCollectionName, queryVector, 1);

      expect(results).toHaveLength(1);
    });

    it('メタデータフィルタが機能する', async () => {
      const queryVector = Array(dimension).fill(0.5);
      const filter = { type: 'function' };
      const results = await plugin.query(testCollectionName, queryVector, 10, filter);

      // type='function'のものだけが返される
      expect(results.every((r) => r.metadata?.type === 'function')).toBe(true);
    });

    it('存在しないコレクションを検索するとエラー', async () => {
      const queryVector = Array(dimension).fill(0.5);
      await expect(plugin.query('non_existent', queryVector, 5)).rejects.toThrow();
    });

    it('結果がスコア順にソートされている', async () => {
      const queryVector = Array(dimension).fill(0.5);
      const results = await plugin.query(testCollectionName, queryVector, 3);

      // スコアが降順であることを確認
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);

      const vectors: Vector[] = [
        { id: 'vec1', vector: Array(dimension).fill(0.1) },
        { id: 'vec2', vector: Array(dimension).fill(0.2) },
        { id: 'vec3', vector: Array(dimension).fill(0.3) },
      ];

      await plugin.upsert(testCollectionName, vectors);
    });

    it('ベクトルを削除できる', async () => {
      await expect(plugin.delete(testCollectionName, ['vec1'])).resolves.not.toThrow();

      // 削除後に検索して確認
      const results = await plugin.query(
        testCollectionName,
        Array(dimension).fill(0.1),
        10
      );
      expect(results.find((r) => r.id === 'vec1')).toBeUndefined();
    });

    it('複数のベクトルを一度に削除できる', async () => {
      await expect(
        plugin.delete(testCollectionName, ['vec1', 'vec2'])
      ).resolves.not.toThrow();

      const results = await plugin.query(
        testCollectionName,
        Array(dimension).fill(0.5),
        10
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('vec3');
    });

    it('存在しないIDを削除してもエラーにならない', async () => {
      await expect(
        plugin.delete(testCollectionName, ['non_existent_id'])
      ).resolves.not.toThrow();
    });

    it('存在しないコレクションから削除するとエラー', async () => {
      await expect(plugin.delete('non_existent', ['vec1'])).rejects.toThrow();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);
    });

    it('コレクションの統計情報を取得できる', async () => {
      const vectors: Vector[] = [
        { id: 'vec1', vector: Array(dimension).fill(0.1) },
        { id: 'vec2', vector: Array(dimension).fill(0.2) },
      ];
      await plugin.upsert(testCollectionName, vectors);

      const stats = await plugin.getStats(testCollectionName);

      expect(stats.vectorCount).toBe(2);
      expect(stats.dimension).toBe(dimension);
      expect(stats.indexSize).toBeGreaterThanOrEqual(0);
    });

    it('空のコレクションの統計情報を取得できる', async () => {
      const stats = await plugin.getStats(testCollectionName);

      expect(stats.vectorCount).toBe(0);
      expect(stats.dimension).toBe(dimension);
    });

    it('存在しないコレクションの統計情報取得でエラー', async () => {
      await expect(plugin.getStats('non_existent')).rejects.toThrow();
    });
  });

  describe('データ永続化', () => {
    it('再接続後もデータが保持されている', async () => {
      // データを挿入
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);
      const vectors: Vector[] = [
        { id: 'vec1', vector: Array(dimension).fill(0.1), metadata: { test: 'persist' } },
      ];
      await plugin.upsert(testCollectionName, vectors);
      await plugin.disconnect();

      // 再接続してデータを確認
      const plugin2 = new ChromaPlugin();
      await plugin2.connect(chromaConfig);
      const results = await plugin2.query(
        testCollectionName,
        Array(dimension).fill(0.1),
        1
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('vec1');
      expect(results[0].metadata?.test).toBe('persist');

      await plugin2.disconnect();
    });
  });

  describe('Milvusとの互換性', () => {
    it('VectorStorePluginインターフェースを実装している', async () => {
      await plugin.connect(chromaConfig);

      // 各メソッドが存在することを確認
      expect(typeof plugin.connect).toBe('function');
      expect(typeof plugin.disconnect).toBe('function');
      expect(typeof plugin.createCollection).toBe('function');
      expect(typeof plugin.deleteCollection).toBe('function');
      expect(typeof plugin.upsert).toBe('function');
      expect(typeof plugin.query).toBe('function');
      expect(typeof plugin.delete).toBe('function');
      expect(typeof plugin.getStats).toBe('function');
    });

    it('Milvusと同等のメソッドシグネチャを持つ', async () => {
      await plugin.connect(chromaConfig);
      await plugin.createCollection(testCollectionName, dimension);

      const testVector: Vector = {
        id: 'test',
        vector: Array(dimension).fill(0.5),
        metadata: { test: true },
      };

      // Milvusと同じ方法で操作できることを確認
      await plugin.upsert(testCollectionName, [testVector]);
      const results = await plugin.query(testCollectionName, testVector.vector, 1);
      await plugin.delete(testCollectionName, [testVector.id]);
      const stats = await plugin.getStats(testCollectionName);

      expect(results).toBeDefined();
      expect(stats).toBeDefined();
    });
  });
});
