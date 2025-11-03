/**
 * Milvus Plugin - Milvus VectorDB プラグイン実装
 *
 * Milvus standalone（ローカルDocker）とZilliz Cloud（クラウド）の両方に対応
 */

import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import type {
  VectorStorePlugin,
  VectorStoreConfig,
  Vector,
  QueryResult,
  CollectionStats,
} from './types';
import { Logger } from '../utils/logger';

/**
 * リトライ設定
 */
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * デフォルトリトライ設定
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1秒
  maxDelay: 10000, // 10秒
  backoffMultiplier: 2,
};

/**
 * Milvusプラグイン設定
 */
interface MilvusPluginConfig {
  address: string;
  token?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  standalone?: boolean;
}

/**
 * Milvusプラグインクラス
 *
 * VectorStorePluginインターフェースを実装し、
 * Milvus standaloneとZilliz Cloudに対応します。
 */
export class MilvusPlugin implements VectorStorePlugin {
  readonly name = 'milvus';

  private client: MilvusClient | null = null;
  private config: MilvusPluginConfig | null = null;
  private logger: Logger;
  private retryConfig: RetryConfig;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.logger = new Logger();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * 指数バックオフでリトライ実行
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retryConfig.initialDelay;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxRetries) {
          this.logger.warn(
            `${operationName} failed (attempt ${attempt + 1}/${
              this.retryConfig.maxRetries + 1
            }), retrying in ${delay}ms...`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelay);
        }
      }
    }

    throw new Error(`${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Milvusに接続
   */
  async connect(config: VectorStoreConfig): Promise<void> {
    this.logger.info('Connecting to Milvus...');

    const milvusConfig = config.config as Record<string, unknown>;
    this.config = {
      address: milvusConfig['address'] as string,
      token: milvusConfig['token'] as string | undefined,
      username: milvusConfig['username'] as string | undefined,
      password: milvusConfig['password'] as string | undefined,
      ssl: milvusConfig['ssl'] as boolean | undefined,
      standalone: milvusConfig['standalone'] as boolean | undefined,
    };

    await this.retryWithBackoff(async () => {
      this.client = new MilvusClient({
        address: this.config!.address,
        token: this.config!.token,
        username: this.config!.username,
        password: this.config!.password,
        ssl: this.config!.ssl || false,
      });

      // 接続テスト: バージョン情報を取得
      const version = await this.client.getVersion();
      this.logger.info(`Connected to Milvus version: ${version.version}`);
    }, 'connect');
  }

  /**
   * Milvusから切断
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.info('Disconnecting from Milvus...');
      this.client = null;
      this.config = null;
      this.logger.info('Disconnected from Milvus');
    }
  }

  /**
   * クライアントが初期化されているか確認
   */
  private ensureClient(): MilvusClient {
    if (!this.client) {
      throw new Error('Milvus client is not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * コレクションを作成
   */
  async createCollection(name: string, dimension: number): Promise<void> {
    const client = this.ensureClient();
    this.logger.info(`Creating collection: ${name} (dimension: ${dimension})`);

    // コレクションが既に存在するか確認
    const hasCollection = await client.hasCollection({ collection_name: name });
    if (hasCollection.value) {
      throw new Error(`Collection ${name} already exists`);
    }

    // スキーマを定義
    const schema = {
      collection_name: name,
      fields: [
        {
          name: 'id',
          data_type: DataType.VarChar,
          is_primary_key: true,
          max_length: 512,
        },
        {
          name: 'vector',
          data_type: DataType.FloatVector,
          dim: dimension,
        },
        {
          name: 'metadata',
          data_type: DataType.JSON,
        },
      ],
    };

    await client.createCollection(schema);

    // インデックスを作成（IVF_FLAT）
    await client.createIndex({
      collection_name: name,
      field_name: 'vector',
      index_type: 'IVF_FLAT',
      metric_type: 'L2',
      params: { nlist: 1024 },
    });

    // コレクションをロード
    await client.loadCollection({ collection_name: name });

    this.logger.info(`Collection ${name} created successfully`);
  }

  /**
   * コレクションを削除
   */
  async deleteCollection(name: string): Promise<void> {
    const client = this.ensureClient();
    this.logger.info(`Deleting collection: ${name}`);

    const hasCollection = await client.hasCollection({ collection_name: name });
    if (!hasCollection.value) {
      this.logger.debug(`Collection ${name} does not exist, skipping deletion`);
      return;
    }

    await client.dropCollection({ collection_name: name });
    this.logger.info(`Collection ${name} deleted successfully`);
  }

  /**
   * ベクトルを挿入または更新
   */
  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    const client = this.ensureClient();
    this.logger.debug(`Upserting ${vectors.length} vectors to collection: ${collectionName}`);

    // コレクションの存在確認
    const hasCollection = await client.hasCollection({ collection_name: collectionName });
    if (!hasCollection.value) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    // データを整形
    const data = vectors.map((v) => ({
      id: v.id,
      vector: v.vector,
      metadata: v.metadata || {},
    }));

    // 既存のベクトルを削除（upsert動作のため）
    const ids = vectors.map((v) => v.id);
    try {
      await client.delete({
        collection_name: collectionName,
        expr: `id in [${ids.map((id) => `"${id}"`).join(', ')}]`,
      } as any);
    } catch (error) {
      // 削除エラーは無視（エンティティが存在しない場合）
      this.logger.debug(`Delete before upsert failed (ignoring): ${error}`);
    }

    // 新しいデータを挿入
    await client.insert({
      collection_name: collectionName,
      data,
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
    const client = this.ensureClient();
    this.logger.debug(
      `Querying collection: ${collectionName} (topK: ${topK}, filter: ${JSON.stringify(filter)})`
    );

    // コレクションの存在確認
    const hasCollection = await client.hasCollection({ collection_name: collectionName });
    if (!hasCollection.value) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    // フィルタ式を構築
    let expr: string | undefined;
    if (filter) {
      const conditions = Object.entries(filter).map(([key, value]) => {
        if (typeof value === 'string') {
          return `metadata["${key}"] == "${value}"`;
        } else if (typeof value === 'number') {
          return `metadata["${key}"] == ${value}`;
        } else if (typeof value === 'boolean') {
          return `metadata["${key}"] == ${value}`;
        }
        return '';
      });
      expr = conditions.filter((c) => c).join(' && ');
    }

    // 検索実行
    const results = await client.search({
      collection_name: collectionName,
      data: [vector],
      limit: topK,
      output_fields: ['id', 'metadata'],
      filter: expr,
    });

    // 結果を変換
    if (!results.results || results.results.length === 0) {
      return [];
    }

    return results.results.map((result: any) => ({
      id: result.id as string,
      score: 1 - (result.score as number), // L2距離を類似度に変換（0-1の範囲）
      metadata: result.metadata as Record<string, unknown>,
    }));
  }

  /**
   * ベクトルを削除
   */
  async delete(collectionName: string, ids: string[]): Promise<void> {
    const client = this.ensureClient();
    this.logger.debug(`Deleting ${ids.length} vectors from collection: ${collectionName}`);

    // コレクションの存在確認
    const hasCollection = await client.hasCollection({ collection_name: collectionName });
    if (!hasCollection.value) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    if (ids.length === 0) {
      return;
    }

    // 削除実行
    await client.delete({
      collection_name: collectionName,
      expr: `id in [${ids.map((id) => `"${id}"`).join(', ')}]`,
    } as any);

    this.logger.debug(`Deleted ${ids.length} vectors successfully`);
  }

  /**
   * コレクションの統計情報を取得
   */
  async getStats(collectionName: string): Promise<CollectionStats> {
    const client = this.ensureClient();
    this.logger.debug(`Getting stats for collection: ${collectionName}`);

    // コレクションの存在確認
    const hasCollection = await client.hasCollection({ collection_name: collectionName });
    if (!hasCollection.value) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    // コレクション情報を取得
    const collectionInfo = await client.describeCollection({ collection_name: collectionName });

    // エンティティ数を取得
    const stats = await client.getCollectionStatistics({ collection_name: collectionName });

    // ベクトルフィールドの次元数を取得
    const vectorField = collectionInfo.schema.fields.find(
      (f: any) => f.data_type === DataType.FloatVector
    );
    const dimValue = vectorField?.dim;
    const dimension = typeof dimValue === 'number' ? dimValue : (typeof dimValue === 'string' ? parseInt(dimValue, 10) : 0);

    // インデックスサイズを概算（エンティティ数 * 次元数 * 4バイト）
    const rowCount = stats.data.row_count;
    const vectorCount = typeof rowCount === 'string' ? parseInt(rowCount, 10) : (typeof rowCount === 'number' ? rowCount : 0);
    const indexSize = vectorCount * dimension * 4;

    return {
      vectorCount,
      dimension,
      indexSize,
    };
  }
}
