# LSP-MCP アーキテクチャドキュメント

## 概要

LSP-MCPは、Tree-sitterによるAST解析とベクターDBを組み合わせた、Claude Code向けのModel Context Protocol (MCP)プラグインです。レイヤー化されたアーキテクチャを採用し、各コンポーネントが明確な責務を持つ設計となっています。

## システムアーキテクチャ図

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Claude Code                                 │
│                        (Electron Client)                              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ MCP Protocol (stdio/HTTP)
                             │
┌────────────────────────────▼─────────────────────────────────────────┐
│                      MCP Server Layer                                 │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ MCPServer                                                      │   │
│  │  - initialize(), shutdown()                                   │   │
│  │  - handleToolCall()                                           │   │
│  │  - Error Handling & Logging                                   │   │
│  └───────┬───────────────────────────────────────────────────────┘   │
└──────────┼───────────────────────────────────────────────────────────┘
           │
           │ Tool Routing
           │
┌──────────▼───────────────────────────────────────────────────────────┐
│                      Service Layer                                    │
│  ┌──────────────────────┐          ┌──────────────────────────┐      │
│  │  Indexing Service    │          │  Hybrid Search Engine    │      │
│  │  - indexProject()    │          │  - search()              │      │
│  │  - indexFile()       │          │  - mergeResults()        │      │
│  │  - getIndexStatus()  │          │  - rankResults()         │      │
│  │  - deleteProject()   │          └──────┬────────┬──────────┘      │
│  └──────┬───────────────┘                 │        │                 │
└─────────┼─────────────────────────────────┼────────┼─────────────────┘
          │                                 │        │
          │                     ┌───────────┘        └───────────┐
          │                     │                                 │
┌─────────▼─────────────────────▼─────────────────────────────────▼────┐
│                         Parser Layer                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ AST Parser      │  │ Document Parser  │  │ BM25 Search      │    │
│  │ ┌─────────────┐ │  │ ┌──────────────┐ │  │ - Tokenizer      │    │
│  │ │ Symbol      │ │  │ │ Markdown     │ │  │ - Inverted Index │    │
│  │ │ Extractor   │ │  │ │ Parser       │ │  │ - BM25 Scoring   │    │
│  │ └─────────────┘ │  │ └──────────────┘ │  └──────────────────┘    │
│  │ ┌─────────────┐ │  │ ┌──────────────┐ │                           │
│  │ │ Comment     │ │  │ │ Doc-Code     │ │                           │
│  │ │ Extractor   │ │  │ │ Linker       │ │                           │
│  │ └─────────────┘ │  │ └──────────────┘ │                           │
│  └────────┬────────┘  └──────────────────┘                           │
│           │ Tree-sitter                                               │
└───────────┼───────────────────────────────────────────────────────────┘
            │
┌───────────▼───────────────────────────────────────────────────────────┐
│                       Storage Layer                                    │
│  ┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ Embedding Engine  │  │ Vector Store     │  │ Local Index      │   │
│  │ ┌───────────────┐ │  │ Plugin Interface │  │ (SQLite)         │   │
│  │ │ Local Engine  │ │  │ ┌──────────────┐ │  │ - inverted_index │   │
│  │ │ (Transformers)│ │  │ │ Milvus       │ │  │ - BM25 data      │   │
│  │ └───────────────┘ │  │ │ Plugin       │ │  └──────────────────┘   │
│  │ ┌───────────────┐ │  │ └──────────────┘ │                          │
│  │ │ Cloud Engine  │ │  │ ┌──────────────┐ │                          │
│  │ │ (OpenAI/     │ │  │ │ Chroma       │ │                          │
│  │ │  VoyageAI)   │ │  │ │ Plugin       │ │                          │
│  │ └───────────────┘ │  │ └──────────────┘ │                          │
│  └───────────────────┘  └──────────────────┘                          │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────┐
│                       External Services                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ Milvus Standalone│  │ OpenAI API       │  │ Zilliz Cloud     │     │
│  │ (Docker)         │  │                  │  │ (Optional)       │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘

Additional Components:
┌────────────────────────────────────────────────────────────────────────┐
│                       Utilities Layer                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ File Watcher     │  │ Config Manager   │  │ Logger           │     │
│  │ (chokidar)       │  │ - Mode Manager   │  │ - Sanitizer      │     │
│  │ - Incremental    │  │ - Setup Wizard   │  │ - File Rotation  │     │
│  │   Updates        │  │                  │  │                  │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

## レイヤー構成

### 1. MCP Server Layer（MCPサーバー層）

**責務:**
- Claude Codeとの通信管理（MCP Protocol準拠）
- ツール呼び出しのルーティング
- リクエスト/レスポンスのバリデーション
- エラーハンドリングとログ記録

**主要コンポーネント:**
- `MCPServer`: MCP Protocol実装、ツール登録とハンドリング

**提供するツール:**
- `index_project`: プロジェクトインデックス化
- `search_code`: セマンティックコード検索
- `get_symbol`: シンボル定義/参照検索
- `find_related_docs`: 関連ドキュメント検索
- `get_index_status`: インデックス状況確認
- `clear_index`: インデックスクリア

### 2. Service Layer（サービス層）

**責務:**
- ビジネスロジックの実装
- 複数コンポーネントの統合管理
- 進捗追跡と統計情報収集

**主要コンポーネント:**

#### Indexing Service（インデックス化サービス）
- プロジェクトスキャンとファイル列挙
- パーサーへの振り分け
- 埋め込み生成とストレージ保存
- 進捗イベントの発行

#### Hybrid Search Engine（ハイブリッド検索エンジン）
- BM25全文検索とベクトル検索の統合
- 結果のマージとランキング
- フィルタリング（言語、ファイルタイプ等）

**検索スコアリング:**
```
final_score = α × BM25_score + (1-α) × vector_similarity_score
where α = 0.3 (default, configurable)
```

### 3. Parser Layer（パーサー層）

**責務:**
- ソースコードとドキュメントの構造解析
- シンボル情報の抽出
- コメント/docstringの抽出
- ドキュメント-コード関連付け

**主要コンポーネント:**

#### AST Parser（抽象構文木パーサー）
- **SymbolExtractor**: 関数/クラス/変数定義の抽出
- **CommentExtractor**: コメント、docstring、TODOマーカーの抽出
- **ASTEngine**: Tree-sitterを使ったAST生成

**対応言語:**
- TypeScript/JavaScript
- Python
- Go
- Rust
- Java
- C/C++/Arduino

#### Document Parser（ドキュメントパーサー）
- **MarkdownParser**: Markdown構造解析、コードブロック抽出
- **DocCodeLinker**: ドキュメント-コード関連付け

#### BM25 Search（全文検索）
- **Tokenizer**: トークン分割、ストップワード除去
- **Inverted Index**: 転置インデックス管理
- **BM25 Scoring**: BM25アルゴリズム実装

### 4. Storage Layer（ストレージ層）

**責務:**
- データの永続化
- ベクトル検索とメタデータ管理
- 埋め込みベクトル生成

**主要コンポーネント:**

#### Embedding Engine（埋め込みエンジン）
- **LocalEmbeddingEngine**: Transformers.js（ローカル実行）
  - モデル: Xenova/all-MiniLM-L6-v2（デフォルト）
  - オフライン動作対応
- **CloudEmbeddingEngine**: OpenAI/VoyageAI API（クラウド実行）
  - OpenAI: text-embedding-3-small/large
  - VoyageAI: voyage-code-2

#### Vector Store（ベクターストア）
プラグインアーキテクチャにより複数のバックエンドをサポート:

**ローカルバックエンド:**
- **Milvus Plugin**: Milvus standalone（Docker Compose）
  - 高性能、大規模プロジェクト向け
  - localhost:19530で実行
- **Chroma Plugin**: ChromaDB
  - Docker不要、軽量
  - 小規模プロジェクト向け

**クラウドバックエンド（オプション）:**
- Zilliz Cloud（Milvusマネージドサービス）
- Qdrant Cloud

#### Local Index（ローカルインデックス）
- SQLiteベースの転置インデックス
- BM25スコアリングデータ保存

## データフロー

### シーケンス1: プロジェクトインデックス化

```
Claude Code
    │
    │ index_project(rootPath, options)
    ▼
MCP Server
    │
    │ indexProject(rootPath, options)
    ▼
Indexing Service
    │
    ├─ scanFiles(rootPath)
    │  └─ FileScanner → file list
    │
    ├─ [For each source file]
    │  │
    │  ├─ SymbolExtractor.extractSymbols(file)
    │  │  └─ Tree-sitter → AST → definitions
    │  │
    │  ├─ CommentExtractor.extractComments(file)
    │  │  └─ Tree-sitter → comments, docstrings
    │  │
    │  ├─ EmbeddingEngine.embedBatch(texts)
    │  │  └─ vectors[]
    │  │
    │  ├─ VectorStore.upsert(vectors, metadata)
    │  │  └─ Save to Milvus/Chroma
    │  │
    │  └─ BM25Engine.index(texts)
    │     └─ Save to SQLite
    │
    ├─ [For each markdown file]
    │  │
    │  ├─ MarkdownParser.parse(file)
    │  │  └─ sections, code blocks
    │  │
    │  ├─ DocCodeLinker.link(doc, codeSymbols)
    │  │  └─ relevance scores
    │  │
    │  └─ (embed & save as above)
    │
    └─ return IndexResult(stats, errors)
```

### シーケンス2: ハイブリッド検索

```
Claude Code
    │
    │ search_code(query, options)
    ▼
MCP Server
    │
    │ search(query, options)
    ▼
Hybrid Search Engine
    │
    ├─ [Parallel Execution]
    │  │
    │  ├─ BM25Engine.search(query)
    │  │  ├─ tokenize(query)
    │  │  ├─ query SQLite inverted index
    │  │  └─ compute BM25 scores → results_bm25[]
    │  │
    │  └─ VectorStore.query(queryVector, topK)
    │     ├─ EmbeddingEngine.embed(query) → queryVector
    │     ├─ similarity search in Milvus/Chroma
    │     └─ return similar vectors → results_vector[]
    │
    ├─ mergeResults(results_bm25, results_vector)
    │  ├─ normalize scores
    │  ├─ compute: score = α×BM25 + (1-α)×vector
    │  └─ deduplicate
    │
    ├─ rankResults(merged)
    │  └─ sort by final score
    │
    └─ return SearchResults
```

### シーケンス3: インクリメンタル更新

```
File System
    │ file change event
    ▼
File Watcher (chokidar)
    │
    ├─ debounce(500ms)
    │
    │ onFileChange(filePath)
    ▼
Indexing Service
    │
    ├─ deleteOldEntries(filePath)
    │  ├─ VectorStore.delete(ids)
    │  └─ BM25Engine.remove(filePath)
    │
    ├─ indexFile(filePath)
    │  └─ (same as indexing flow above)
    │
    └─ emit('indexUpdated', filePath)
```

## コンポーネント詳細

### MCP Server

**ファイル:** `src/server/mcp-server.ts`

**主要メソッド:**
- `initialize()`: サーバー初期化、ツール登録
- `shutdown()`: クリーンアップ処理
- `handleToolCall(toolName, params)`: ツール呼び出しハンドラー

### Indexing Service

**ファイル:** `src/services/indexing-service.ts`

**主要メソッド:**
- `indexProject(rootPath, options)`: プロジェクト全体インデックス化
- `indexFile(filePath)`: 単一ファイルインデックス化
- `getIndexStatus(projectId)`: インデックス統計取得
- `deleteProject(projectId)`: プロジェクトインデックス削除

**イベント:**
- `progress`: インデックス化進捗（ファイル単位）
- `complete`: インデックス化完了
- `error`: エラー発生

### Hybrid Search Engine

**ファイル:** `src/services/hybrid-search-engine.ts`

**主要メソッド:**
- `search(query, options)`: ハイブリッド検索
- `vectorSearch(query, topK)`: ベクトル検索のみ
- `fullTextSearch(query, topK)`: 全文検索のみ

**設定:**
- `hybridWeight`: BM25の重み（デフォルト: 0.3）
- `topK`: 取得結果数（デフォルト: 20）

### Vector Store Plugin Interface

**ファイル:** `src/storage/types.ts`

**インターフェース:** `VectorStorePlugin`

**必須メソッド:**
- `connect(config)`: 接続
- `disconnect()`: 切断
- `createCollection(name, dimension)`: コレクション作成
- `upsert(collectionName, vectors)`: ベクトル挿入/更新
- `query(collectionName, vector, topK, filter?)`: 類似検索
- `delete(collectionName, ids)`: ベクトル削除
- `getStats(collectionName)`: 統計情報取得

### Embedding Engine Interface

**ファイル:** `src/embedding/types.ts`

**インターフェース:** `EmbeddingEngine`

**必須メソッド:**
- `initialize()`: 初期化
- `embed(text)`: 単一埋め込み
- `embedBatch(texts)`: バッチ埋め込み
- `getDimension()`: ベクトル次元数取得
- `dispose()`: リソース解放

## データベーススキーマ

### Vector DB Collection: `code_vectors`

| フィールド | 型 | 説明 |
|-----------|------|------|
| id | string | 一意識別子（filePath:lineStart） |
| vector | float[] | 埋め込みベクトル |
| project_id | string | プロジェクトID |
| file_path | string | ファイルパス |
| language | string | 言語（typescript, python等） |
| type | string | エントリタイプ（function, class等） |
| name | string | シンボル名 |
| line_start | int | 開始行番号 |
| line_end | int | 終了行番号 |
| snippet | string | コードスニペット（最大500文字） |
| docstring | string | docstring/コメント |
| scope | string | スコープ（module, class, function） |
| metadata | json | 追加メタデータ |
| created_at | timestamp | 作成日時 |
| updated_at | timestamp | 更新日時 |

### Local Index (SQLite): `inverted_index`

```sql
CREATE TABLE inverted_index (
  term TEXT NOT NULL,
  document_id TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  positions TEXT, -- JSON array of positions
  PRIMARY KEY (term, document_id)
);

CREATE INDEX idx_term ON inverted_index(term);
CREATE INDEX idx_doc_id ON inverted_index(document_id);
```

## プライバシーファースト設計

### ローカルモード（デフォルト）
- **埋め込み**: Transformers.js（完全ローカル実行）
- **ベクターDB**: Milvus standalone（Docker）またはChroma（Docker不要）
- **外部通信**: ゼロ（`blockExternalCalls: true`）
- **利点**: プライバシー保護、オフライン動作、APIコスト不要

### クラウドモード（オプション）
- **埋め込み**: OpenAI API、VoyageAI API
- **ベクターDB**: Zilliz Cloud、Qdrant Cloud
- **外部通信**: 必要
- **利点**: 高性能、セットアップ簡単、スケーラブル

### モード切り替え
設定ファイル `.lsp-mcp.json` の `mode` フィールドで切り替え:
- `"mode": "local"` → ローカルモード
- `"mode": "cloud"` → クラウドモード

## パフォーマンス最適化

### インデックス化
- **並列処理**: ワーカースレッドによるファイル並列処理
- **バッチ埋め込み**: 複数テキストを一度に処理
- **インクリメンタル更新**: 変更ファイルのみ再インデックス化

### 検索
- **並列検索**: BM25とベクトル検索を並列実行
- **キャッシュ**: 頻出クエリ結果のキャッシング
- **インデックス最適化**: HNSWインデックス（Milvus）

### メモリ管理
- **ストリーミング処理**: 大規模ファイル対応
- **モデルプール**: Tree-sitterパーサーの再利用
- **自動GC**: 定期的なガベージコレクション

## セキュリティ考慮事項

### データ保護
- センシティブファイル自動除外（`.env`, `credentials.json`等）
- ベクターDBへの送信前プライバシーチェック
- ローカル実行オプション（外部通信なし）

### 認証情報管理
- APIキーはOS標準キーチェーンに保存
- 設定ファイル内の平文保存禁止
- 環境変数からの読み取りサポート

### 通信暗号化
- ベクターDB接続: TLS/SSL必須
- 埋め込みAPI通信: HTTPS必須

## 拡張性

### プラグイン追加
新しいベクターDBやパーサーを簡単に追加可能:

**Vector Store Plugin例:**
```typescript
import { VectorStorePlugin } from '../storage/types.js';

export class NewVectorStorePlugin implements VectorStorePlugin {
  readonly name = 'new-vector-db';

  async connect(config: VectorStoreConfig): Promise<void> {
    // 接続処理
  }

  // ... 他のメソッド実装
}

// 登録
registry.register(new NewVectorStorePlugin());
```

**Embedding Engine例:**
```typescript
import { EmbeddingEngine } from '../embedding/types.js';

export class NewEmbeddingEngine implements EmbeddingEngine {
  async initialize(): Promise<void> {
    // 初期化処理
  }

  async embed(text: string): Promise<number[]> {
    // 埋め込み処理
  }

  // ... 他のメソッド実装
}
```

## エラーハンドリング

### エラーカテゴリ
- **ConfigError**: 設定エラー
- **FileSystemError**: ファイルシステムエラー
- **ParseError**: パースエラー
- **NetworkError**: ネットワークエラー
- **StorageError**: ストレージエラー

### リカバリー戦略
- **部分的失敗の許容**: 単一ファイルエラーで全体停止しない
- **自動リトライ**: ネットワークエラー時の自動リトライ（最大3回）
- **フォールバック**: プライマリ失敗時のセカンダリオプション

### エラー通知
すべてのエラーには以下を含む:
- エラーコード
- わかりやすいメッセージ
- 対処方法の提案（可能な場合）
- リカバリー可能かどうか

## 関連ドキュメント

- [セットアップガイド](./SETUP.md)
- [設定リファレンス](./CONFIGURATION.md)
- [プラグイン開発ガイド](./PLUGIN_DEVELOPMENT.md)
- [MCP Tools APIリファレンス](./MCP_TOOLS_API.md)
- [トラブルシューティング](./TROUBLESHOOTING.md)
