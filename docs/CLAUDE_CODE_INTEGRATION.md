# Claude Code統合ガイド

このガイドでは、LSP-MCPをClaude Codeと統合する手順を説明します。

## 目次

- [前提条件](#前提条件)
- [インストール手順](#インストール手順)
- [MCP設定ファイルの設定](#mcp設定ファイルの設定)
- [動作確認](#動作確認)
- [統合チェックリスト](#統合チェックリスト)
- [各MCPツールの使用例](#各mcpツールの使用例)
- [トラブルシューティング](#トラブルシューティング)

## 前提条件

- Node.js 18.0以上
- npm 9.0以上
- Claude Code（最新版）
- Docker & Docker Compose（Milvusを使用する場合）

## インストール手順

### 1. LSP-MCPのビルド

```bash
cd /path/to/lsp-mcp
npm install
npm run build
```

ビルドが成功すると、`dist`ディレクトリにコンパイルされたファイルが生成されます。

### 2. 実行可能性の確認

```bash
node dist/index.js --version
```

バージョン情報が表示されれば、ビルドは正常に完了しています。

## MCP設定ファイルの設定

Claude CodeのMCP設定ファイルにLSP-MCPを登録します。

### 設定ファイルの場所

- **macOS/Linux**: `~/.config/claude/mcp_settings.json`
- **Windows**: `%APPDATA%\Claude\mcp_settings.json`

### 設定例

以下の内容を`mcp_settings.json`に追加します。

#### ローカルモード（Transformers.js + Milvus standalone）- npx使用（推奨）

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["-y", "lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### 軽量ローカルモード（Transformers.js + Chroma、Docker不要）- npx使用（推奨）

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["-y", "lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LSP_MCP_VECTOR_BACKEND": "chroma",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### クラウドモード（OpenAI + Zilliz Cloud）- npx使用（推奨）

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["-y", "lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "cloud",
        "LSP_MCP_VECTOR_BACKEND": "zilliz",
        "OPENAI_API_KEY": "your-openai-api-key",
        "ZILLIZ_ENDPOINT": "your-instance.zilliz.com:19530",
        "ZILLIZ_TOKEN": "your-zilliz-token",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### 環境変数の説明

| 環境変数 | 説明 | デフォルト値 |
|---------|-----|-------------|
| `LSP_MCP_MODE` | 動作モード（`local` または `cloud`） | `local` |
| `LSP_MCP_VECTOR_STORE` | ベクターDB（`milvus`, `chroma`, `zilliz`） | `milvus` |
| `OPENAI_API_KEY` | OpenAI APIキー（クラウドモード時） | - |
| `ZILLIZ_ENDPOINT` | Zilliz Cloudエンドポイント | - |
| `ZILLIZ_TOKEN` | Zilliz Cloudトークン | - |

## 動作確認

### 1. Claude Codeを再起動

MCP設定ファイルを更新したら、Claude Codeを完全に終了して再起動します。

### 2. MCPツールの確認

Claude Codeのツールパレットから、LSP-MCPのツールが利用可能か確認します。
以下のツールが表示されるはずです:

- `index_project` - プロジェクトのインデックス化
- `search_code` - セマンティックコード検索
- `get_symbol` - シンボル定義・参照の検索
- `find_related_docs` - 関連ドキュメントの検索
- `get_index_status` - インデックス状態の確認
- `clear_index` - インデックスのクリア

### 3. 簡単な動作テスト

Claude Codeで以下のように質問してみます:

```
このプロジェクトをインデックス化してください
```

LSP-MCPが正常に動作していれば、`index_project`ツールが呼び出され、
プロジェクトのファイルが解析されてインデックス化されます。

## 統合チェックリスト

LSP-MCPとClaude Codeの統合が正常に完了したかを確認するためのチェックリストです。
各項目を順番に確認してください。

### ✅ インストールと設定

- [ ] **Node.js 18+がインストールされている**
  ```bash
  node --version  # v18.0.0以上が表示される
  ```

- [ ] **LSP-MCPがビルドできる**
  ```bash
  cd /path/to/lsp-mcp
  npm run build
  # エラーなく完了する
  ```

- [ ] **MCP設定ファイルが正しく配置されている**
  - macOS/Linux: `~/.config/claude/mcp_settings.json`
  - Windows: `%APPDATA%\Claude\mcp_settings.json`

- [ ] **MCP設定ファイルにlsp-mcpの設定が追加されている**
  ```json
  {
    "mcpServers": {
      "lsp-mcp": { ... }
    }
  }
  ```

- [ ] **実行ファイルのパスが絶対パスである**
  - 相対パスは使用しない
  - `~/`は展開する（例: `/Users/username/...`）

### ✅ モード別の設定確認

#### ローカルモード（Milvus使用時）

- [ ] **Docker & Docker Composeがインストールされている**
  ```bash
  docker --version
  docker-compose --version
  ```

- [ ] **Milvus standaloneが起動している**
  ```bash
  docker-compose -f milvus-standalone-docker-compose.yml up -d
  docker ps | grep milvus  # milvusコンテナが表示される
  ```

- [ ] **ポート19530が空いている**
  ```bash
  lsof -i :19530  # 使用中でないか確認
  ```

#### 軽量ローカルモード（Chroma使用時）

- [ ] **環境変数が設定されている**
  ```json
  "env": {
    "LSP_MCP_VECTOR_STORE": "chroma"
  }
  ```

- [ ] **Chromaデータディレクトリが作成可能**
  - デフォルト: `./.lsp-mcp/chroma`
  - 書き込み権限がある

#### クラウドモード

- [ ] **APIキーが設定されている**
  ```json
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "ZILLIZ_ENDPOINT": "...",
    "ZILLIZ_TOKEN": "..."
  }
  ```

- [ ] **インターネット接続がある**
  ```bash
  curl -I https://api.openai.com  # 接続確認
  ```

### ✅ Claude Code統合確認

- [ ] **Claude Codeを再起動した**
  - 設定変更後は必ず完全に終了して再起動

- [ ] **MCPツールが表示される**
  - Claude Codeのツールパレットを確認
  - 6つのツールが表示される:
    - `index_project`
    - `search_code`
    - `get_symbol`
    - `find_related_docs`
    - `get_index_status`
    - `clear_index`

- [ ] **MCPサーバーのログが確認できる**
  ```bash
  # ログファイルの場所（例）
  tail -f ~/.config/claude/logs/mcp-lsp-mcp.log
  ```

### ✅ 機能テスト

#### テスト1: プロジェクトのインデックス化

- [ ] **小規模プロジェクトでインデックス化が成功する**
  - Claude Codeで「このプロジェクトをインデックス化してください」と依頼
  - エラーなく完了する
  - 統計情報が表示される（ファイル数、シンボル数等）

#### テスト2: コード検索

- [ ] **簡単な検索クエリが機能する**
  - 例: 「関数を検索してください」
  - 検索結果が返される
  - ファイルパスとコードスニペットが含まれる

#### テスト3: シンボル検索

- [ ] **特定のシンボルを見つけられる**
  - 例: 「mainクラスの定義を見つけてください」
  - 定義箇所が表示される
  - 行番号が正確

#### テスト4: ドキュメント検索

- [ ] **関連ドキュメントが検索できる**
  - 例: 「README.mdに関連するコードを探してください」
  - 関連度スコア付きで結果が返される

#### テスト5: インデックス状態確認

- [ ] **インデックス状態が取得できる**
  - 例: 「インデックスの状態を教えてください」
  - ベクトル数、次元数、サイズが表示される

#### テスト6: インデックスクリア

- [ ] **インデックスがクリアできる**
  - 例: 「インデックスをクリアしてください」
  - 成功メッセージが表示される
  - 再度状態確認すると空になっている

### ✅ パフォーマンステスト

- [ ] **中規模プロジェクト（100ファイル程度）でテスト**
  - インデックス化時間が妥当（5分以内）
  - メモリ使用量が妥当（2GB以内）
  - 検索レスポンスが高速（2秒以内）

- [ ] **インクリメンタル更新が機能する**
  - ファイルを編集
  - Claude Codeで「更新されたファイルを再インデックス化してください」と依頼
  - 差分更新が高速（数秒）

### ✅ エラーハンドリング

- [ ] **存在しないファイルを検索してもエラーにならない**
  - 適切なエラーメッセージが表示される

- [ ] **無効なクエリでも適切に処理される**
  - エラーメッセージが明確
  - Claude Codeがクラッシュしない

- [ ] **ベクターDB接続エラー時に適切なメッセージが表示される**
  - Milvusが停止している状態でテスト
  - エラーメッセージが具体的

### ✅ ドキュメントとサポート

- [ ] **README.mdを読んだ**
  - 基本的な使い方を理解

- [ ] **SETUP.mdを読んだ**
  - セットアップ手順を理解

- [ ] **TROUBLESHOOTING.mdを読んだ**
  - よくある問題の解決方法を把握

## 各MCPツールの使用例

### 1. index_project - プロジェクトのインデックス化

**使用例:**

```
現在のプロジェクト全体をインデックス化してください。
TypeScriptとPythonファイルを含めて、node_modulesは除外してください。
```

**パラメータ:**
- `rootPath`: プロジェクトのルートパス（必須）
- `languages`: 対象言語の配列（オプション、デフォルト: すべて）
- `excludePatterns`: 除外パターンの配列（オプション）
- `includeDocuments`: ドキュメントも含めるか（オプション、デフォルト: true）

**レスポンス例:**

```json
{
  "success": true,
  "stats": {
    "totalFiles": 245,
    "totalSymbols": 1823,
    "totalDocuments": 12,
    "processingTime": 45.3
  }
}
```

### 2. search_code - セマンティックコード検索

**使用例:**

```
「ファイルをアップロードする関数」を検索してください
```

**パラメータ:**
- `query`: 検索クエリ（必須）
- `projectId`: プロジェクトID（オプション）
- `fileTypes`: ファイルタイプフィルター（オプション）
- `topK`: 結果の最大数（オプション、デフォルト: 10）

**レスポンス例:**

```json
{
  "results": [
    {
      "filePath": "src/services/upload-service.ts",
      "snippet": "async function uploadFile(file: File): Promise<UploadResult> {...}",
      "score": 0.92,
      "metadata": {
        "language": "TypeScript",
        "symbolType": "function",
        "lineStart": 45,
        "lineEnd": 68
      }
    }
  ]
}
```

### 3. get_symbol - シンボル検索

**使用例:**

```
「FileScanner」クラスの定義を見つけてください
```

**パラメータ:**
- `symbolName`: シンボル名（必須）
- `symbolType`: シンボルタイプ（オプション: `function`, `class`, `variable`等）

**レスポンス例:**

```json
{
  "definitions": [
    {
      "filePath": "src/scanner/file-scanner.ts",
      "line": 23,
      "symbolType": "class",
      "scope": "module"
    }
  ],
  "references": [
    {
      "filePath": "src/services/indexing-service.ts",
      "line": 89
    }
  ]
}
```

### 4. find_related_docs - 関連ドキュメント検索

**使用例:**

```
「src/parser/ast-engine.ts」に関連するドキュメントを探してください
```

**パラメータ:**
- `filePath`: ファイルパス（必須、ファイルまたはシンボルのどちらか）
- `symbolName`: シンボル名（オプション）

**レスポンス例:**

```json
{
  "relatedDocuments": [
    {
      "filePath": "docs/ARCHITECTURE.md",
      "score": 0.87,
      "sections": ["Parser Layer", "AST Engine"]
    },
    {
      "filePath": "README.md",
      "score": 0.65,
      "sections": ["Tree-sitter統合"]
    }
  ]
}
```

### 5. get_index_status - インデックス状態確認

**使用例:**

```
現在のインデックス状態を教えてください
```

**レスポンス例:**

```json
{
  "status": "ready",
  "vectorCount": 1823,
  "dimension": 384,
  "indexSize": 2895360,
  "lastIndexedAt": "2025-11-03T08:30:15Z"
}
```

### 6. clear_index - インデックスクリア

**使用例:**

```
インデックスをクリアしてください
```

**レスポンス例:**

```json
{
  "success": true,
  "message": "Index cleared successfully"
}
```

## トラブルシューティング

### MCPツールが表示されない

**原因:**
- MCP設定ファイルのパスが間違っている
- Claude Codeが再起動されていない
- ビルドエラーがある

**解決方法:**

1. 設定ファイルのパスを確認:
   ```bash
   cat ~/.config/claude/mcp_settings.json
   ```

2. パスが絶対パスであることを確認:
   ```json
   "args": ["/Users/username/path/to/lsp-mcp/dist/index.js"]
   ```

3. ビルドエラーを確認:
   ```bash
   cd /path/to/lsp-mcp
   npm run build
   ```

4. Claude Codeを完全に終了して再起動

### インデックス化が失敗する

**原因:**
- ベクターDBが起動していない（Milvus使用時）
- メモリ不足
- APIキーが無効（クラウドモード時）

**解決方法:**

1. Milvus standaloneを起動:
   ```bash
   cd /path/to/lsp-mcp
   docker-compose -f milvus-standalone-docker-compose.yml up -d
   ```

2. Chromaを使用する（Docker不要）:
   ```bash
   export LSP_MCP_VECTOR_STORE=chroma
   ```

3. ログを確認:
   ```bash
   # Claude Codeのログを確認
   tail -f ~/.config/claude/logs/mcp-lsp-mcp.log
   ```

### 検索結果が不正確

**原因:**
- インデックスが古い
- 検索クエリが曖昧
- ハイブリッド検索の重み付けが適切でない

**解決方法:**

1. インデックスを再作成:
   ```
   Claude Codeで「インデックスをクリアして再作成してください」と依頼
   ```

2. より具体的なクエリを使用:
   ```
   「ファイルをアップロードする」→「FormDataを使ってファイルをPOSTする非同期関数」
   ```

3. 設定ファイルで検索パラメータを調整:
   ```json
   {
     "search": {
       "hybridAlpha": 0.3,
       "topK": 20
     }
   }
   ```

### パフォーマンスが遅い

**原因:**
- ローカル埋め込みモデルの初回ロード
- 大規模プロジェクト
- ディスクI/Oの遅延

**解決方法:**

1. クラウドモードを使用（高速な埋め込み生成）:
   ```bash
   export LSP_MCP_MODE=cloud
   export OPENAI_API_KEY=your-key
   ```

2. インクリメンタル更新を活用（初回インデックス化後は高速）

3. 除外パターンを使ってファイル数を削減:
   ```
   「node_modules、dist、buildディレクトリを除外してインデックス化してください」
   ```

### Milvus接続エラー

**原因:**
- Dockerコンテナが起動していない
- ポート19530が使用中
- ネットワーク設定の問題

**解決方法:**

1. Milvusの状態を確認:
   ```bash
   docker ps | grep milvus
   ```

2. Milvusを再起動:
   ```bash
   docker-compose -f milvus-standalone-docker-compose.yml restart
   ```

3. ポートの競合を確認:
   ```bash
   lsof -i :19530
   ```

4. Chromaに切り替え（Docker不要）:
   ```bash
   export LSP_MCP_VECTOR_STORE=chroma
   ```

## サポート

問題が解決しない場合は、以下をご確認ください:

- GitHub Issues: https://github.com/yourusername/lsp-mcp/issues
- ドキュメント: `docs/TROUBLESHOOTING.md`
- セットアップガイド: `docs/SETUP.md`

## 次のステップ

統合が完了したら、以下のドキュメントも参照してください:

- [設定リファレンス](CONFIGURATION.md) - 詳細な設定オプション
- [アーキテクチャ](ARCHITECTURE.md) - システムの内部構造
- [プラグイン開発](PLUGIN_DEVELOPMENT.md) - カスタムプラグインの作成方法
