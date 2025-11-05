# 設定リファレンス

このドキュメントでは、Context-MCPの設定ファイル`.context-mcp.json`の全オプションを詳しく説明します。

## 目次

- [設定ファイルの場所](#設定ファイルの場所)
- [基本構造](#基本構造)
- [mode（動作モード）](#mode動作モード)
- [vectorStore（ベクターDB設定）](#vectorstoreベクターdb設定)
- [embedding（埋め込み設定）](#embedding埋め込み設定)
- [indexing（インデックス化設定）](#indexingインデックス化設定)
- [search（検索設定）](#search検索設定)
- [privacy（プライバシー設定）](#privacyプライバシー設定)
- [logging（ロギング設定）](#loggingロギング設定)
- [環境変数](#環境変数)
- [設定例集](#設定例集)

## 設定ファイルの場所

設定ファイル`.context-mcp.json`は、以下の順序で検索されます:

1. **プロジェクトルート**: `./context-mcp.json` または `./.context-mcp.json`
2. **ホームディレクトリ**: `~/.context-mcp/config.json`
3. **グローバル設定**: `/etc/context-mcp/config.json`（Linux/macOS）

通常は**プロジェクトルート**に配置することを推奨します。

## 基本構造

最小構成の設定ファイル:

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "chroma"
  },
  "embedding": {
    "provider": "transformers"
  }
}
```

完全な設定ファイル（全オプション）:

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": { /* バックエンド固有の設定 */ }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "batchSize": 32,
    "dimensions": 384
  },
  "indexing": {
    "excludePatterns": [],
    "includePatterns": [],
    "maxFileSize": 1048576,
    "languages": [],
    "includeDocuments": true,
    "workers": 4
  },
  "search": {
    "hybridAlpha": 0.3,
    "topK": 20,
    "minScore": 0.0
  },
  "privacy": {
    "blockExternalCalls": true,
    "sensitivePatterns": []
  },
  "logging": {
    "level": "info",
    "file": ".context-mcp/logs/app.log"
  }
}
```

## mode（動作モード）

**型**: `string`
**デフォルト**: `"local"`
**必須**: いいえ

動作モードを指定します。

### 使用可能な値

- `"local"`: ローカルモード（デフォルト、外部通信なし）
- `"cloud"`: クラウドモード（外部API使用）

### 例

```json
{
  "mode": "local"
}
```

## vectorStore（ベクターDB設定）

**型**: `object`
**必須**: はい

ベクターデータベースの設定を指定します。

### vectorStore.backend

**型**: `string`
**デフォルト**: `"chroma"`
**必須**: はい

使用するベクターDBバックエンドを指定します。

#### 使用可能な値

- `"milvus"`: Milvus standalone（高性能、Docker必要）
- `"chroma"`: ChromaDB（軽量、Docker不要）
- `"zilliz"`: Zilliz Cloud（Milvusのマネージドサービス）
- `"qdrant"`: Qdrant Cloud

### Milvus設定

```json
{
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530",
      "standalone": true,
      "dataPath": "./volumes",
      "username": "",
      "password": "",
      "secure": false,
      "collectionName": "lsp_mcp_vectors",
      "indexType": "IVF_FLAT",
      "metricType": "L2",
      "nlist": 128
    }
  }
}
```

#### Milvusオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `address` | string | `"localhost:19530"` | Milvusサーバーのアドレス |
| `standalone` | boolean | `true` | standaloneモードかクラスタモードか |
| `dataPath` | string | `"./volumes"` | データ永続化パス（standaloneのみ） |
| `username` | string | `""` | 認証ユーザー名（オプション） |
| `password` | string | `""` | 認証パスワード（オプション） |
| `secure` | boolean | `false` | TLS/SSL接続を使用するか |
| `collectionName` | string | `"lsp_mcp_vectors"` | コレクション名 |
| `indexType` | string | `"IVF_FLAT"` | インデックスタイプ（IVF_FLAT, HNSW等） |
| `metricType` | string | `"L2"` | 距離計算方法（L2, IP, COSINE） |
| `nlist` | number | `128` | IVF_FLATのクラスター数 |

### Chroma設定

```json
{
  "vectorStore": {
    "backend": "chroma",
    "config": {
      "path": "./.context-mcp/chroma",
      "collectionName": "lsp_mcp_vectors",
      "persistDirectory": true
    }
  }
}
```

#### Chromaオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `path` | string | `"./.context-mcp/chroma"` | データ保存パス |
| `collectionName` | string | `"lsp_mcp_vectors"` | コレクション名 |
| `persistDirectory` | boolean | `true` | データを永続化するか |

### Zilliz Cloud設定

```json
{
  "vectorStore": {
    "backend": "zilliz",
    "config": {
      "address": "xxx-xxx.vectordb.zillizcloud.com:19530",
      "token": "${ZILLIZ_TOKEN}",
      "secure": true,
      "collectionName": "lsp_mcp_vectors"
    }
  }
}
```

#### Zillizオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `address` | string | **必須** | Zillizクラスターのエンドポイント |
| `token` | string | **必須** | APIトークン（環境変数推奨） |
| `secure` | boolean | `true` | TLS/SSL接続（常にtrue推奨） |
| `collectionName` | string | `"lsp_mcp_vectors"` | コレクション名 |

### Qdrant Cloud設定

```json
{
  "vectorStore": {
    "backend": "qdrant",
    "config": {
      "url": "https://xxx-xxx.qdrant.io",
      "apiKey": "${QDRANT_API_KEY}",
      "collectionName": "lsp_mcp_vectors"
    }
  }
}
```

## embedding（埋め込み設定）

**型**: `object`
**必須**: はい

テキスト埋め込みの設定を指定します。

### embedding.provider

**型**: `string`
**デフォルト**: `"transformers"`
**必須**: はい

使用する埋め込みプロバイダーを指定します。

#### 使用可能な値

- `"transformers"`: Transformers.js（ローカル実行）
- `"openai"`: OpenAI API
- `"voyageai"`: VoyageAI API

### Transformers.js設定（ローカル）

```json
{
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "local": true,
    "batchSize": 32,
    "dimensions": 384,
    "cachePath": "~/.cache/transformers/"
  }
}
```

#### Transformers.jsオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `model` | string | `"Xenova/all-MiniLM-L6-v2"` | 使用モデル |
| `local` | boolean | `true` | ローカル実行フラグ |
| `batchSize` | number | `32` | バッチサイズ |
| `dimensions` | number | `384` | ベクトル次元数 |
| `cachePath` | string | `"~/.cache/transformers/"` | モデルキャッシュパス |

**推奨モデル**:
- `Xenova/all-MiniLM-L6-v2`: 高速、384次元（デフォルト）
- `Xenova/all-mpnet-base-v2`: 高精度、768次元
- `Xenova/multilingual-e5-small`: 多言語対応、384次元

### OpenAI設定（クラウド）

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}",
    "batchSize": 100,
    "dimensions": 1536,
    "timeout": 30000,
    "maxRetries": 3
  }
}
```

#### OpenAIオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `model` | string | `"text-embedding-3-small"` | 使用モデル |
| `apiKey` | string | **必須** | OpenAI APIキー（環境変数推奨） |
| `batchSize` | number | `100` | バッチサイズ |
| `dimensions` | number | `1536` | ベクトル次元数 |
| `timeout` | number | `30000` | タイムアウト（ミリ秒） |
| `maxRetries` | number | `3` | リトライ回数 |

**使用可能なモデル**:
- `text-embedding-3-small`: 1536次元、安価（推奨）
- `text-embedding-3-large`: 3072次元、高精度
- `text-embedding-ada-002`: 1536次元、レガシー

**コスト目安**:
- `text-embedding-3-small`: $0.02 / 1M tokens
- `text-embedding-3-large`: $0.13 / 1M tokens

### VoyageAI設定（クラウド）

```json
{
  "embedding": {
    "provider": "voyageai",
    "model": "voyage-code-2",
    "apiKey": "${VOYAGEAI_API_KEY}",
    "batchSize": 128,
    "dimensions": 1536
  }
}
```

#### VoyageAIオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `model` | string | `"voyage-code-2"` | 使用モデル |
| `apiKey` | string | **必須** | VoyageAI APIキー |
| `batchSize` | number | `128` | バッチサイズ |
| `dimensions` | number | `1536` | ベクトル次元数 |

**使用可能なモデル**:
- `voyage-code-2`: コード特化、1536次元（推奨）
- `voyage-2`: 汎用、1024次元

## indexing（インデックス化設定）

**型**: `object`
**必須**: いいえ

ファイルのインデックス化に関する設定を指定します。

### 完全な設定例

```json
{
  "indexing": {
    "excludePatterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "*.min.js",
      "*.map"
    ],
    "includePatterns": [
      "src/**/*.ts",
      "src/**/*.py",
      "docs/**/*.md"
    ],
    "maxFileSize": 1048576,
    "languages": ["typescript", "python", "go"],
    "includeDocuments": true,
    "includeComments": true,
    "workers": 4,
    "debounceMs": 500
  }
}
```

### indexingオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `excludePatterns` | string[] | `["node_modules/**", ".git/**"]` | 除外パターン（glob） |
| `includePatterns` | string[] | `[]` | 含めるパターン（空=全て） |
| `maxFileSize` | number | `1048576` | 最大ファイルサイズ（バイト、1MB） |
| `languages` | string[] | `[]` | 対象言語（空=全て） |
| `includeDocuments` | boolean | `true` | Markdownを含めるか |
| `includeComments` | boolean | `true` | コメント・docstringを含めるか |
| `workers` | number | `4` | 並列処理のワーカー数 |
| `debounceMs` | number | `500` | ファイル変更のデバウンス時間 |

### デフォルトの除外パターン

以下のパターンは自動的に除外されます:

```javascript
[
  "node_modules/**",
  ".git/**",
  ".svn/**",
  ".hg/**",
  "dist/**",
  "build/**",
  "out/**",
  "target/**",
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.lock",
  ".env",
  ".env.*",
  "*.key",
  "*.pem",
  "credentials.json"
]
```

### センシティブファイルの自動除外

以下のファイルは自動的に除外されます:

- `.env`, `.env.local`, `.env.production`
- `**/credentials.json`, `**/secrets.json`
- `**/*.key`, `**/*.pem`, `**/*.cert`
- `**/id_rsa`, `**/id_ed25519`
- `**/token`, `**/api-key`

## search（検索設定）

**型**: `object`
**必須**: いいえ

検索動作に関する設定を指定します。

### 完全な設定例

```json
{
  "search": {
    "hybridAlpha": 0.3,
    "topK": 20,
    "minScore": 0.0,
    "bm25": {
      "k1": 1.5,
      "b": 0.75
    },
    "reranking": false
  }
}
```

### searchオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `hybridAlpha` | number | `0.3` | ハイブリッド検索の重み（0=BM25のみ、1=ベクトルのみ） |
| `topK` | number | `20` | 返す結果の最大数 |
| `minScore` | number | `0.0` | 最小スコア閾値 |
| `bm25.k1` | number | `1.5` | BM25パラメータk1 |
| `bm25.b` | number | `0.75` | BM25パラメータb |
| `reranking` | boolean | `false` | リランキング有効化（実験的） |

### ハイブリッド検索の重み調整

`hybridAlpha`の値によって検索の挙動が変わります:

```
最終スコア = α × BM25スコア + (1-α) × ベクトル類似度

α = 0.0 : BM25全文検索のみ（キーワードマッチ重視）
α = 0.3 : バランス型（デフォルト、推奨）
α = 0.5 : 完全に半々
α = 1.0 : ベクトル検索のみ（セマンティック重視）
```

**推奨値**:
- **コード検索**: `0.3`（デフォルト）
- **ドキュメント検索**: `0.5`
- **セマンティック検索**: `0.7`

## privacy（プライバシー設定）

**型**: `object`
**必須**: いいえ

プライバシー保護に関する設定を指定します。

### 完全な設定例

```json
{
  "privacy": {
    "blockExternalCalls": true,
    "sensitivePatterns": [
      "password",
      "secret",
      "token",
      "api_key"
    ],
    "anonymizeErrors": true
  }
}
```

### privacyオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `blockExternalCalls` | boolean | `true` | 外部通信をブロック（localモード時） |
| `sensitivePatterns` | string[] | `[...]` | センシティブキーワード |
| `anonymizeErrors` | boolean | `true` | エラーメッセージから個人情報を削除 |

## logging（ロギング設定）

**型**: `object`
**必須**: いいえ

ログ出力に関する設定を指定します。

### 完全な設定例

```json
{
  "logging": {
    "level": "info",
    "file": ".context-mcp/logs/app.log",
    "maxFileSize": 10485760,
    "maxFiles": 5,
    "console": true
  }
}
```

### loggingオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `level` | string | `"info"` | ログレベル（debug/info/warn/error） |
| `file` | string | `".context-mcp/logs/app.log"` | ログファイルパス |
| `maxFileSize` | number | `10485760` | ログファイルの最大サイズ（10MB） |
| `maxFiles` | number | `5` | 保持するログファイル数 |
| `console` | boolean | `true` | コンソール出力を有効にするか |

## 環境変数

設定ファイル内で環境変数を使用できます。

### 使用方法

```json
{
  "vectorStore": {
    "config": {
      "token": "${ZILLIZ_TOKEN}"
    }
  },
  "embedding": {
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

### 利用可能な環境変数

| 環境変数 | 説明 |
|---------|------|
| `ZILLIZ_TOKEN` | Zilliz Cloud APIトークン |
| `OPENAI_API_KEY` | OpenAI APIキー |
| `VOYAGEAI_API_KEY` | VoyageAI APIキー |
| `QDRANT_API_KEY` | Qdrant Cloud APIキー |
| `LSP_MCP_LOG_LEVEL` | ログレベル（設定ファイルを上書き） |
| `LSP_MCP_MODE` | 動作モード（設定ファイルを上書き） |

### 環境変数の設定方法

#### Linux/macOS

```bash
# ~/.bashrc または ~/.zshrc に追加
export OPENAI_API_KEY="sk-..."
export ZILLIZ_TOKEN="your-token"

# 反映
source ~/.bashrc
```

#### Windows (PowerShell)

```powershell
# 永続的に設定
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'sk-...', 'User')
```

## 設定例集

### 最小構成（軽量モード）

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "chroma"
  },
  "embedding": {
    "provider": "transformers"
  }
}
```

### 標準構成（Milvus）

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  "indexing": {
    "workers": 4
  }
}
```

### 高性能構成（Milvus + HNSW）

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530",
      "indexType": "HNSW",
      "metricType": "IP"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-mpnet-base-v2",
    "batchSize": 64
  },
  "indexing": {
    "workers": 8
  }
}
```

### クラウド構成（OpenAI + Zilliz）

```json
{
  "mode": "cloud",
  "vectorStore": {
    "backend": "zilliz",
    "config": {
      "address": "xxx-xxx.vectordb.zillizcloud.com:19530",
      "token": "${ZILLIZ_TOKEN}",
      "secure": true
    }
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

### TypeScriptプロジェクト特化

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "chroma"
  },
  "embedding": {
    "provider": "transformers"
  },
  "indexing": {
    "languages": ["typescript", "javascript"],
    "includePatterns": [
      "src/**/*.ts",
      "src/**/*.tsx"
    ],
    "excludePatterns": [
      "node_modules/**",
      "dist/**",
      "*.test.ts",
      "*.spec.ts"
    ]
  }
}
```

### Pythonプロジェクト特化

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "chroma"
  },
  "embedding": {
    "provider": "transformers"
  },
  "indexing": {
    "languages": ["python"],
    "includePatterns": [
      "**/*.py"
    ],
    "excludePatterns": [
      "venv/**",
      ".venv/**",
      "__pycache__/**",
      "*.pyc"
    ],
    "includeComments": true
  }
}
```

## 設定の検証

設定ファイルの妥当性を確認:

```bash
# 設定ファイルの検証
context-mcp validate-config

# 成功時:
# ✓ Configuration is valid
# Mode: local
# Vector Store: chroma
# Embedding: transformers (Xenova/all-MiniLM-L6-v2)

# エラー時:
# ✗ Configuration error:
# - vectorStore.backend: Invalid value "invalid"
# - embedding.provider: Missing required field
```

## JSON Schema

Context-MCPの設定ファイルはJSON Schemaで定義されています:

```bash
# スキーマをダウンロード
curl -O https://raw.githubusercontent.com/yourusername/context-mcp/main/schemas/config.schema.json

# VSCodeで補完を有効化（.vscode/settings.json）
{
  "json.schemas": [
    {
      "fileMatch": [".context-mcp.json"],
      "url": "./schemas/config.schema.json"
    }
  ]
}
```

## 参考資料

- [セットアップガイド](SETUP.md)
- [トラブルシューティング](TROUBLESHOOTING.md)
- [Milvus設定ドキュメント](https://milvus.io/docs/configure-docker.md)
- [Chroma設定ドキュメント](https://docs.trychroma.com/usage-guide)
- [OpenAI Embedding API](https://platform.openai.com/docs/guides/embeddings)
