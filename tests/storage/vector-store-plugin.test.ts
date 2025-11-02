import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  VectorStorePlugin,
  Vector,
  QueryResult,
  VectorStoreConfig,
  CollectionStats,
} from '../../src/storage/types';

/**
 * モックVectorStorePluginの実装
 * テストのために最小限のインターフェース実装を提供
 */
class MockVectorStorePlugin implements VectorStorePlugin {
  name = 'mock';
  private connected = false;
  private collections: Map<string, Array<Vector>> = new Map();

  async connect(config: VectorStoreConfig): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.collections.clear();
  }

  async createCollection(name: string, dimension: number): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (this.collections.has(name)) {
      throw new Error(`Collection ${name} already exists`);
    }
    this.collections.set(name, []);
  }

  async deleteCollection(name: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    this.collections.delete(name);
  }

  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    for (const vector of vectors) {
      const existingIndex = collection.findIndex((v) => v.id === vector.id);
      if (existingIndex >= 0) {
        collection[existingIndex] = vector;
      } else {
        collection.push(vector);
      }
    }
  }

  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    // 簡易的なコサイン類似度計算
    const results: QueryResult[] = collection
      .filter((v) => {
        if (!filter) return true;
        return Object.entries(filter).every(([key, value]) => {
          return v.metadata?.[key] === value;
        });
      })
      .map((v) => ({
        id: v.id,
        score: this.cosineSimilarity(vector, v.vector),
        metadata: v.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    const idsSet = new Set(ids);
    this.collections.set(
      collectionName,
      collection.filter((v) => !idsSet.has(v.id))
    );
  }

  async getStats(collectionName: string): Promise<CollectionStats> {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    return {
      vectorCount: collection.length,
      dimension: collection[0]?.vector.length || 0,
      indexSize: collection.length * (collection[0]?.vector.length || 0) * 4, // 簡易計算
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

describe('VectorStorePlugin Interface', () => {
  let plugin: VectorStorePlugin;
  const config: VectorStoreConfig = {
    backend: 'mock',
    config: {},
  };

  beforeEach(() => {
    plugin = new MockVectorStorePlugin();
  });

  describe('Connection Management', () => {
    it('should connect to vector store', async () => {
      await expect(plugin.connect(config)).resolves.not.toThrow();
    });

    it('should disconnect from vector store', async () => {
      await plugin.connect(config);
      await expect(plugin.disconnect()).resolves.not.toThrow();
    });

    it('should throw error when operating without connection', async () => {
      await expect(
        plugin.createCollection('test', 384)
      ).rejects.toThrow('Not connected');
    });
  });

  describe('Collection Management', () => {
    beforeEach(async () => {
      await plugin.connect(config);
    });

    it('should create a new collection', async () => {
      await expect(
        plugin.createCollection('test_collection', 384)
      ).resolves.not.toThrow();
    });

    it('should throw error when creating duplicate collection', async () => {
      await plugin.createCollection('test_collection', 384);
      await expect(
        plugin.createCollection('test_collection', 384)
      ).rejects.toThrow('already exists');
    });

    it('should delete a collection', async () => {
      await plugin.createCollection('test_collection', 384);
      await expect(
        plugin.deleteCollection('test_collection')
      ).resolves.not.toThrow();
    });
  });

  describe('Vector Operations', () => {
    beforeEach(async () => {
      await plugin.connect(config);
      await plugin.createCollection('test_collection', 3);
    });

    it('should upsert vectors', async () => {
      const vectors: Vector[] = [
        {
          id: 'vec1',
          vector: [0.1, 0.2, 0.3],
          metadata: { type: 'function', name: 'test' },
        },
        {
          id: 'vec2',
          vector: [0.4, 0.5, 0.6],
          metadata: { type: 'class', name: 'TestClass' },
        },
      ];

      await expect(
        plugin.upsert('test_collection', vectors)
      ).resolves.not.toThrow();
    });

    it('should update existing vectors on upsert', async () => {
      const vector1: Vector = {
        id: 'vec1',
        vector: [0.1, 0.2, 0.3],
        metadata: { version: 1 },
      };
      const vector2: Vector = {
        id: 'vec1',
        vector: [0.4, 0.5, 0.6],
        metadata: { version: 2 },
      };

      await plugin.upsert('test_collection', [vector1]);
      await plugin.upsert('test_collection', [vector2]);

      const results = await plugin.query('test_collection', [0.4, 0.5, 0.6], 1);
      expect(results[0].metadata?.version).toBe(2);
    });

    it('should query similar vectors', async () => {
      const vectors: Vector[] = [
        { id: 'vec1', vector: [1.0, 0.0, 0.0] },
        { id: 'vec2', vector: [0.0, 1.0, 0.0] },
        { id: 'vec3', vector: [0.9, 0.1, 0.0] },
      ];

      await plugin.upsert('test_collection', vectors);

      const results = await plugin.query('test_collection', [1.0, 0.0, 0.0], 2);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('vec1');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should query with filters', async () => {
      const vectors: Vector[] = [
        {
          id: 'vec1',
          vector: [1.0, 0.0, 0.0],
          metadata: { type: 'function', language: 'python' },
        },
        {
          id: 'vec2',
          vector: [0.9, 0.1, 0.0],
          metadata: { type: 'function', language: 'typescript' },
        },
        {
          id: 'vec3',
          vector: [0.8, 0.2, 0.0],
          metadata: { type: 'class', language: 'python' },
        },
      ];

      await plugin.upsert('test_collection', vectors);

      const results = await plugin.query(
        'test_collection',
        [1.0, 0.0, 0.0],
        10,
        { language: 'python' }
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata?.language === 'python')).toBe(true);
    });

    it('should delete vectors by ids', async () => {
      const vectors: Vector[] = [
        { id: 'vec1', vector: [1.0, 0.0, 0.0] },
        { id: 'vec2', vector: [0.0, 1.0, 0.0] },
        { id: 'vec3', vector: [0.0, 0.0, 1.0] },
      ];

      await plugin.upsert('test_collection', vectors);
      await plugin.delete('test_collection', ['vec1', 'vec3']);

      const results = await plugin.query('test_collection', [1.0, 0.0, 0.0], 10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('vec2');
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await plugin.connect(config);
      await plugin.createCollection('test_collection', 3);
    });

    it('should return collection statistics', async () => {
      const vectors: Vector[] = [
        { id: 'vec1', vector: [1.0, 0.0, 0.0] },
        { id: 'vec2', vector: [0.0, 1.0, 0.0] },
      ];

      await plugin.upsert('test_collection', vectors);

      const stats = await plugin.getStats('test_collection');
      expect(stats.vectorCount).toBe(2);
      expect(stats.dimension).toBe(3);
      expect(stats.indexSize).toBeGreaterThan(0);
    });

    it('should return zero stats for empty collection', async () => {
      const stats = await plugin.getStats('test_collection');
      expect(stats.vectorCount).toBe(0);
      expect(stats.dimension).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.connect(config);
    });

    it('should throw error for non-existent collection on upsert', async () => {
      await expect(
        plugin.upsert('non_existent', [{ id: 'vec1', vector: [1, 2, 3] }])
      ).rejects.toThrow('not found');
    });

    it('should throw error for non-existent collection on query', async () => {
      await expect(
        plugin.query('non_existent', [1, 2, 3], 10)
      ).rejects.toThrow('not found');
    });

    it('should throw error for non-existent collection on delete', async () => {
      await expect(
        plugin.delete('non_existent', ['vec1'])
      ).rejects.toThrow('not found');
    });

    it('should throw error for non-existent collection on getStats', async () => {
      await expect(
        plugin.getStats('non_existent')
      ).rejects.toThrow('not found');
    });
  });
});
