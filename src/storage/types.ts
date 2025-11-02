/**
 * Vector Store Plugin Types
 *
 * ベクターDBプラグインインターフェースの型定義
 * 複数のベクターDBバックエンド（Milvus, Chroma, Zilliz Cloud, Qdrant等）に対応
 */

/**
 * ベクトルデータ
 */
export interface Vector {
  /** ベクトルの一意識別子 */
  id: string;
  /** 埋め込みベクトル（数値配列） */
  vector: number[];
  /** 付加的なメタデータ（ファイルパス、言語、シンボル名等） */
  metadata?: Record<string, unknown>;
}

/**
 * クエリ結果
 */
export interface QueryResult {
  /** ベクトルID */
  id: string;
  /** 類似度スコア（0-1、高いほど類似） */
  score: number;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * コレクション統計情報
 */
export interface CollectionStats {
  /** ベクトル数 */
  vectorCount: number;
  /** ベクトル次元数 */
  dimension: number;
  /** インデックスサイズ（バイト） */
  indexSize: number;
}

/**
 * ベクターストア設定
 */
export interface VectorStoreConfig {
  /** バックエンド種別（milvus, chroma, zilliz, qdrant等） */
  backend: string;
  /** バックエンド固有の設定 */
  config: Record<string, unknown>;
}

/**
 * ベクターストアプラグインインターフェース
 *
 * すべてのベクターDBプラグインはこのインターフェースを実装する必要があります。
 *
 * @example
 * ```typescript
 * class MilvusPlugin implements VectorStorePlugin {
 *   name = 'milvus';
 *
 *   async connect(config: VectorStoreConfig): Promise<void> {
 *     // Milvusへの接続処理
 *   }
 *
 *   async query(collectionName: string, vector: number[], topK: number): Promise<QueryResult[]> {
 *     // 類似ベクトル検索処理
 *   }
 *
 *   // ... その他のメソッド実装
 * }
 * ```
 */
export interface VectorStorePlugin {
  /** プラグイン名（ユニークである必要がある） */
  readonly name: string;

  /**
   * ベクターストアへ接続
   * @param config ベクターストア設定
   * @throws 接続に失敗した場合
   */
  connect(config: VectorStoreConfig): Promise<void>;

  /**
   * ベクターストアから切断
   */
  disconnect(): Promise<void>;

  /**
   * コレクションを作成
   * @param name コレクション名
   * @param dimension ベクトル次元数
   * @throws コレクションが既に存在する場合
   */
  createCollection(name: string, dimension: number): Promise<void>;

  /**
   * コレクションを削除
   * @param name コレクション名
   */
  deleteCollection(name: string): Promise<void>;

  /**
   * ベクトルを挿入または更新
   * @param collectionName コレクション名
   * @param vectors ベクトル配列
   * @throws コレクションが存在しない場合
   */
  upsert(collectionName: string, vectors: Vector[]): Promise<void>;

  /**
   * 類似ベクトルを検索
   * @param collectionName コレクション名
   * @param vector クエリベクトル
   * @param topK 取得する上位K件
   * @param filter メタデータフィルタ（オプション）
   * @returns 類似度順にソートされた結果配列
   * @throws コレクションが存在しない場合
   */
  query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]>;

  /**
   * ベクトルを削除
   * @param collectionName コレクション名
   * @param ids 削除するベクトルID配列
   * @throws コレクションが存在しない場合
   */
  delete(collectionName: string, ids: string[]): Promise<void>;

  /**
   * コレクションの統計情報を取得
   * @param collectionName コレクション名
   * @returns 統計情報
   * @throws コレクションが存在しない場合
   */
  getStats(collectionName: string): Promise<CollectionStats>;
}

/**
 * ベクターストアプラグインレジストリ
 *
 * プラグインの登録、取得、切り替えを管理します。
 *
 * @example
 * ```typescript
 * const registry = new VectorStorePluginRegistry();
 *
 * // プラグインを登録
 * registry.register(new MilvusPlugin());
 * registry.register(new ChromaPlugin());
 *
 * // プラグインを取得
 * const milvus = registry.get('milvus');
 *
 * // 利用可能なプラグイン一覧
 * console.log(registry.list()); // ['milvus', 'chroma']
 * ```
 */
export class VectorStorePluginRegistry {
  private plugins: Map<string, VectorStorePlugin> = new Map();

  /**
   * プラグインを登録
   * @param plugin ベクターストアプラグイン
   * @throws 同じ名前のプラグインが既に登録されている場合
   */
  register(plugin: VectorStorePlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * プラグインを取得
   * @param name プラグイン名
   * @returns ベクターストアプラグイン
   * @throws プラグインが見つからない場合
   */
  get(name: string): VectorStorePlugin {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }
    return plugin;
  }

  /**
   * プラグインが登録されているか確認
   * @param name プラグイン名
   * @returns 登録されている場合true
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * プラグインの登録を解除
   * @param name プラグイン名
   */
  unregister(name: string): void {
    this.plugins.delete(name);
  }

  /**
   * 登録されているプラグイン名の一覧を取得
   * @returns プラグイン名の配列
   */
  list(): string[] {
    return Array.from(this.plugins.keys());
  }
}
