/**
 * Mock Vector Store for Testing
 */

import type {
  VectorStorePlugin,
  Vector,
  QueryResult,
  CollectionStats,
  VectorStoreConfig,
} from '../../src/storage/types';

export class MockVectorStore implements VectorStorePlugin {
  readonly name = 'mock';
  private collections: Map<string, Vector[]> = new Map();
  private connected = false;

  async connect(_config: VectorStoreConfig): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.collections.clear();
  }

  async createCollection(name: string, _dimension: number): Promise<void> {
    if (!this.collections.has(name)) {
      this.collections.set(name, []);
    }
  }

  async deleteCollection(name: string): Promise<void> {
    this.collections.delete(name);
  }

  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    const collection = this.collections.get(collectionName) || [];

    // 既存のベクトルを更新または追加
    for (const vector of vectors) {
      const index = collection.findIndex((v) => v.id === vector.id);
      if (index >= 0) {
        collection[index] = vector;
      } else {
        collection.push(vector);
      }
    }

    this.collections.set(collectionName, collection);
  }

  async query(
    collectionName: string,
    _vector: number[],
    topK: number,
    _filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    const collection = this.collections.get(collectionName) || [];

    // 簡易的な類似度計算（常に0.9を返す）
    return collection.slice(0, topK).map((v) => ({
      id: v.id,
      score: 0.9,
      metadata: v.metadata,
    }));
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    const collection = this.collections.get(collectionName) || [];
    const filtered = collection.filter((v) => !ids.includes(v.id));
    this.collections.set(collectionName, filtered);
  }

  async getStats(collectionName: string): Promise<CollectionStats> {
    const collection = this.collections.get(collectionName) || [];
    return {
      vectorCount: collection.length,
      dimension: collection.length > 0 ? collection[0].vector.length : 0,
      indexSize: collection.length * 1000, // 仮の値
    };
  }
}
