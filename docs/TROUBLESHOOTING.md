# トラブルシューティング

Context-MCPの使用中に発生する一般的な問題と解決方法をまとめています。

## 目次

- [インストール関連](#インストール関連)
- [Rustビルド関連](#rustビルド関連)
- [Milvus関連](#milvus関連)
- [ONNX Runtime関連](#onnx-runtime関連)
- [インデックス化関連](#インデックス化関連)
- [検索関連](#検索関連)
- [Claude Code統合関連](#claude-code統合関連)
- [パフォーマンス関連](#パフォーマンス関連)
- [ネットワーク関連](#ネットワーク関連)
- [デバッグ方法](#デバッグ方法)
- [サポート情報](#サポート情報)

## インストール関連

### Rustがインストールされていない

**症状**:
```
command not found: cargo
command not found: rustc
```

**原因**: Rustツールチェーンがインストールされていない

**解決方法**:

```bash
# rustupをインストール（推奨）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# インストール後、新しいシェルを開くかPATHを更新
source ~/.cargo/env

# バージョン確認
rustc --version  # 1.70以上が必要
cargo --version
```

### Protocol Buffers compilerがインストールされていない

**症状**:
```
error: failed to run custom build command for `milvus-proto v0.1.0`
Could not find `protoc` installation
```

**原因**: Protocol Buffers compilerがインストールされていない

**解決方法**:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y protobuf-compiler
protoc --version  # バージョン確認
```

**macOS:**
```bash
brew install protobuf
protoc --version
```

**Windows (WSL2):**
```bash
sudo apt-get update
sudo apt-get install -y protobuf-compiler
```

## Rustビルド関連

### Rustビルドエラー

**症状**:
```
error: linking with `cc` failed: exit status: 1
```

**原因**: ビルドツールやライブラリが不足している

**解決方法**:

**Ubuntu/Debian:**
```bash
sudo apt-get install -y build-essential libssl-dev pkg-config
```

**macOS:**
```bash
xcode-select --install
```

### cargoのキャッシュが壊れている

**症状**:
```
error: failed to parse manifest at `.../Cargo.toml`
```

**解決方法**:

```bash
# ビルドキャッシュをクリア
cargo clean

# Cargoレジストリのキャッシュをクリア
rm -rf ~/.cargo/registry/index/*
rm -rf ~/.cargo/registry/cache/*

# 再ビルド
cargo build --release
```

### 依存クレートのコンパイルエラー

**症状**:
```
error[E0308]: mismatched types
  --> .cargo/registry/src/.../some_crate/lib.rs
```

**解決方法**:

```bash
# Cargo.lockを削除して依存関係を再解決
rm Cargo.lock
cargo update
cargo build --release

# または、依存クレートのバージョンを固定
# Cargo.tomlで特定のバージョンを指定
```

## Milvus関連

### Milvusが起動しない

**症状**:
```
docker compose up -d
Error response from daemon: driver failed programming external connectivity
```

**原因**: ポート19530が既に使用されている

**解決方法**:

```bash
# ポートを使用しているプロセスを確認
lsof -i :19530

# プロセスを停止
kill -9 <PID>

# または、Milvusのポートを変更
# docker-compose.yml を編集
# ports:
#   - "19531:19530"  # 19530 -> 19531に変更

# 環境変数も変更
export MILVUS_ADDRESS=localhost:19531
```

### Milvusコンテナが起動後すぐに停止する

**症状**:
```
docker ps -a
CONTAINER ID   STATUS
xxxxx          Exited (1) 2 seconds ago
```

**解決方法**:

```bash
# ログを確認
docker-compose logs milvus

# メモリ不足の場合
# Docker Desktopの設定でメモリを4GB以上に増やす

# ディスク容量不足の場合
df -h  # 空き容量を確認
# 不要なDockerイメージを削除
docker system prune -a
```

### Milvusに接続できない

**症状**:
```
Error: Failed to connect to Milvus at localhost:19530
```

**解決方法**:

```bash
# 1. Milvusが起動しているか確認
docker ps | grep milvus

# 2. ポートが開いているか確認
nc -zv localhost 19530

# 3. Milvusの起動を待つ（初回起動は時間がかかる）
docker-compose logs -f milvus
# "Milvus Proxy started successfully" が表示されるまで待つ

# 4. ファイアウォールの確認
# macOS
sudo pfctl -s all | grep 19530

# Linux
sudo iptables -L | grep 19530
```

### Milvusのデータが消えた

**原因**: Docker volumeが削除された

**解決方法**:

```bash
# バックアップから復元
tar xzf milvus-backup-YYYYMMDD.tar.gz

# 今後のためにバックアップスクリプトを作成
cat > backup-milvus.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
tar czf "milvus-backup-$DATE.tar.gz" volumes/
echo "Backup created: milvus-backup-$DATE.tar.gz"
EOF

chmod +x backup-milvus.sh

# 定期的にバックアップ（cron）
crontab -e
# 毎日午前2時にバックアップ
0 2 * * * /path/to/backup-milvus.sh
```

## ONNX Runtime関連

### ONNXモデルのロードエラー

**症状**:
```
Error: Failed to load ONNX model
Error loading model from file: models/all-MiniLM-L6-v2.onnx
```

**原因**: モデルファイルが存在しないか破損している

**解決方法**:

```bash
# 1. モデルファイルの確認
ls -lh models/all-MiniLM-L6-v2.onnx

# 2. モデルファイルが存在しない場合、ダウンロード
mkdir -p models
curl -L -o models/all-MiniLM-L6-v2.onnx \
  https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx

# 3. トークナイザーもダウンロード
curl -L -o models/tokenizer.json \
  https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json
```

### ONNX Runtimeのバージョンエラー

**症状**:
```
error: failed to compile `ort` v2.x.x
```

**解決方法**:

```bash
# Cargo.tomlでortのバージョンを確認・調整
# 最新版を使用するか、安定版を指定

# ビルドキャッシュをクリアして再ビルド
cargo clean
cargo build --release
```

### 埋め込み生成が遅い

**症状**: インデックス化が非常に遅い（1ファイル/秒以下）

**解決方法**:

```bash
# 1. CPUスレッド数を増やす（.context-mcp.json）
{
  "embedding": {
    "num_threads": 8  // CPUコア数に合わせる
  }
}

# 2. バッチサイズを増やす
{
  "embedding": {
    "batch_size": 64
  }
}

# 3. より軽量なモデルを使用
# all-MiniLM-L6-v2 は既に軽量ですが、
# さらに軽量化が必要な場合は別モデルを検討
```

## インデックス化関連

### インデックス化が途中で止まる

**症状**: 進捗が一定のパーセンテージで停止する

**解決方法**:

```bash
# 1. ログを確認
export RUST_LOG=debug
cargo run --release

# 2. 問題のファイルをスキップ
# ログから問題のファイルを特定
# .context-mcp.json にexclude_patternsを追加
{
  "indexing": {
    "exclude_patterns": [
      "path/to/problematic/file.ts"
    ]
  }
}

# 3. タイムアウトを増やす（今後実装予定）
{
  "indexing": {
    "file_timeout": 30000  // 30秒
  }
}
```

### 特定のファイルがインデックス化されない

**症状**: 存在するファイルが検索結果に出てこない

**解決方法**:

```bash
# 1. 除外パターンを確認（.context-mcp.json）
{
  "indexing": {
    "exclude_patterns": [
      "node_modules/**",
      ".git/**"
      // ファイルが意図せず除外されていないか確認
    ]
  }
}

# 2. ファイルサイズを確認
ls -lh path/to/file.ts
# 大きすぎるファイルはスキップされる可能性があります

# 3. ログを確認
export RUST_LOG=debug
cargo run --release
```

### メモリ不足エラー

**症状**:
```
Error: Out of memory
thread 'main' panicked at 'allocation failed'
```

**解決方法**:

```bash
# 1. バッチサイズを減らす（.context-mcp.json）
{
  "embedding": {
    "batch_size": 16  // 32から減らす
  }
}

# 2. 並列処理数を減らす
{
  "indexing": {
    "num_workers": 2  // 4から減らす
  }
}

# 3. 段階的にインデックス化（今後実装予定）
context-mcp index src/
context-mcp index tests/
context-mcp index docs/
```

## 検索関連

### 検索結果が返ってこない

**症状**: クエリを実行しても結果が0件

**解決方法**:

```bash
# 1. インデックス状態を確認（今後実装予定）
context-mcp status
# Indexed Files: 0 の場合は再インデックス化

# 2. ログを確認
export RUST_LOG=debug

# 3. 検索パラメータを調整（.context-mcp.json）
{
  "search": {
    "top_k": 50,  // 20から増やす
    "min_score": 0.0  // 閾値を下げる
  }
}

# 4. ハイブリッド検索の重みを調整
{
  "search": {
    "bm25_weight": 0.5,
    "vector_weight": 0.5
  }
}
```

### 検索結果の精度が低い

**症状**: 関係ないファイルが検索結果に含まれる

**解決方法**:

```bash
# 1. ハイブリッド検索の重みを調整（.context-mcp.json）
{
  "search": {
    "bm25_weight": 0.2,
    "vector_weight": 0.8  // ベクトル検索を重視
  }
}

# 2. 最小スコア閾値を設定
{
  "search": {
    "min_score": 0.5  // 低スコアを除外
  }
}

# 3. より高精度なモデルに変更（今後実装予定）
{
  "embedding": {
    "model_path": "models/all-mpnet-base-v2.onnx"
  }
}
```

### 検索が遅い

**症状**: 検索に5秒以上かかる

**解決方法**:

```bash
# 1. Milvusのインデックスタイプを変更（今後実装予定）
{
  "milvus": {
    "index_type": "HNSW",  // IVF_FLATより高速
    "metric_type": "IP"
  }
}

# 2. top_kを減らす（.context-mcp.json）
{
  "search": {
    "top_k": 10  // 20から減らす
  }
}

# 3. インデックスを再構築（今後実装予定）
context-mcp clear-index
context-mcp index .
```

## Claude Code統合関連

### Claude CodeでContext-MCPが認識されない

**症状**: `@context-mcp`が使えない

**解決方法**:

```bash
# 1. MCP設定ファイルを確認
# macOS
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
cat ~/.config/claude-code/mcp.json

# 2. 設定が正しいか確認
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",  // フルパスを指定
      "args": []
    }
  }
}

# 3. context-mcpのパスを確認
which context-mcp

# 4. 実行権限を確認
ls -l /usr/local/bin/context-mcp
chmod +x /usr/local/bin/context-mcp

# 5. Claude Codeを完全再起動
# macOS
killall "Claude"
# Claude Codeを再起動
```

### Claude CodeでMCPツールが実行できない

**症状**:
```
Error: MCP tool execution failed: context-mcp/index_project
```

**解決方法**:

```bash
# 1. MCPサーバーのログを確認（今後実装予定）
# macOS
tail -f ~/Library/Logs/Claude/mcp-server-context-mcp.log

# 2. 手動でMCPサーバーをテスト
context-mcp --version

# 3. 環境変数を設定（claude_desktop_config.json）
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "RUST_LOG": "debug"
      }
    }
  }
}
```

## パフォーマンス関連

### インデックス化が遅すぎる

**症状**: 1,000ファイルのインデックス化に10分以上かかる

**解決方法**:

```bash
# 1. 並列処理を増やす（.context-mcp.json）
{
  "indexing": {
    "num_workers": 8  // CPUコア数に合わせる
  }
}

# 2. バッチサイズを増やす
{
  "embedding": {
    "batch_size": 64
  }
}

# 3. 不要なファイルを除外
{
  "indexing": {
    "exclude_patterns": [
      "node_modules/**",
      "dist/**",
      "*.min.js",
      "*.test.ts"
    ]
  }
}

# 4. SSDを使用
# HDDの場合、SSDに移行すると大幅に高速化

# 5. リリースビルドを使用
cargo build --release
./target/release/context-mcp
```

### メモリ使用量が多すぎる

**症状**: 4GB以上のメモリを使用する

**解決方法**:

```bash
# 1. バッチサイズを減らす（.context-mcp.json）
{
  "embedding": {
    "batch_size": 16
  }
}

# 2. ワーカー数を減らす
{
  "indexing": {
    "num_workers": 2
  }
}

# 3. 段階的にインデックス化（今後実装予定）
context-mcp index src/
context-mcp index tests/
context-mcp index docs/
```

## ネットワーク関連

### プロキシ環境下で動作しない

**症状**: モデルダウンロードやZilliz Cloudが動作しない

**解決方法**:

```bash
# 1. プロキシ設定
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1

# 2. 環境変数を永続化（~/.bashrc）
echo 'export HTTP_PROXY=http://proxy.example.com:8080' >> ~/.bashrc
echo 'export HTTPS_PROXY=http://proxy.example.com:8080' >> ~/.bashrc
source ~/.bashrc
```

### SSL証明書エラー

**症状**:
```
Error: self signed certificate in certificate chain
```

**解決方法**:

```bash
# 開発環境のみ、本番環境では非推奨
export RUSTLS_NATIVE_CERTS=true

# または、CA証明書を指定
export SSL_CERT_FILE=/path/to/ca-certificate.crt
```

## デバッグ方法

### デバッグログの有効化

```bash
# 1. 環境変数でログレベルを設定
export RUST_LOG=debug

# 2. または設定ファイルで指定（.context-mcp.json）
{
  "logging": {
    "level": "debug"
  }
}

# 3. 実行
cargo run --release

# 4. ログを確認
# ログは標準エラー出力に出力されます
```

### デバッグモードでの実行

```bash
# デバッグビルドで実行（詳細なスタックトレース付き）
cargo build
RUST_BACKTRACE=1 ./target/debug/context-mcp

# または、リリースビルドでもバックトレースを有効化
RUST_BACKTRACE=1 ./target/release/context-mcp
```

## よくあるエラーメッセージ

### `ENOENT: no such file or directory`

**原因**: 設定ファイルまたはデータディレクトリが存在しない

**解決方法**:

```bash
# データディレクトリを作成
mkdir -p data
mkdir -p models

# モデルファイルをダウンロード
curl -L -o models/all-MiniLM-L6-v2.onnx \
  https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
```

### `address already in use`

**原因**: ポートが既に使用されている

**解決方法**:

```bash
# 使用しているプロセスを確認
lsof -i :19530

# プロセスを停止
kill -9 <PID>
```

### `cannot find -lssl`

**原因**: OpenSSL開発ライブラリが不足している

**解決方法**:

**Ubuntu/Debian:**
```bash
sudo apt-get install -y libssl-dev
```

**macOS:**
```bash
brew install openssl
export OPENSSL_DIR=/usr/local/opt/openssl
```

## サポート情報

### バグレポート

バグを発見した場合は、以下の情報とともにIssueを作成してください:

1. **Context-MCPバージョン**: `context-mcp --version`
2. **Rustバージョン**: `rustc --version`
3. **OS情報**: `uname -a`（Linux/macOS）、`ver`（Windows）
4. **設定ファイル**: `.context-mcp.json`（トークンは削除）
5. **エラーメッセージ**: ログファイルの関連部分
6. **再現手順**: 問題を再現する手順

### 診断情報の収集

```bash
# 診断情報を収集
echo "=== Context-MCP Version ===" > diagnosis.txt
context-mcp --version >> diagnosis.txt
echo "" >> diagnosis.txt

echo "=== Rust Version ===" >> diagnosis.txt
rustc --version >> diagnosis.txt
cargo --version >> diagnosis.txt
echo "" >> diagnosis.txt

echo "=== OS Information ===" >> diagnosis.txt
uname -a >> diagnosis.txt
echo "" >> diagnosis.txt

echo "=== Docker Status ===" >> diagnosis.txt
docker ps >> diagnosis.txt
echo "" >> diagnosis.txt

# GitHubのIssueに diagnosis.txt を添付
```

### コミュニティサポート

- **GitHub Issues**: https://github.com/windschord/lsp-mcp/issues
- **Discussions**: https://github.com/windschord/lsp-mcp/discussions

## 参考資料

- [セットアップガイド](SETUP.md)
- [環境変数リファレンス](ENVIRONMENT_VARIABLES.md)
- [README](../README.md)

## 問題が解決しない場合

上記の方法で問題が解決しない場合は:

1. 最新バージョンにアップデート:
   ```bash
   git pull
   cargo build --release
   ```
2. クリーンビルド:
   ```bash
   cargo clean
   rm -rf target/
   cargo build --release
   ```
3. GitHubでIssueを作成: https://github.com/windschord/lsp-mcp/issues/new
