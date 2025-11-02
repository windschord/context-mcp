/**
 * Chroma Plugin - ChromaDB プラグイン実装
 *
 * Docker不要のローカル埋め込みベクターDBとしてChromaに対応
 * Milvusの軽量代替オプションとして機能します
 */

import { ChromaClient, Collection } from 'chromadb';
import type {
  VectorStorePlugin,
  VectorStoreConfig,
  Vector,
  QueryResult,
  CollectionStats,
} from './types';
import { Logger } from '../utils/logger';

/**
 * Chromaプラグイン設定
 */
interface ChromaPluginConfig {
  path: string;
}

/**
 * コレクション情報を保持するマップ
 */
interface CollectionInfo {
  collection: Collection;
  dimension: number;
}

/**
 * Chromaプラグインクラス
 *
 * VectorStorePluginインターフェースを実装し、
 * ChromaDBとの連携を提供します。
 */
export class ChromaPlugin implements VectorStorePlugin {
  readonly name = 'chroma';

  private client: ChromaClient | null = null;
  private collections: Map<string, CollectionInfo> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * ChromaDBに接続
   */
  async connect(config: VectorStoreConfig): Promise<void> {
    this.logger.info('Connecting to ChromaDB...');

    const chromaConfig = config.config as unknown as ChromaPluginConfig;

    // ChromaClientを初期化（ローカルストレージパスを指定）
    this.client = new ChromaClient({
      path: chromaConfig.path,
    });

    this.logger.info(`Connected to ChromaDB at: ${chromaConfig.path}`);
  }

  /**
   * ChromaDBから切断
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.info('Disconnecting from ChromaDB...');
      this.client = null;
      this.collections.clear();
      this.logger.info('Disconnected from ChromaDB');
    }
  }

  /**
   * クライアントが初期化されているか確認
   */
  private ensureClient(): ChromaClient {
    if (!this.client) {
      throw new Error('ChromaDB client is not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * コレクションを作成
   */
  async createCollection(name: string, dimension: number): Promise<void> {
    const client = this.ensureClient();
    this.logger.info(`Creating collection: ${name} (dimension: ${dimension})`);

    try {
      // 既存のコレクションを取得しようとする
      await client.getCollection({ name });
      throw new Error(`Collection ${name} already exists`);
    } catch (error) {
      // コレクションが存在しない場合のみ新規作成
      if ((error as Error).message.includes('already exists')) {
        throw error;
      }
    }

    // コレクションを作成
    const collection = await client.createCollection({
      name,
      metadata: { dimension: dimension.toString() },
    });

    // コレクション情報を保存
    this.collections.set(name, { collection, dimension });

    this.logger.info(`Collection ${name} created successfully`);
  }

  /**
   * コレクションを削除
   */
  async deleteCollection(name: string): Promise<void> {
    const client = this.ensureClient();
    this.logger.info(`Deleting collection: ${name}`);

    try {
      await client.deleteCollection({ name });
      this.collections.delete(name);
      this.logger.info(`Collection ${name} deleted successfully`);
    } catch (error) {
      // コレクションが存在しない場合はエラーを無視
      this.logger.debug(`Collection ${name} does not exist, skipping deletion`);
    }
  }

  /**
   * コレクションを取得または作成
   */
  private async getOrFetchCollection(name: string): Promise<CollectionInfo> {
    // キャッシュにある場合はそれを返す
    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }

    // ChromaDBから取得
    const client = this.ensureClient();
    try {
      const collection = await client.getCollection({ name });
      const metadata = collection.metadata;
      const dimension = parseInt((metadata?.['dimension'] as string) || '384', 10);

      const info: CollectionInfo = { collection, dimension };
      this.collections.set(name, info);
      return info;
    } catch (error) {
      throw new Error(`Collection ${name} does not exist`);
    }
  }

  /**
   * ベクトルを挿入または更新
   */
  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    this.logger.debug(`Upserting ${vectors.length} vectors to collection: ${collectionName}`);

    const { collection } = await this.getOrFetchCollection(collectionName);

    // データを整形
    const ids = vectors.map((v) => v.id);
    const embeddings = vectors.map((v) => v.vector);
    const metadatas = vectors.map((v) => {
      const meta = v.metadata || {};
      // ChromaのMetadata型に合わせて変換（string | number | boolean のみ許可）
      const chromaMeta: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(meta)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          chromaMeta[key] = value;
        } else if (value !== null && value !== undefined) {
          chromaMeta[key] = String(value);
        }
      }
      return chromaMeta;
    });

    // Chromaのupsertを使用（既存データは自動的に更新される）
    await collection.upsert({
      ids,
      embeddings,
      metadatas,
    });

    this.logger.debug(`Upserted ${vectors.length} vectors successfully`);
  }

  /**
   * 類似ベクトルを検索
   */
  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    this.logger.debug(
      `Querying collection: ${collectionName} (topK: ${topK}, filter: ${JSON.stringify(filter)})`
    );

    const { collection } = await this.getOrFetchCollection(collectionName);

    // 検索実行
    const results = await collection.query({
      queryEmbeddings: [vector],
      nResults: topK,
      where: filter as any, // Chromaのフィルタ形式
    });

    // 結果を変換
    if (!results.ids || results.ids.length === 0 || !results.ids[0]) {
      return [];
    }

    const queryResults: QueryResult[] = [];
    const ids = results.ids[0];
    const distances = results.distances?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];

    for (let i = 0; i < ids.length; i++) {
      // Chromaはコサイン類似度を返すため、距離を類似度スコアに変換
      // 距離が小さいほど類似度が高い（0が最も類似）
      const distance = distances[i] || 0;
      const score = 1 / (1 + distance); // 0-1の範囲に正規化

      queryResults.push({
        id: ids[i] ?? '',
        score,
        metadata: (metadatas[i] || {}) as Record<string, unknown>,
      });
    }

    // スコアの降順でソート
    queryResults.sort((a, b) => b.score - a.score);

    return queryResults;
  }

  /**
   * ベクトルを削除
   */
  async delete(collectionName: string, ids: string[]): Promise<void> {
    this.logger.debug(`Deleting ${ids.length} vectors from collection: ${collectionName}`);

    const { collection } = await this.getOrFetchCollection(collectionName);

    if (ids.length === 0) {
      return;
    }

    // 削除実行
    try {
      await collection.delete({
        ids,
      });
      this.logger.debug(`Deleted ${ids.length} vectors successfully`);
    } catch (error) {
      // 存在しないIDの削除エラーは無視
      this.logger.debug(`Delete operation completed (some IDs may not exist): ${error}`);
    }
  }

  /**
   * コレクションの統計情報を取得
   */
  async getStats(collectionName: string): Promise<CollectionStats> {
    this.logger.debug(`Getting stats for collection: ${collectionName}`);

    const { collection, dimension } = await this.getOrFetchCollection(collectionName);

    // コレクションのアイテム数を取得
    const count = await collection.count();

    // インデックスサイズを概算（エンティティ数 * 次元数 * 4バイト）
    const indexSize = count * dimension * 4;

    return {
      vectorCount: count,
      dimension,
      indexSize,
    };
  }
}
