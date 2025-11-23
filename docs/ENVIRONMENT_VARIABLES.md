# 環境変数リファレンス

このドキュメントでは、Context-MCPで使用可能なすべての環境変数について説明します。

## 概要

Context-MCPは、設定ファイル（`.context-mcp.json`）を作成せずに、環境変数のみで動作可能なゼロコンフィグ設計を採用しています。

### 設定の優先順位

```
優先度（高）
  ↓
1. 環境変数（MILVUS_ADDRESS等）
  ↓
2. ユーザー設定ファイル（.context-mcp.json）
  ↓
3. デフォルト設定（src/config/mod.rs）
  ↓
優先度（低）
```

環境変数と設定ファイルを併用した場合、**環境変数の値が優先**されます。

## 環境変数一覧

### Milvus設定

#### `MILVUS_ADDRESS`

Milvusサーバーの接続アドレスを指定します。

- **型**: `string` (host:port形式)
- **デフォルト**: `"localhost:19530"`
- **説明**: MilvusまたはZilliz Cloudサーバーのホスト名とポート番号
- **例**:
  ```bash
  MILVUS_ADDRESS=localhost:19530
  MILVUS_ADDRESS=your-instance.zilliz.com:19530
  ```

#### `MILVUS_TOKEN`

Milvus認証トークンを指定します（Zilliz Cloud使用時）。

- **型**: `string`
- **デフォルト**: なし
- **説明**: Zilliz Cloudへの接続に必要な認証トークン。ローカルMilvus standaloneでは不要
- **例**:
  ```bash
  MILVUS_TOKEN=your-zilliz-cloud-token
  ```

### 埋め込みモデル設定

#### `MODEL_PATH`

ONNXモデルファイルのパスを指定します。

- **型**: `string` (ファイルパス)
- **デフォルト**: `"models/all-MiniLM-L6-v2.onnx"`
- **説明**: 埋め込みベクトル生成に使用するONNXモデルファイルへのパス
- **例**:
  ```bash
  MODEL_PATH=models/all-MiniLM-L6-v2.onnx
  MODEL_PATH=/custom/path/model.onnx
  ```

#### `TOKENIZER_PATH`

トークナイザーファイルのパスを指定します。

- **型**: `string` (ファイルパス)
- **デフォルト**: `"models/tokenizer.json"`
- **説明**: トークナイザー設定ファイルへのパス
- **例**:
  ```bash
  TOKENIZER_PATH=models/tokenizer.json
  TOKENIZER_PATH=/custom/path/tokenizer.json
  ```

### BM25設定

#### `BM25_DB_PATH`

BM25データベースファイルのパスを指定します。

- **型**: `string` (ファイルパス)
- **デフォルト**: `"./data/bm25.db"`
- **説明**: BM25全文検索インデックスを格納するSQLiteデータベースファイルへのパス
- **例**:
  ```bash
  BM25_DB_PATH=./data/bm25.db
  BM25_DB_PATH=/custom/path/bm25.db
  ```

### ログ設定

#### `RUST_LOG`

ログ出力レベルを指定します。

- **型**: `string`
- **デフォルト**: `"info"`
- **説明**: Rustの標準ログレベル。カンマ区切りでモジュール別の設定も可能
- **値**:
  - `error`: エラーのみ出力
  - `warn`: 警告とエラーを出力
  - `info`: 一般的な情報ログを出力（推奨）
  - `debug`: デバッグ情報を含むすべてのログを出力
  - `trace`: 最も詳細なトレース情報を含むすべてのログを出力
- **例**:
  ```bash
  RUST_LOG=info
  RUST_LOG=debug
  RUST_LOG=context_mcp=debug,milvus=info
  ```

## ユースケース別の設定例

### ユースケース1: ローカルモード（デフォルト、最もシンプル）

Docker ComposeでMilvus standaloneを起動し、ローカルONNXモデルを使用。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

**環境変数**（省略可、デフォルト値が使用される）:
```bash
MILVUS_ADDRESS=localhost:19530
MODEL_PATH=models/all-MiniLM-L6-v2.onnx
TOKENIZER_PATH=models/tokenizer.json
BM25_DB_PATH=./data/bm25.db
RUST_LOG=info
```

### ユースケース2: Zilliz Cloud使用

クラウドベースのMilvusサービスを使用。埋め込みはローカルONNXモデル。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "MILVUS_ADDRESS": "your-instance.zilliz.com:19530",
        "MILVUS_TOKEN": "your-zilliz-token",
        "RUST_LOG": "info"
      }
    }
  }
}
```

**環境変数**:
```bash
MILVUS_ADDRESS=your-instance.zilliz.com:19530
MILVUS_TOKEN=your-zilliz-token
MODEL_PATH=models/all-MiniLM-L6-v2.onnx
TOKENIZER_PATH=models/tokenizer.json
BM25_DB_PATH=./data/bm25.db
RUST_LOG=info
```

### ユースケース3: カスタムモデルパス

カスタムの埋め込みモデルとトークナイザーを使用。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "MODEL_PATH": "/custom/path/model.onnx",
        "TOKENIZER_PATH": "/custom/path/tokenizer.json",
        "RUST_LOG": "info"
      }
    }
  }
}
```

**環境変数**:
```bash
MILVUS_ADDRESS=localhost:19530
MODEL_PATH=/custom/path/model.onnx
TOKENIZER_PATH=/custom/path/tokenizer.json
BM25_DB_PATH=./data/bm25.db
RUST_LOG=info
```

### ユースケース4: 開発・デバッグモード

詳細なログを出力してトラブルシューティング。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/path/to/lsp_mcp/target/debug/context-mcp",
      "args": [],
      "env": {
        "RUST_LOG": "debug",
        "RUST_BACKTRACE": "1"
      }
    }
  }
}
```

**環境変数**:
```bash
MILVUS_ADDRESS=localhost:19530
MODEL_PATH=models/all-MiniLM-L6-v2.onnx
TOKENIZER_PATH=models/tokenizer.json
BM25_DB_PATH=./data/bm25.db
RUST_LOG=debug
RUST_BACKTRACE=1
```

## 環境変数と設定ファイルの併用

環境変数と`.context-mcp.json`を併用する場合、以下のマージロジックが適用されます：

1. デフォルト設定を読み込む
2. `.context-mcp.json`が存在する場合、その内容で上書き
3. 環境変数が設定されている場合、その値で上書き（最優先）

### 例: 部分的な上書き

`.context-mcp.json`:
```json
{
  "milvus": {
    "address": "localhost:19530"
  },
  "embedding": {
    "model_path": "models/all-MiniLM-L6-v2.onnx",
    "tokenizer_path": "models/tokenizer.json"
  },
  "bm25": {
    "db_path": "./data/bm25.db"
  }
}
```

環境変数:
```bash
MILVUS_ADDRESS=custom-server:19530
RUST_LOG=debug
```

**最終的な設定**:
- Milvusアドレス: `custom-server:19530`（環境変数で上書き）
- モデルパス: `models/all-MiniLM-L6-v2.onnx`（設定ファイルから）
- トークナイザーパス: `models/tokenizer.json`（設定ファイルから）
- BM25 DBパス: `./data/bm25.db`（設定ファイルから）
- ログレベル: `debug`（環境変数から）

## トラブルシューティング

### 問題1: 環境変数が反映されない

**症状**: 環境変数を設定したが、デフォルト値が使用されている

**原因**:
- Claude Codeを再起動していない
- 環境変数名のスペルミス
- 設定ファイルの値が環境変数より優先されている（誤解）

**解決方法**:
1. Claude Codeを再起動
2. 環境変数名を確認（例: `MILVUS_ADDRESS`、アンダースコアの位置に注意）
3. ログを確認（`RUST_LOG=debug`に設定して起動ログを確認）

```bash
# 環境変数が正しく設定されているか確認
echo $MILVUS_ADDRESS
echo $MODEL_PATH
echo $RUST_LOG
```

### 問題2: トークンが認識されない

**症状**: `MILVUS_TOKEN`を設定したが、認証エラーが発生

**原因**:
- トークンの形式が不正
- 環境変数に特殊文字（スペース、改行等）が含まれている
- Zilliz Cloudのアドレスが正しくない

**解決方法**:
1. トークンを再確認（先頭・末尾にスペースがないか）
2. `MILVUS_ADDRESS`が正しく設定されているか確認
3. ログでトークンの最初の数文字を確認

```bash
# トークンの確認（先頭数文字のみ表示）
echo $MILVUS_TOKEN | cut -c1-10
```

### 問題3: Milvusに接続できない

**症状**: `MILVUS_ADDRESS`を設定したが、接続エラーが発生

**原因**:
- Milvus standaloneが起動していない
- アドレスが正しくない（host:port形式）
- ファイアウォールやネットワーク設定の問題

**解決方法**:
1. `docker ps`でMilvusコンテナが起動していることを確認
2. アドレス形式を確認（例: `localhost:19530`）
3. `nc -zv localhost 19530`で接続テスト

```bash
# Milvusの起動確認
docker ps | grep milvus

# ポートの接続確認
nc -zv localhost 19530

# 環境変数の確認
echo $MILVUS_ADDRESS
```

### 問題4: ログレベルの変更が反映されない

**症状**: `RUST_LOG`を変更したが、ログ出力量が変わらない

**原因**:
- Claude Codeを再起動していない
- 環境変数名のスペルミス

**解決方法**:
1. Claude Codeを完全に再起動
2. 環境変数名を確認（`RUST_LOG`）
3. ログが標準エラー出力に出力されることを確認

```bash
# ログレベルの確認
echo $RUST_LOG

# 直接実行してログを確認
RUST_LOG=debug ./target/release/context-mcp
```

### 問題5: モデルファイルが見つからない

**症状**: `MODEL_PATH`を設定したが、モデルが読み込めない

**原因**:
- モデルファイルが存在しない
- パスが正しくない
- 相対パスと絶対パスの混同

**解決方法**:
1. モデルファイルの存在を確認
2. 絶対パスを使用
3. ファイルの読み取り権限を確認

```bash
# モデルファイルの確認
ls -lh $MODEL_PATH

# または直接パスを確認
ls -lh models/all-MiniLM-L6-v2.onnx

# 絶対パスを使用
export MODEL_PATH=/absolute/path/to/model.onnx
```

## デバッグ用コマンド

### 現在の設定を確認

Context-MCPは起動時に適用された設定をログに出力します（`RUST_LOG=debug`時）。

```bash
# Claude Codeのログを確認（macOS）
tail -f ~/Library/Logs/Claude/mcp-server-context-mcp.log

# 起動時の設定ログを確認
grep "Configuration" ~/Library/Logs/Claude/mcp-server-context-mcp.log
```

### 環境変数の確認

```bash
# Claude Code MCP設定ファイルを確認
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 特定の環境変数を確認
echo $MILVUS_ADDRESS
echo $MODEL_PATH
echo $TOKENIZER_PATH
echo $BM25_DB_PATH
echo $RUST_LOG

# すべての環境変数を表示
env | grep -E "MILVUS|MODEL|TOKENIZER|BM25|RUST_LOG"
```

### 手動実行でのテスト

```bash
# 環境変数を設定して手動実行
MILVUS_ADDRESS=localhost:19530 \
MODEL_PATH=models/all-MiniLM-L6-v2.onnx \
TOKENIZER_PATH=models/tokenizer.json \
BM25_DB_PATH=./data/bm25.db \
RUST_LOG=debug \
./target/release/context-mcp
```

## その他の環境変数

### デバッグ関連

#### `RUST_BACKTRACE`

バックトレースの表示を制御します。

- **型**: `string`
- **デフォルト**: `"0"` (無効)
- **値**:
  - `0`: バックトレース無効
  - `1`: バックトレース有効
  - `full`: 完全なバックトレース表示
- **例**:
  ```bash
  RUST_BACKTRACE=1
  RUST_BACKTRACE=full
  ```

### ネットワーク関連（今後実装予定）

#### `HTTP_PROXY`, `HTTPS_PROXY`

プロキシサーバーを使用する場合に設定します。

- **型**: `string` (URL形式)
- **デフォルト**: なし
- **例**:
  ```bash
  HTTP_PROXY=http://proxy.example.com:8080
  HTTPS_PROXY=http://proxy.example.com:8080
  ```

#### `NO_PROXY`

プロキシを使用しないホストを指定します。

- **型**: `string` (カンマ区切りのホストリスト)
- **デフォルト**: なし
- **例**:
  ```bash
  NO_PROXY=localhost,127.0.0.1,.local
  ```

## 関連ドキュメント

- [README.md](../README.md) - クイックスタートガイド
- [SETUP.md](SETUP.md) - 詳細なセットアップ手順
- [CONFIGURATION.md](CONFIGURATION.md) - 設定ファイルリファレンス
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - トラブルシューティング全般

## 変更履歴

- **2025-01-23**: Rust実装に合わせて更新
  - Node.js/TypeScript関連の環境変数を削除
  - `LSP_MCP_MODE`, `LSP_MCP_VECTOR_BACKEND`を削除（Milvusのみサポート）
  - OpenAI、VoyageAI関連の環境変数を削除（ローカルONNXのみサポート）
  - `MILVUS_ADDRESS`, `MILVUS_TOKEN`, `MODEL_PATH`, `TOKENIZER_PATH`, `BM25_DB_PATH`, `RUST_LOG`を追加
