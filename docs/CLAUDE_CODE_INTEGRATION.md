# Claude Code統合ガイド

このガイドでは、Context-MCPをClaude Codeと統合する手順を説明します。

## 目次

- [前提条件](#前提条件)
- [インストール手順](#インストール手順)
- [MCP設定ファイルの設定](#mcp設定ファイルの設定)
- [動作確認](#動作確認)
- [統合チェックリスト](#統合チェックリスト)
- [各MCPツールの使用例](#各mcpツールの使用例)
- [トラブルシューティング](#トラブルシューティング)

## 前提条件

- Rust 1.75以上（1.80以上を推奨）
- Protocol Buffers compiler（protoc）
- Claude Code（最新版）
- Docker & Docker Compose（Milvus必須）

## インストール手順

### 1. Rustツールチェーンのインストール

```bash
# rustupを使用してRustをインストール（推奨）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# インストール後、環境変数を読み込む
source $HOME/.cargo/env

# バージョン確認
rustc --version  # 1.75以上であることを確認
cargo --version
```

### 2. Protocol Buffers compilerのインストール

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y protobuf-compiler libssl-dev pkg-config build-essential

# macOS
brew install protobuf

# バージョン確認
protoc --version  # 3.12以上であることを確認
```

### 3. Context-MCPのビルド

```bash
cd /path/to/context-mcp

# 依存関係のビルド（初回は時間がかかります）
cargo build --release
```

ビルドが成功すると、`target/release/context-mcp`に実行可能バイナリが生成されます。

### 4. 実行可能性の確認

```bash
./target/release/context-mcp --version
```

バージョン情報が表示されれば、ビルドは正常に完了しています。

### 5. Milvus standaloneの起動

Context-MCPはベクターDBとしてMilvusを使用します（必須）。

```bash
cd /path/to/context-mcp

# Milvus standaloneを起動（Docker Compose使用）
docker-compose up -d

# コンテナの状態確認
docker ps | grep milvus

# ログ確認
docker-compose logs -f milvus-standalone
```

Milvusが正常に起動すると、`localhost:19530`で接続可能になります。

## MCP設定ファイルの設定

Claude CodeのMCP設定ファイルにContext-MCPを登録します。

### 設定ファイルの場所

- **macOS/Linux**: `~/.config/claude/mcp_settings.json`
- **Windows**: `%APPDATA%\Claude\mcp_settings.json`

### 設定例

以下の内容を`mcp_settings.json`に追加します。

**重要**: `command`には**ビルドした実行可能バイナリの絶対パス**を指定してください。

#### ローカルモード（ONNX埋め込み + Milvus standalone）

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/path/to/context-mcp/target/release/context-mcp",
      "args": [],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

**パスの例:**
- macOS/Linux: `/Users/username/projects/context-mcp/target/release/context-mcp`
- Windows: `C:\Users\username\projects\context-mcp\target\release\context-mcp.exe`

#### 設定ファイル（.context-mcp.json）を使ったカスタマイズ

プロジェクトのルートディレクトリに`.context-mcp.json`を配置することで、動作をカスタマイズできます。

**基本設定例:**
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
    "provider": "onnx",
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "dimension": 384
  },
  "privacy": {
    "blockExternalCalls": true
  },
  "search": {
    "hybridAlpha": 0.3,
    "topK": 10
  }
}
```

### 環境変数の説明

| 環境変数 | 説明 | デフォルト値 |
|---------|-----|-------------|
| `RUST_LOG` | ログレベル（`error`, `warn`, `info`, `debug`, `trace`） | `info` |
| `MILVUS_ADDRESS` | Milvusサーバーのアドレス | `localhost:19530` |
| `MILVUS_DATA_PATH` | Milvusデータディレクトリ | `./volumes` |

## 動作確認

### 1. Claude Codeを再起動

MCP設定ファイルを更新したら、Claude Codeを完全に終了して再起動します。

### 2. MCPツールの確認

Claude Codeのツールパレットから、Context-MCPのツールが利用可能か確認します。
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

Context-MCPが正常に動作していれば、`index_project`ツールが呼び出され、
プロジェクトのファイルが解析されてインデックス化されます。

## 統合チェックリスト

Context-MCPとClaude Codeの統合が正常に完了したかを確認するためのチェックリストです。
各項目を順番に確認してください。

### ✅ インストールと設定

- [ ] **Rust 1.75+がインストールされている**
  ```bash
  rustc --version  # 1.75.0以上が表示される
  cargo --version
  ```

- [ ] **Protocol Buffers compilerがインストールされている**
  ```bash
  protoc --version  # 3.12以上が表示される
  ```

- [ ] **Context-MCPがビルドできる**
  ```bash
  cd /path/to/context-mcp
  cargo build --release
  # エラーなく完了する
  ```

- [ ] **MCP設定ファイルが正しく配置されている**
  - macOS/Linux: `~/.config/claude/mcp_settings.json`
  - Windows: `%APPDATA%\Claude\mcp_settings.json`

- [ ] **MCP設定ファイルにcontext-mcpの設定が追加されている**
  ```json
  {
    "mcpServers": {
      "context-mcp": { ... }
    }
  }
  ```

- [ ] **実行ファイルのパスが絶対パスである**
  - 相対パスは使用しない
  - `~/`は展開する（例: `/Users/username/...`）
  - 実行権限が付与されている（`chmod +x`）

### ✅ モード別の設定確認

#### ローカルモード（Milvus + ONNX）

- [ ] **Docker & Docker Composeがインストールされている**
  ```bash
  docker --version
  docker-compose --version
  ```

- [ ] **Milvus standaloneが起動している（必須）**
  ```bash
  cd /path/to/context-mcp
  docker-compose up -d
  docker ps | grep milvus  # milvus-standaloneコンテナが表示される
  ```

- [ ] **ポート19530が空いている**
  ```bash
  lsof -i :19530  # Milvusのみが使用中であることを確認
  ```

- [ ] **ONNXモデルが配置されている（オプション）**
  - デフォルトで埋め込みモデルを自動ダウンロード
  - カスタムモデルを使用する場合は`./models/`に配置

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
  tail -f ~/.config/claude/logs/mcp-context-mcp.log
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
- 実行権限がない

**解決方法:**

1. 設定ファイルのパスを確認:
   ```bash
   cat ~/.config/claude/mcp_settings.json
   ```

2. バイナリの絶対パスであることを確認:
   ```json
   "command": "/Users/username/path/to/context-mcp/target/release/context-mcp"
   ```

3. 実行権限を確認・付与:
   ```bash
   ls -l /path/to/context-mcp/target/release/context-mcp
   chmod +x /path/to/context-mcp/target/release/context-mcp
   ```

4. ビルドエラーを確認:
   ```bash
   cd /path/to/context-mcp
   cargo build --release
   ```

5. 直接実行して動作確認:
   ```bash
   ./target/release/context-mcp --version
   ```

6. Claude Codeを完全に終了して再起動

### インデックス化が失敗する

**原因:**
- Milvusが起動していない（必須）
- メモリ不足
- ネットワーク接続の問題

**解決方法:**

1. Milvus standaloneを起動:
   ```bash
   cd /path/to/context-mcp
   docker-compose up -d

   # 起動確認
   docker ps | grep milvus
   docker-compose logs -f milvus-standalone
   ```

2. Milvusの状態を確認:
   ```bash
   # ポート19530が開いているか確認
   lsof -i :19530

   # Milvusコンテナのヘルスチェック
   docker inspect milvus-standalone | grep Health
   ```

3. ログを確認:
   ```bash
   # Context-MCPのログ（Rust）
   RUST_LOG=debug ./target/release/context-mcp

   # Claude Codeのログ
   tail -f ~/.config/claude/logs/mcp-context-mcp.log

   # Milvusのログ
   docker-compose logs -f milvus-standalone
   ```

4. Milvusを再起動:
   ```bash
   docker-compose down
   docker-compose up -d
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
- ONNX埋め込みモデルの初回ロード
- 大規模プロジェクト
- ディスクI/Oの遅延
- Milvusのインデックス構築

**解決方法:**

1. リリースビルドを使用（デバッグビルドは遅い）:
   ```bash
   cargo build --release
   ./target/release/context-mcp  # デバッグ版は使用しない
   ```

2. インクリメンタル更新を活用（初回インデックス化後は高速）

3. 除外パターンを使ってファイル数を削減:
   ```
   「node_modules、dist、buildディレクトリを除外してインデックス化してください」
   ```

4. Milvusのメモリ制限を調整（docker-compose.yml）:
   ```yaml
   services:
     milvus-standalone:
       deploy:
         resources:
           limits:
             memory: 4g  # メモリを増やす
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
   docker-compose ps
   ```

2. Milvusのログを確認:
   ```bash
   docker-compose logs -f milvus-standalone
   ```

3. Milvusを完全に再起動:
   ```bash
   docker-compose down
   docker-compose up -d

   # 起動完了まで待つ（30秒程度）
   sleep 30
   docker ps | grep milvus
   ```

4. ポートの競合を確認:
   ```bash
   lsof -i :19530
   # Milvus以外が使用している場合は、そのプロセスを停止
   ```

5. ファイアウォール設定を確認:
   ```bash
   # ローカルホストの19530番ポートが許可されているか確認
   sudo ufw status
   ```

6. Docker volumesをクリア（最終手段）:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

## サポート

問題が解決しない場合は、以下をご確認ください:

- GitHub Issues: https://github.com/yourusername/context-mcp/issues
- ドキュメント: `docs/TROUBLESHOOTING.md`
- セットアップガイド: `docs/SETUP.md`

## 次のステップ

統合が完了したら、以下のドキュメントも参照してください:

- [設定リファレンス](CONFIGURATION.md) - 詳細な設定オプション
- [アーキテクチャ](ARCHITECTURE.md) - システムの内部構造
- [プラグイン開発](PLUGIN_DEVELOPMENT.md) - カスタムプラグインの作成方法

## 参考資料

- [Rust公式サイト](https://www.rust-lang.org/) - Rustのインストールと学習
- [Milvus Documentation](https://milvus.io/docs) - Milvusの詳細ドキュメント
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/) - MCPプロトコルの仕様

