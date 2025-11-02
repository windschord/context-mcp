# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

LSP-MCPは、Tree-sitterによるAST解析とベクターDBを組み合わせた、Claude Code向けのModel Context Protocol (MCP)プラグインです。ソースコードとドキュメントを統合的に解析し、セマンティック検索を提供します。

**目標**:
- コンテキストトークン使用量を30-40%削減
- ハイブリッド検索（BM25 + Vector）による高精度な検索
- プライバシーファーストのローカル完結実行（デフォルト）
- 多言語対応（TypeScript/JS, Python, Go, Rust, Java, C/C++/Arduino）

## アーキテクチャの重要ポイント

### レイヤー構成
1. **MCP Server Layer**: Claude Codeとの通信（MCP Protocol準拠）
2. **Service Layer**: Indexing Service（インデックス化）、Search Service（検索）
3. **Parser Layer**: AST Parser（Tree-sitter）、Document Parser（Markdown）
4. **Storage Layer**: Vector Store（Milvus/Chroma）、Local Index（SQLite BM25）

### プライバシーファースト設計
- **デフォルト**: ローカル埋め込みモデル（Transformers.js）+ ローカルベクターDB（Milvus standalone/Chroma）
- **オプション**: クラウドモード（OpenAI API + Zilliz Cloud等）
- 設定ファイル`.lsp-mcp.json`の`mode`フィールドで切り替え可能

### ハイブリッド検索
```
score = α * BM25_score + (1-α) * vector_similarity_score
where α = 0.3 (デフォルト)
```

## 開発コマンド

### 環境セットアップ
```bash
# 依存関係のインストール
npm install

# TypeScriptのビルド
npm run build

# Milvus standalone起動（Docker Compose）
docker-compose -f milvus-standalone-docker-compose.yml up -d

# Milvus停止
docker-compose -f milvus-standalone-docker-compose.yml down
```

### テスト実行
```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジレポート
npm run test:coverage

# 特定のテストファイルのみ実行
npm test -- path/to/test-file.test.ts
```

### 開発・ビルド
```bash
# TypeScript型チェック
npm run typecheck

# Lint実行
npm run lint

# Lint自動修正
npm run lint:fix

# フォーマット
npm run format

# 開発モード（ウォッチ）
npm run dev
```

## MCPツール仕様

実装すべきMCPツール（`docs/design.md`参照）:

### 1. `index_project`
プロジェクト全体をインデックス化
- パラメータ: `rootPath`, `languages`, `excludePatterns`, `includeDocuments`
- レスポンス: 処理統計（totalFiles, processingTime等）

### 2. `search_code`
セマンティックコード検索（ハイブリッド検索）
- パラメータ: `query`, `projectId`, `fileTypes`, `topK`
- レスポンス: 検索結果配列（filePath, snippet, score, metadata等）

### 3. `get_symbol`
シンボル定義・参照の検索
- パラメータ: `symbolName`, `symbolType`
- レスポンス: 定義箇所と参照箇所のリスト

### 4. `find_related_docs`
コードに関連するドキュメントを検索
- パラメータ: `filePath`, `symbolName`
- レスポンス: 関連度スコア付きドキュメントリスト

### 5. `get_index_status`, `clear_index`
インデックス管理

## Tree-sitter統合

### 対応言語と特別な扱い

**Arduino/PlatformIO対応**:
- `.ino`ファイル: Arduinoスケッチとして認識、`setup()`/`loop()`関数を特別扱い
- `platformio.ini`: プロジェクト設定ファイルとして解析
- 標準C/C++パーサーを基盤に使用

### クエリ例（関数定義抽出）
```typescript
// Python
(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body
)

// C/C++/Arduino
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @function.name
    parameters: (parameter_list) @function.params)
  body: (compound_statement) @function.body
)

// Arduino特別関数
(#match? @arduino.function "^(setup|loop)$")
```

## データベーススキーマ

### Vector DB（Milvus/Chroma）: code_vectors
主要フィールド:
- `id`: 一意識別子（ファイルパス:行番号）
- `vector`: 埋め込みベクトル
- `file_path`, `language`, `type`, `name`
- `line_start`, `line_end`, `snippet`, `docstring`
- `metadata`: 追加メタデータ（JSON）

### Local Index（SQLite）: inverted_index
BM25全文検索用の転置インデックス:
```sql
CREATE TABLE inverted_index (
  term TEXT NOT NULL,
  document_id TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  positions TEXT, -- JSON array
  PRIMARY KEY (term, document_id)
);
```

## 設定ファイル `.lsp-mcp.json`

### ローカルモード設定例（デフォルト）
```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530",
      "standalone": true,
      "dataPath": "./volumes"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "local": true
  },
  "privacy": {
    "blockExternalCalls": true
  }
}
```

### 軽量ローカルモード（Docker不要）
```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "chroma",
    "config": {
      "path": "./.lsp-mcp/chroma"
    }
  }
}
```

### クラウドモード
```json
{
  "mode": "cloud",
  "vectorStore": {
    "backend": "zilliz",
    "config": {
      "address": "your-instance.zilliz.com:19530",
      "token": "${ZILLIZ_TOKEN}"
    }
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

## 実装の優先順位

実装フェーズ（`docs/tasks.md`参照）:
1. **フェーズ1**: プロジェクトセットアップとMCPサーバー基盤
2. **フェーズ2**: AST解析とドキュメント解析
3. **フェーズ3**: ベクターDB統合と検索機能
4. **フェーズ4**: Indexing ServiceとMCPツール実装
5. **フェーズ5**: インクリメンタル更新とファイル監視
6. **フェーズ6**: テストとドキュメント化
7. **フェーズ7**: 最適化とリリース準備

## 技術スタック

- **言語**: TypeScript（strict mode）
- **ランタイム**: Node.js 18+
- **AST解析**: Tree-sitter
- **ベクターDB（デフォルト）**: Milvus standalone（Docker）またはChroma（Docker不要）
- **ベクターDB（クラウド）**: Zilliz Cloud、Qdrant Cloud
- **埋め込み（デフォルト）**: Transformers.js（ローカル）
- **埋め込み（クラウド）**: OpenAI API、VoyageAI API
- **全文検索**: BM25（自前実装、SQLite）
- **ファイル監視**: chokidar
- **テスト**: Jest
- **ビルド**: TypeScript Compiler

## 非機能要件

### 性能要件
- インデックス化: 10,000ファイル/5分以内（ローカルモードは10分以内）
- 検索レスポンス: 2秒以内
- メモリ使用量: 2GB以内
- インクリメンタル更新: 1ファイル/100ms以内

### セキュリティ要件
- センシティブファイル（.env, credentials等）の自動除外
- APIキーの暗号化保存（OS標準キーチェーン使用）
- TLS/SSL必須（ベクターDB、埋め込みAPI通信）

### プライバシー要件
- ローカルモード時の外部通信ゼロ
- ユーザーコードを外部サーバーに送信しない
- インターネット接続なしでも基本機能が動作

## インスパイア元

本プロジェクトは[Claude Context](https://github.com/zilliztech/claude-context)（Zilliz開発）から大きなインスパイアを受けています。Claude Contextのハイブリッド検索アプローチを基盤に、AST解析の深化、ドキュメント統合の強化、ローカルファースト設計を追加しています。

## 開発時の注意点

1. **エラー耐性**: 単一ファイルの解析エラーで全体を停止しない
2. **プラグイン設計**: 新しいベクターDBや言語パーサーを簡単に追加可能に
3. **プライバシー優先**: デフォルトは常にローカルモード
4. **インクリメンタル更新**: ファイル変更時は該当ファイルのみ再インデックス化
5. **デバウンス処理**: 短時間の連続編集は500ms後に更新
