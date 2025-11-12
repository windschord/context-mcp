/**
 * Context-MCP設定ファイルのスキーマ定義
 * .context-mcp.jsonファイルの型定義
 */

/**
 * 動作モード
 */
export type Mode = 'local' | 'cloud';

/**
 * ベクターDBバックエンド
 */
export type VectorStoreBackend = 'milvus' | 'zilliz' | 'qdrant';

/**
 * 埋め込みプロバイダー
 */
export type EmbeddingProvider = 'transformers' | 'openai' | 'voyageai';

/**
 * ベクターストア設定
 */
export interface VectorStoreConfig {
  backend: VectorStoreBackend;
  config: {
    address?: string;
    standalone?: boolean;
    dataPath?: string;
    path?: string;
    token?: string;
    [key: string]: unknown;
  };
}

/**
 * 埋め込み設定
 */
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey?: string;
  local: boolean;
}

/**
 * プライバシー設定
 */
export interface PrivacyConfig {
  blockExternalCalls: boolean;
}

/**
 * 検索設定
 */
export interface SearchConfig {
  bm25Weight: number;
  vectorWeight: number;
}

/**
 * インデックス化設定
 */
export interface IndexingConfig {
  languages: string[];
  excludePatterns: string[];
  includeDocuments: boolean;
}

/**
 * テレメトリ設定
 */
export interface TelemetryConfig {
  enabled: boolean;
  otlp?: {
    endpoint: string;
    protocol: 'grpc' | 'http/protobuf';
  };
  serviceName?: string;
  samplingRate?: number;
  exporters?: {
    traces?: 'otlp' | 'console' | 'none';
    metrics?: 'otlp' | 'console' | 'none';
    logs?: 'otlp' | 'console' | 'none';
  };
}

/**
 * Context-MCP設定の完全な型定義
 */
export interface ContextMcpConfig {
  mode: Mode;
  vectorStore: VectorStoreConfig;
  embedding: EmbeddingConfig;
  privacy?: PrivacyConfig;
  search?: SearchConfig;
  indexing?: IndexingConfig;
  telemetry?: TelemetryConfig;
}

/**
 * デフォルト設定
 */
export const DEFAULT_CONFIG: ContextMcpConfig = {
  mode: 'local',
  vectorStore: {
    backend: 'milvus',
    config: {
      address: 'localhost:19530',
      standalone: true,
      dataPath: './volumes',
    },
  },
  embedding: {
    provider: 'transformers',
    model: 'Xenova/all-MiniLM-L6-v2',
    local: true,
  },
  privacy: {
    blockExternalCalls: true,
  },
  search: {
    bm25Weight: 0.3,
    vectorWeight: 0.7,
  },
  indexing: {
    languages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'c', 'cpp'],
    excludePatterns: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      '*.min.js',
      '.env',
      '.env.*',
      'credentials.json',
      '**/secret/**',
      '**/secrets/**',
    ],
    includeDocuments: true,
  },
};
