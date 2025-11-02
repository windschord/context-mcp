/**
 * Embedding Engine Types
 *
 * 埋め込みエンジンのインターフェース定義
 * ローカル（Transformers.js）とクラウド（OpenAI, VoyageAI）に対応
 */

/**
 * 埋め込みエンジンインターフェース
 *
 * すべての埋め込みエンジン実装はこのインターフェースを実装する必要があります。
 *
 * @example
 * ```typescript
 * class LocalEmbeddingEngine implements EmbeddingEngine {
 *   async initialize(): Promise<void> {
 *     // モデルのロード処理
 *   }
 *
 *   async embed(text: string): Promise<number[]> {
 *     // テキストを埋め込みベクトルに変換
 *   }
 *
 *   // ... その他のメソッド実装
 * }
 * ```
 */
export interface EmbeddingEngine {
  /**
   * エンジンの初期化
   * モデルのロードやAPIクライアントのセットアップを行います。
   * @throws 初期化に失敗した場合
   */
  initialize(): Promise<void>;

  /**
   * 単一テキストの埋め込み
   * @param text 埋め込み対象のテキスト
   * @returns 埋め込みベクトル
   * @throws エンジンが初期化されていない場合
   */
  embed(text: string): Promise<number[]>;

  /**
   * バッチテキストの埋め込み
   * 複数のテキストを一度に処理することで効率化を図ります。
   * @param texts 埋め込み対象のテキスト配列
   * @returns 埋め込みベクトルの配列
   * @throws エンジンが初期化されていない場合
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * ベクトル次元数を取得
   * @returns ベクトルの次元数
   */
  getDimension(): number;

  /**
   * リソースの解放
   * モデルやAPIクライアントのクリーンアップを行います。
   */
  dispose(): Promise<void>;
}

/**
 * ローカル埋め込みエンジンの設定
 */
export interface LocalEmbeddingOptions {
  /** モデル名（デフォルト: Xenova/all-MiniLM-L6-v2） */
  modelName?: string;
  /** モデルキャッシュディレクトリ（デフォルト: ./.lsp-mcp/models） */
  cacheDir?: string;
  /** バッチサイズ（デフォルト: 32） */
  batchSize?: number;
}

/**
 * クラウド埋め込みエンジンの設定
 */
export interface CloudEmbeddingOptions {
  /** プロバイダー（openai, voyageai） */
  provider: 'openai' | 'voyageai';
  /** APIキー */
  apiKey: string;
  /** モデル名 */
  modelName: string;
  /** バッチサイズ（デフォルト: 100） */
  batchSize?: number;
  /** リトライ回数（デフォルト: 3） */
  maxRetries?: number;
  /** タイムアウト（ミリ秒、デフォルト: 30000） */
  timeout?: number;
}
