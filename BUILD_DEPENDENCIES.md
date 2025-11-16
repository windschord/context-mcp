# ビルド依存関係

Context-MCPのRust実装をビルドするために必要なシステム依存関係のリストです。

## Ubuntu/Debian

```bash
# 必須の依存関係をすべてインストール
sudo apt-get update
sudo apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    build-essential
```

### 個別のパッケージ説明

1. **pkg-config** - ライブラリのコンパイルフラグを検索するツール
   - 必要理由: 多くのcrateがシステムライブラリを見つけるために使用

2. **libssl-dev** - OpenSSL開発ライブラリ
   - 必要理由: `milvus` crateと`reqwest` crateがTLS/SSL接続に使用
   - パッケージ: `openssl-sys`

3. **protobuf-compiler** - Protocol Buffersコンパイラ
   - 必要理由: `milvus` crateがgRPC通信用のプロトコルバッファを生成するために使用
   - パッケージ: `prost-build`

4. **build-essential** - 基本的なビルドツール（gcc, g++, make等）
   - 必要理由: ネイティブコードをコンパイルする各種crateで使用

## Fedora/RHEL/CentOS

```bash
sudo yum install -y \
    pkgconfig \
    openssl-devel \
    protobuf-compiler \
    gcc \
    gcc-c++ \
    make
```

## Arch Linux

```bash
sudo pacman -S \
    pkgconf \
    openssl \
    protobuf \
    base-devel
```

## macOS

```bash
# Homebrewを使用
brew install \
    pkg-config \
    openssl \
    protobuf

# OpenSSLのパスを設定（必要な場合）
export OPENSSL_DIR=$(brew --prefix openssl)
```

## 依存関係の確認

すべての依存関係がインストールされているか確認：

```bash
# pkg-configの確認
pkg-config --version

# OpenSSLの確認
pkg-config --modversion openssl

# Protocol Buffersコンパイラの確認
protoc --version

# ビルドツールの確認
gcc --version
```

## ビルド手順

依存関係をインストール後：

```bash
# コードの確認
cargo check

# デバッグビルド
cargo build

# リリースビルド
cargo build --release

# テスト実行
cargo test

# 個別モジュールのテスト
cargo test --lib parser
cargo test --lib embedding
cargo test --lib search
```

## トラブルシューティング

### OpenSSL関連エラー

```
error: failed to run custom build command for `openssl-sys`
```

**解決方法**:
```bash
sudo apt-get install libssl-dev pkg-config
```

### Protocol Buffers関連エラー

```
Could not find `protoc` installation
```

**解決方法**:
```bash
sudo apt-get install protobuf-compiler
```

### リンカーエラー

```
error: linker `cc` not found
```

**解決方法**:
```bash
sudo apt-get install build-essential
```

## 追加情報

### 開発環境の推奨設定

```bash
# Rustのインストール（まだの場合）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 最新の安定版に更新
rustup update stable

# 開発ツールのインストール（オプション）
cargo install cargo-watch   # ファイル変更の監視
cargo install cargo-tarpaulin  # コードカバレッジ
```

### Docker環境での実行

Dockerを使用する場合、以下のように依存関係をインストール：

```dockerfile
FROM rust:1.75

# ビルド依存関係のインストール
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN cargo build --release
```

## Makefileの使用

プロジェクトにはMakefileが含まれています：

```bash
# 依存関係のインストール（Ubuntu/Debian）
make install-deps

# ビルド
make build

# テスト
make test

# 全てのチェックを実行
make dev
```
