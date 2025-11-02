import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  VectorStorePluginRegistry,
  VectorStorePlugin,
  VectorStoreConfig,
  Vector,
  QueryResult,
  CollectionStats,
} from '../../src/storage/types';

/**
 * テスト用のダミープラグイン
 */
class DummyPluginA implements VectorStorePlugin {
  name = 'dummy-a';

  async connect(config: VectorStoreConfig): Promise<void> {}
  async disconnect(): Promise<void> {}
  async createCollection(name: string, dimension: number): Promise<void> {}
  async deleteCollection(name: string): Promise<void> {}
  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {}
  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    return [];
  }
  async delete(collectionName: string, ids: string[]): Promise<void> {}
  async getStats(collectionName: string): Promise<CollectionStats> {
    return { vectorCount: 0, dimension: 0, indexSize: 0 };
  }
}

class DummyPluginB implements VectorStorePlugin {
  name = 'dummy-b';

  async connect(config: VectorStoreConfig): Promise<void> {}
  async disconnect(): Promise<void> {}
  async createCollection(name: string, dimension: number): Promise<void> {}
  async deleteCollection(name: string): Promise<void> {}
  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {}
  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    return [];
  }
  async delete(collectionName: string, ids: string[]): Promise<void> {}
  async getStats(collectionName: string): Promise<CollectionStats> {
    return { vectorCount: 0, dimension: 0, indexSize: 0 };
  }
}

describe('VectorStorePluginRegistry', () => {
  let registry: VectorStorePluginRegistry;

  beforeEach(() => {
    registry = new VectorStorePluginRegistry();
  });

  describe('Plugin Registration', () => {
    it('should register a plugin', () => {
      const plugin = new DummyPluginA();
      expect(() => registry.register(plugin)).not.toThrow();
    });

    it('should register multiple plugins', () => {
      const pluginA = new DummyPluginA();
      const pluginB = new DummyPluginB();

      expect(() => {
        registry.register(pluginA);
        registry.register(pluginB);
      }).not.toThrow();
    });

    it('should throw error when registering duplicate plugin name', () => {
      const plugin1 = new DummyPluginA();
      const plugin2 = new DummyPluginA();

      registry.register(plugin1);
      expect(() => registry.register(plugin2)).toThrow(
        'Plugin dummy-a is already registered'
      );
    });
  });

  describe('Plugin Retrieval', () => {
    beforeEach(() => {
      registry.register(new DummyPluginA());
      registry.register(new DummyPluginB());
    });

    it('should get a registered plugin', () => {
      const plugin = registry.get('dummy-a');
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('dummy-a');
    });

    it('should throw error when getting non-existent plugin', () => {
      expect(() => registry.get('non-existent')).toThrow(
        'Plugin non-existent not found'
      );
    });

    it('should list all registered plugins', () => {
      const plugins = registry.list();
      expect(plugins).toHaveLength(2);
      expect(plugins).toContain('dummy-a');
      expect(plugins).toContain('dummy-b');
    });

    it('should return empty list when no plugins registered', () => {
      const emptyRegistry = new VectorStorePluginRegistry();
      expect(emptyRegistry.list()).toHaveLength(0);
    });
  });

  describe('Plugin Unregistration', () => {
    beforeEach(() => {
      registry.register(new DummyPluginA());
      registry.register(new DummyPluginB());
    });

    it('should unregister a plugin', () => {
      registry.unregister('dummy-a');
      expect(registry.list()).toHaveLength(1);
      expect(registry.list()).not.toContain('dummy-a');
    });

    it('should not throw when unregistering non-existent plugin', () => {
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });
  });

  describe('Plugin Check', () => {
    beforeEach(() => {
      registry.register(new DummyPluginA());
    });

    it('should return true for registered plugin', () => {
      expect(registry.has('dummy-a')).toBe(true);
    });

    it('should return false for non-registered plugin', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });
});
