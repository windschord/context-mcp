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
```typescript
{
  success: true,
  projectId: string,           // プロジェクトの一意識別子
  stats: {
    totalFiles: number,        // スキャンされた総ファイル数
    processedFiles: number,    // 正常に処理されたファイル数
    failedFiles: number,       // 失敗したファイル数
    totalSymbols: number,      // 抽出されたシンボル数
    totalVectors: number,      // 生成されたベクトル数
    processingTime: number     // 処理時間（ミリ秒）
  },
  errors?: Array<{             // エラーがあった場合
    file: string,
    error: string
  }>
}
```

**エラー時:**
```typescript
{
  success: false,
  error: {
    code: string,
    message: string,
    suggestion?: string
  }
}
```

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
| `fileTypes` | string[] | ✗ | 全ファイル | ファイルタイプフィルタ（例: `[".ts", ".py"]`） |
| `languages` | string[] | ✗ | 全言語 | 言語フィルタ（例: `["TypeScript", "Python"]`） |
| `topK` | number | ✗ | `10` | 返す結果数（1-100） |

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
    "languages": {
      "type": "array",
      "items": { "type": "string" },
      "description": "言語フィルタ"
    },
    "topK": {
      "type": "number",
      "minimum": 1,
      "maximum": 100,
      "default": 10,
      "description": "返す結果数"
    }
  },
  "required": ["query"]
}
```

### レスポンス

**成功時:**
```typescript
{
  results: Array<{
    filePath: string,          // ファイルパス
    language: string,          // 言語名
    snippet: string,           // コードスニペット（前後3行含む）
    score: number,             // ハイブリッドスコア（0-1）
    lineStart: number,         // 開始行番号
    lineEnd: number,           // 終了行番号
    symbolName?: string,       // シンボル名（関数、クラス等）
    symbolType?: string,       // シンボルタイプ（function, class等）
    metadata?: Record<string, any>  // 追加メタデータ
  }>,
  totalResults: number,        // 総結果数
  searchTime: number           // 検索時間（ミリ秒）
}
```

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
  "languages": ["TypeScript", "JavaScript"],
  "topK": 10
}
```

**特定ファイルタイプのみ:**
```json
{
  "query": "データベース接続",
  "fileTypes": [".ts", ".js"],
  "projectId": "my-project-id"
}
```

### レスポンス例

```json
{
  "results": [
    {
      "filePath": "src/api/client.ts",
      "language": "TypeScript",
      "snippet": "async function sendRequest(url: string, options: RequestOptions): Promise<Response> {\n  const response = await fetch(url, options);\n  return response;\n}",
      "score": 0.92,
      "lineStart": 42,
      "lineEnd": 45,
      "symbolName": "sendRequest",
      "symbolType": "function",
      "metadata": {
        "parameters": ["url", "options"],
        "returnType": "Promise<Response>",
        "docstring": "HTTPリクエストを送信します"
      }
    }
  ],
  "totalResults": 15,
  "searchTime": 234
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

```typescript
{
  definitions: Array<{
    filePath: string,
    language: string,
    lineStart: number,
    lineEnd: number,
    snippet: string,
    scope: string,             // "module", "class", "function"
    metadata?: Record<string, any>
  }>,
  references: Array<{
    filePath: string,
    lineNumber: number,
    context: string,           // 参照箇所の前後のコンテキスト
    usage: string              // 使用方法（例: "call", "import"）
  }>,
  totalDefinitions: number,
  totalReferences: number
}
```

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
      "language": "TypeScript",
      "lineStart": 10,
      "lineEnd": 25,
      "snippet": "export function parseConfig(path: string): Config {\n  // ...\n}",
      "scope": "module",
      "metadata": {
        "parameters": ["path"],
        "returnType": "Config",
        "docstring": "設定ファイルを読み込んでパースします"
      }
    }
  ],
  "references": [
    {
      "filePath": "src/main.ts",
      "lineNumber": 15,
      "context": "import { parseConfig } from './utils/config';\n\nconst config = parseConfig('./config.json');",
      "usage": "import"
    },
    {
      "filePath": "src/main.ts",
      "lineNumber": 17,
      "context": "const config = parseConfig('./config.json');",
      "usage": "call"
    }
  ],
  "totalDefinitions": 1,
  "totalReferences": 2
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

```typescript
{
  relatedDocs: Array<{
    docPath: string,           // ドキュメントファイルパス
    section: string,           // 関連セクション（見出し）
    relevance: number,         // 関連度スコア（0-1）
    excerpts: string[],        // 抜粋（関連箇所）
    codeReferences: Array<{    // コード参照
      lineNumber: number,
      snippet: string
    }>
  }>,
  totalDocs: number,
  searchTime: number
}
```

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
  "relatedDocs": [
    {
      "docPath": "docs/api/search.md",
      "section": "## Search API",
      "relevance": 0.88,
      "excerpts": [
        "The search function accepts a query string and returns matching code snippets.",
        "It uses hybrid search combining BM25 and vector similarity."
      ],
      "codeReferences": [
        {
          "lineNumber": 45,
          "snippet": "```typescript\nawait search('find function');\n```"
        }
      ]
    },
    {
      "docPath": "README.md",
      "section": "## Features",
      "relevance": 0.72,
      "excerpts": [
        "Semantic code search powered by hybrid BM25 + vector search"
      ],
      "codeReferences": []
    }
  ],
  "totalDocs": 2,
  "searchTime": 156
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

```typescript
{
  projects: Array<{
    projectId: string,
    rootPath: string,
    status: "indexed" | "indexing" | "error",
    lastIndexed: string,       // ISO 8601 timestamp
    stats: {
      totalFiles: number,
      totalSymbols: number,
      totalVectors: number,
      totalDocuments: number
    },
    errors?: Array<{
      file: string,
      error: string,
      timestamp: string
    }>
  }>,
  totalProjects: number,
  vectorStoreBackend: string,  // "milvus", "chroma" etc.
  embeddingModel: string       // "Xenova/all-MiniLM-L6-v2" etc.
}
```

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
      "lastIndexed": "2025-11-03T10:30:00Z",
      "stats": {
        "totalFiles": 1523,
        "totalSymbols": 5678,
        "totalVectors": 6234,
        "totalDocuments": 45
      }
    }
  ],
  "totalProjects": 1,
  "vectorStoreBackend": "milvus",
  "embeddingModel": "Xenova/all-MiniLM-L6-v2"
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

```typescript
{
  success: boolean,
  projectId: string,
  deletedVectors: number,
  deletedDocuments: number,
  message: string
}
```

### 使用例

**インデックスをクリア（確認あり）:**
```json
{
  "projectId": "my-project-id",
  "confirm": true
}
```

### レスポンス例

**成功時:**
```json
{
  "success": true,
  "projectId": "my-project-id",
  "deletedVectors": 6234,
  "deletedDocuments": 1523,
  "message": "Project index cleared successfully"
}
```

**確認不足時:**
```json
{
  "success": false,
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "Please set confirm=true to clear index",
    "suggestion": "Add 'confirm: true' to the request"
  }
}
```

---

## エラーハンドリング

### エラーレスポンス形式

すべてのツールは、エラー発生時に以下の形式でレスポンスを返します:

```typescript
{
  success: false,
  error: {
    code: string,              // エラーコード
    message: string,           // エラーメッセージ
    details?: any,             // 詳細情報（オプション）
    suggestion?: string,       // 対処方法の提案（オプション）
    recoverable: boolean       // リカバリー可能か
  }
}
```

### 主なエラーコード

| エラーコード | 説明 | 対処方法 |
|-------------|------|---------|
| `INVALID_PARAMS` | パラメータが不正 | パラメータを確認 |
| `PROJECT_NOT_FOUND` | プロジェクトが見つからない | `index_project`を先に実行 |
| `FILE_NOT_FOUND` | ファイルが見つからない | ファイルパスを確認 |
| `PARSE_ERROR` | パースエラー | ファイルの構文を確認 |
| `VECTOR_STORE_ERROR` | ベクターストアエラー | 接続状況を確認 |
| `EMBEDDING_ERROR` | 埋め込み生成エラー | 設定とAPIキーを確認 |
| `TIMEOUT` | タイムアウト | 再試行またはtopKを削減 |
| `CONFIRMATION_REQUIRED` | 確認が必要 | `confirm: true`を追加 |

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

1. **`search_code`**: `topK`を必要最小限に（10-20推奨）
2. **`index_project`**: 大規模プロジェクトは`excludePatterns`で不要なファイルを除外
3. **`find_related_docs`**: `symbolName`を指定すると精度向上
4. **フィルタリング**: `languages`や`fileTypes`で検索範囲を絞る

---

## 関連ドキュメント

- [アーキテクチャドキュメント](./ARCHITECTURE.md)
- [セットアップガイド](./SETUP.md)
- [設定リファレンス](./CONFIGURATION.md)
- [トラブルシューティング](./TROUBLESHOOTING.md)
