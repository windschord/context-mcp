/**
 * Storage Layer - Vector Store Plugin System
 *
 * ベクターDB統合のためのプラグインシステムを提供
 */

export type {
  Vector,
  QueryResult,
  CollectionStats,
  VectorStoreConfig,
  VectorStorePlugin,
} from './types';

export { VectorStorePluginRegistry } from './types';
export { MilvusPlugin } from './milvus-plugin';
export { ChromaPlugin } from './chroma-plugin';
export { DockerManager } from './docker-manager';
export type { DockerManagerConfig } from './docker-manager';
