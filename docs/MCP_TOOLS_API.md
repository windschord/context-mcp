# MCP Tools APIリファレンス

## 概要

Context-MCPは、Claude Codeから利用可能な6つのMCPツールを提供します。このドキュメントでは、各ツールの詳細な仕様、パラメータ、レスポンス形式、使用例を説明します。

## ツール一覧

| ツール名 | 説明 | 主な用途 |
|---------|------|---------|
| `index_project` | プロジェクト全体のインデックス化 | 初回セットアップ、全体再構築 |
| `search_code` | セマンティックコード検索 | コード片の検索、機能の探索 |
| `get_symbol` | シンボル定義/参照の取得 | 関数/クラスの定義と使用箇所の確認 |
| `find_related_docs` | 関連ドキュメントの検索 | コードに関連するドキュメントの発見 |
| `get_index_status` | インデックス状況の確認 | インデックスの健全性チェック |
| `clear_index` | インデックスのクリア | インデックスのリセット |

---

## 1. index_project

### 説明

プロジェクト全体をインデックス化します。指定されたルートパスからファイルをスキャンし、AST解析、埋め込み生成、ベクトルストアへの保存を実行します。

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `rootPath` | string | ✓ | - | プロジェクトのルートディレクトリパス（絶対パスまたは相対パス） |
| `languages` | string[] | ✗ | 自動検出 | 対象言語のリスト（例: `["typescript", "python"]`） |
| `excludePatterns` | string[] | ✗ | `["node_modules", ".git", "dist", "build"]` | 除外パターンのリスト（glob形式） |
| `includeDocuments` | boolean | ✗ | `true` | Markdownファイルを含めるか |

**パラメータスキーマ（JSON Schema）:**
```json
{
  "type": "object",
  "properties": {
    "rootPath": {
      "type": "string",
      "description": "プロジェクトのルートディレクトリパス"
    },
    "languages": {
      "type": "array",
      "items": { "type": "string" },
      "description": "対象言語のリスト"
    },
    "excludePatterns": {
      "type": "array",
      "items": { "type": "string" },
      "description": "除外パターンのリスト（glob形式）"
    },
    "includeDocuments": {
      "type": "boolean",
      "description": "Markdownファイルを含めるか",
      "default": true
    }
  },
  "required": ["rootPath"]
}
```

### レスポンス

**成功時:**
```json
{
  "totalFiles": number,        // スキャンされた総ファイル数
  "codeFiles": number,         // コードファイル数
  "documentFiles": number,     // ドキュメントファイル数
  "totalSymbols": number,      // 抽出されたシンボル数
  "processingTimeMs": number,  // 処理時間（ミリ秒）
  "errors": number,            // エラー数
  "status": string             // ステータスメッセージ
}
```

**Rust構造体参照:** `src/tools/mod.rs::IndexProjectResponse`

### 使用例

**基本的な使用:**
```json
{
  "rootPath": "/path/to/my-project"
}
```

**特定言語のみインデックス化:**
```json
{
  "rootPath": "/path/to/my-project",
  "languages": ["typescript", "javascript"],
  "excludePatterns": ["node_modules/**", "dist/**", "coverage/**"]
}
```

**ドキュメントを除外:**
```json
{
  "rootPath": "/path/to/my-project",
  "includeDocuments": false
}
```

### 想定される処理時間

| プロジェクト規模 | ファイル数 | 処理時間（目安） |
|---------------|-----------|----------------|
| 小規模 | ~100 | 10-30秒 |
| 中規模 | ~1,000 | 1-3分 |
| 大規模 | ~10,000 | 5-10分 |

---

## 2. search_code

### 説明

セマンティックコード検索を実行します。BM25全文検索とベクトル検索を組み合わせたハイブリッド検索により、高精度な検索結果を提供します。

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `query` | string | ✓ | - | 検索クエリ（自然言語またはキーワード） |
| `projectId` | string | ✗ | 全プロジェクト | 検索対象のプロジェクトID |
| `fileTypes` | string[] | ✗ | 全ファイル | ファイルタイプフィルタ（例: `["ts", "py"]`） |
| `topK` | number | ✗ | `10` | 返す結果数（1-100） |
| `scoreThreshold` | number | ✗ | `0.5` | 最小類似度スコア閾値（0.0-1.0） |

**パラメータスキーマ（JSON Schema）:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "検索クエリ"
    },
    "projectId": {
      "type": "string",
      "description": "プロジェクトID"
    },
    "fileTypes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "ファイルタイプフィルタ"
    },
    "topK": {
      "type": "number",
      "minimum": 1,
      "maximum": 100,
      "default": 10,
      "description": "返す結果数"
    },
    "scoreThreshold": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "default": 0.5,
      "description": "最小類似度スコア閾値"
    }
  },
  "required": ["query"]
}
```

### レスポンス

**成功時:**
```json
{
  "results": [
    {
      "filePath": string,          // ファイルパス
      "snippet": string,           // コードスニペット
      "score": number,             // 類似度スコア（0.0-1.0）
      "language": string,          // 言語名
      "symbolType": string?,       // シンボルタイプ（function, class等）
      "symbolName": string?,       // シンボル名（関数、クラス等）
      "lineRange": [number, number], // 行番号範囲 [開始, 終了]
      "metadata": object?          // 追加メタデータ（オプション）
    }
  ],
  "totalFound": number,          // 総結果数
  "searchTimeMs": number         // 検索時間（ミリ秒）
}
```

**Rust構造体参照:** `src/tools/mod.rs::SearchCodeResponse`, `SearchResult`

**スコアリング:**
```
final_score = α × BM25_score + (1-α) × vector_similarity_score
where α = 0.3 (default)
```

### 使用例

**自然言語クエリ:**
```json
{
  "query": "HTTPリクエストを送信する関数",
  "topK": 5
}
```

**キーワードクエリ:**
```json
{
  "query": "async function fetchData",
  "fileTypes": ["ts", "js"],
  "topK": 10
}
```

**特定ファイルタイプのみ:**
```json
{
  "query": "データベース接続",
  "fileTypes": ["ts", "js"],
  "projectId": "my-project-id",
  "scoreThreshold": 0.7
}
```

### レスポンス例

```json
{
  "results": [
    {
      "filePath": "src/api/client.ts",
      "snippet": "async function sendRequest(url: string, options: RequestOptions): Promise<Response> {\n  const response = await fetch(url, options);\n  return response;\n}",
      "score": 0.92,
      "language": "typescript",
      "symbolType": "function",
      "symbolName": "sendRequest",
      "lineRange": [42, 45]
    }
  ],
  "totalFound": 15,
  "searchTimeMs": 234
}
```

---

## 3. get_symbol

### 説明

指定されたシンボル（関数、クラス、変数等）の定義箇所と参照箇所を取得します。

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `symbolName` | string | ✓ | - | シンボル名 |
| `symbolType` | string | ✗ | `"all"` | シンボルタイプ（`function`, `class`, `variable`, `interface`, `type`, `all`） |
| `projectId` | string | ✗ | 全プロジェクト | プロジェクトID |

**パラメータスキーマ（JSON Schema）:**
```json
{
  "type": "object",
  "properties": {
    "symbolName": {
      "type": "string",
      "description": "シンボル名"
    },
    "symbolType": {
      "type": "string",
      "enum": ["function", "class", "variable", "interface", "type", "all"],
      "default": "all",
      "description": "シンボルタイプ"
    },
    "projectId": {
      "type": "string",
      "description": "プロジェクトID"
    }
  },
  "required": ["symbolName"]
}
```

### レスポンス

```json
{
  "definitions": [
    {
      "filePath": string,
      "symbolName": string,
      "symbolType": string,
      "lineRange": [number, number],  // 行番号範囲
      "snippet": string,
      "isDefinition": true,
      "docstring": string?            // ドキュメント文字列（オプション）
    }
  ],
  "references": [
    {
      "filePath": string,
      "symbolName": string,
      "symbolType": string,
      "lineRange": [number, number],
      "snippet": string,
      "isDefinition": false,
      "docstring": string?
    }
  ],
  "totalCount": number               // 総数（定義+参照）
}
```

**Rust構造体参照:** `src/tools/mod.rs::GetSymbolResponse`, `SymbolLocation`

### 使用例

**関数の定義と参照を検索:**
```json
{
  "symbolName": "parseConfig",
  "symbolType": "function"
}
```

**クラスの定義のみ検索:**
```json
{
  "symbolName": "UserService",
  "symbolType": "class",
  "projectId": "my-project-id"
}
```

### レスポンス例

```json
{
  "definitions": [
    {
      "filePath": "src/utils/config.ts",
      "symbolName": "parseConfig",
      "symbolType": "function",
      "lineRange": [10, 25],
      "snippet": "export function parseConfig(path: string): Config {\n  // ...\n}",
      "isDefinition": true,
      "docstring": "設定ファイルを読み込んでパースします"
    }
  ],
  "references": [
    {
      "filePath": "src/main.ts",
      "symbolName": "parseConfig",
      "symbolType": "function",
      "lineRange": [15, 15],
      "snippet": "import { parseConfig } from './utils/config';",
      "isDefinition": false
    },
    {
      "filePath": "src/main.ts",
      "symbolName": "parseConfig",
      "symbolType": "function",
      "lineRange": [17, 17],
      "snippet": "const config = parseConfig('./config.json');",
      "isDefinition": false
    }
  ],
  "totalCount": 3
}
```

---

## 4. find_related_docs

### 説明

指定されたソースコードファイルまたはシンボルに関連するドキュメントを検索します。

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `filePath` | string | ✓ | - | ソースコードファイルパス |
| `symbolName` | string | ✗ | - | 特定のシンボル名（オプション） |
| `topK` | number | ✗ | `5` | 返す結果数 |

**パラメータスキーマ（JSON Schema）:**
```json
{
  "type": "object",
  "properties": {
    "filePath": {
      "type": "string",
      "description": "ソースコードファイルパス"
    },
    "symbolName": {
      "type": "string",
      "description": "特定のシンボル名"
    },
    "topK": {
      "type": "number",
      "minimum": 1,
      "maximum": 20,
      "default": 5,
      "description": "返す結果数"
    }
  },
  "required": ["filePath"]
}
```

### レスポンス

```json
{
  "documents": [
    {
      "filePath": string,        // ドキュメントファイルパス
      "title": string,           // ドキュメントタイトル/見出し
      "relevanceScore": number,  // 関連度スコア（0.0-1.0）
      "excerpt": string,         // 抜粋（関連箇所）
      "section": string?         // セクション名（オプション）
    }
  ],
  "totalFound": number
}
```

**Rust構造体参照:** `src/tools/mod.rs::FindRelatedDocsResponse`, `RelatedDocument`

### 使用例

**ファイル全体に関連するドキュメント:**
```json
{
  "filePath": "src/services/search.ts",
  "topK": 3
}
```

**特定シンボルに関連するドキュメント:**
```json
{
  "filePath": "src/services/search.ts",
  "symbolName": "searchCode",
  "topK": 5
}
```

### レスポンス例

```json
{
  "documents": [
    {
      "filePath": "docs/api/search.md",
      "title": "Search API",
      "relevanceScore": 0.88,
      "excerpt": "The search function accepts a query string and returns matching code snippets. It uses hybrid search combining BM25 and vector similarity.",
      "section": "API Reference"
    },
    {
      "filePath": "README.md",
      "title": "Features",
      "relevanceScore": 0.72,
      "excerpt": "Semantic code search powered by hybrid BM25 + vector search"
    }
  ],
  "totalFound": 2
}
```

---

## 5. get_index_status

### 説明

インデックスの状況を取得します。プロジェクトごとのインデックス統計、最終更新日時、エラー情報等を提供します。

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `projectId` | string | ✗ | 全プロジェクト | プロジェクトID（省略時は全プロジェクト） |

**パラメータスキーマ（JSON Schema）:**
```json
{
  "type": "object",
  "properties": {
    "projectId": {
      "type": "string",
      "description": "プロジェクトID"
    }
  }
}
```

### レスポンス

```json
{
  "projects": [
    {
      "projectId": string,
      "rootPath": string,
      "status": string,              // "indexed", "indexing", "error"
      "lastIndexedAt": string?,      // ISO 8601 timestamp（オプション）
      "stats": {
        "totalFiles": number,
        "codeFiles": number,
        "documentFiles": number,
        "totalSymbols": number,
        "totalVectors": number,
        "indexSizeBytes": number
      }
    }
  ],
  "overallStats": {
    "totalFiles": number,
    "codeFiles": number,
    "documentFiles": number,
    "totalSymbols": number,
    "totalVectors": number,
    "indexSizeBytes": number
  }
}
```

**Rust構造体参照:** `src/tools/mod.rs::GetIndexStatusResponse`, `ProjectIndexStatus`, `IndexStatistics`

**注意:** `vectorStoreBackend`と`embeddingModel`の情報は設定ファイルまたは別途取得が必要です。

### 使用例

**全プロジェクトの状況:**
```json
{}
```

**特定プロジェクトの状況:**
```json
{
  "projectId": "my-project-id"
}
```

### レスポンス例

```json
{
  "projects": [
    {
      "projectId": "abc123",
      "rootPath": "/path/to/my-project",
      "status": "indexed",
      "lastIndexedAt": "2025-11-03T10:30:00Z",
      "stats": {
        "totalFiles": 1523,
        "codeFiles": 1478,
        "documentFiles": 45,
        "totalSymbols": 5678,
        "totalVectors": 6234,
        "indexSizeBytes": 104857600
      }
    }
  ],
  "overallStats": {
    "totalFiles": 1523,
    "codeFiles": 1478,
    "documentFiles": 45,
    "totalSymbols": 5678,
    "totalVectors": 6234,
    "indexSizeBytes": 104857600
  }
}
```

---

## 6. clear_index

### 説明

指定されたプロジェクトのインデックスをクリアします。ベクターストアとローカルインデックスからすべてのデータを削除します。

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|-----------|------|
| `projectId` | string | ✓ | - | クリア対象のプロジェクトID |
| `confirm` | boolean | ✗ | `false` | 確認フラグ（安全のため） |

**パラメータスキーマ（JSON Schema）:**
```json
{
  "type": "object",
  "properties": {
    "projectId": {
      "type": "string",
      "description": "クリア対象のプロジェクトID"
    },
    "confirm": {
      "type": "boolean",
      "description": "確認フラグ",
      "default": false
    }
  },
  "required": ["projectId"]
}
```

### レスポンス

```json
{
  "success": boolean,
  "projectsCleared": number,     // クリアされたプロジェクト数
  "vectorsDeleted": number,      // 削除されたベクトル数
  "message": string              // ステータスメッセージ
}
```

**Rust構造体参照:** `src/tools/mod.rs::ClearIndexResponse`

### 使用例

**インデックスをクリア（確認あり）:**
```json
{
  "projectId": "my-project-id",
  "confirm": true
}
```

### レスポンス例

```json
{
  "success": true,
  "projectsCleared": 1,
  "vectorsDeleted": 6234,
  "message": "Project index cleared successfully"
}
```

---

## エラーハンドリング

### エラーレスポンス形式

すべてのツールは、エラー発生時にMCPプロトコル標準のエラーレスポンスを返します:

```json
{
  "code": number,              // MCP ErrorCode
  "message": string,           // エラーメッセージ
  "data": object?              // 追加情報（オプション）
}
```

**Rust実装参照:** `src/error.rs::ContextMcpError` → `rmcp::ErrorData`への変換

### 主なエラーコードとContextMcpErrorマッピング

| MCP ErrorCode | ContextMcpError | 説明 | 対処方法 |
|--------------|----------------|------|---------|
| `INVALID_PARAMS` | `Config` | 設定・パラメータが不正 | パラメータまたは設定を確認 |
| `PARSE_ERROR` | `Parse` | JSON/AST解析エラー | ファイルの構文を確認 |
| `INTERNAL_ERROR` | `Mcp` | MCPプロトコルエラー | サーバーログを確認 |
| `INTERNAL_ERROR` | `Database` | ベクターストア/SQLiteエラー | 接続状況とデータベースステータスを確認 |
| `INTERNAL_ERROR` | `Embedding` | 埋め込み生成エラー | モデルファイルとONNXランタイムを確認 |
| `INTERNAL_ERROR` | `Indexing` | インデックス化エラー | ディスク容量とファイルパーミッションを確認 |
| `INTERNAL_ERROR` | `Search` | 検索エラー | インデックスの健全性を確認 |
| `INTERNAL_ERROR` | `TreeSitter` | Tree-sitterパースエラー | ソースコードの構文を確認 |
| `INTERNAL_ERROR` | `FileSystem` | ファイルシステムエラー | ファイルパスとパーミッションを確認 |
| `INTERNAL_ERROR` | `Io` | I/Oエラー | ディスクとファイルアクセスを確認 |
| `INTERNAL_ERROR` | `Internal` | 内部エラー | サーバーログを確認 |

**注意:** Rust実装では、ほとんどのエラーが`INTERNAL_ERROR`にマッピングされます。詳細なエラー種別は`message`フィールドで判別できます。

---

## パフォーマンス考慮事項

### レスポンス時間の目安

| ツール | 平均レスポンス時間 | 要因 |
|-------|------------------|------|
| `index_project` | 10秒 - 10分 | ファイル数、プロジェクト規模 |
| `search_code` | 100-500ms | インデックスサイズ、クエリ複雑度 |
| `get_symbol` | 50-200ms | シンボル参照数 |
| `find_related_docs` | 100-300ms | ドキュメント数 |
| `get_index_status` | 10-50ms | プロジェクト数 |
| `clear_index` | 100-1000ms | インデックスサイズ |

### 最適化のヒント

1. **`search_code`**:
   - `topK`を必要最小限に（10-20推奨）
   - `scoreThreshold`で低スコア結果を除外（0.5-0.7推奨）
2. **`index_project`**: 大規模プロジェクトは`excludePatterns`で不要なファイルを除外
3. **`find_related_docs`**: `symbolName`を指定すると精度向上
4. **フィルタリング**: `fileTypes`で検索範囲を絞る

### 技術仕様

- **埋め込みモデル**: all-MiniLM-L6-v2（ONNXランタイム使用）
- **ベクターストア**: Milvus standalone（デフォルト）
- **全文検索**: BM25（SQLite実装）

---

## 関連ドキュメント

- [アーキテクチャドキュメント](./ARCHITECTURE.md)
- [セットアップガイド](./SETUP.md)
- [設定リファレンス](./CONFIGURATION.md)
- [トラブルシューティング](./TROUBLESHOOTING.md)
