# 設定リファレンス

このドキュメントでは、Context-MCP（Rust実装）の設定ファイル`.context-mcp.json`の全オプションを詳しく説明します。

## 目次

- [設定ファイルの場所](#設定ファイルの場所)
- [基本構造](#基本構造)
- [milvus（Milvus設定）](#milvusmilvus設定)
- [embedding（埋め込み設定）](#embedding埋め込み設定)
- [bm25（BM25設定）](#bm25bm25設定)
- [indexing（インデックス化設定）](#indexingインデックス化設定)
- [hybrid（ハイブリッド検索設定）](#hybridハイブリッド検索設定)
- [環境変数](#環境変数)
- [設定例集](#設定例集)

## 設定ファイルの場所

設定ファイル`.context-mcp.json`は、以下の順序で検索されます:

1. **カレントディレクトリ**: `./.context-mcp.json`
2. **ホームディレクトリ**: `~/.context-mcp.json`
3. **デフォルト値**: 設定ファイルが見つからない場合、デフォルト値を使用

通常は**プロジェクトルート**に配置することを推奨します。

## 基本構造

最小構成の設定ファイル（すべてデフォルト値を使用）:

```json
{}
```

完全な設定ファイル（全オプション明示）:

```json
{
  "milvus": {
    "address": "localhost:19530",
    "token": null,
    "shardNum": 2
  },
  "embedding": {
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json",
    "maxLength": 256,
    "batchSize": 32
  },
  "bm25": {
    "dbPath": "./data/bm25_index.db",
    "k1": 1.5,
    "b": 0.75
  },
  "indexing": {
    "batchSize": 32,
    "maxParallel": 8,
    "collectionName": "code_vectors",
    "dimension": 384
  },
  "hybrid": {
    "alpha": 0.3,
    "normalization": "MinMax",
    "bm25TopK": 20,
    "vectorTopK": 20
  }
}
```

## milvus（Milvus設定）

**型**: `object`
**必須**: いいえ（すべてのフィールドにデフォルト値あり）

Milvusベクターデータベースの接続設定を指定します。

### 設定例

```json
{
  "milvus": {
    "address": "localhost:19530",
    "token": null,
    "shardNum": 2
  }
}
```

### milvusオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `address` | string | `"localhost:19530"` | Milvusサーバーのアドレス（環境変数`MILVUS_ADDRESS`で上書き可） |
| `token` | string/null | `null` | 認証トークン（Zilliz Cloudの場合必須、環境変数`MILVUS_TOKEN`で上書き可） |
| `shardNum` | number | `2` | コレクションのシャード数（パフォーマンスチューニング用） |

### ローカルMilvus設定

Docker Composeで起動したローカルMilvusに接続する場合:

```json
{
  "milvus": {
    "address": "localhost:19530"
  }
}
```

### Zilliz Cloud設定

Zilliz Cloud（Milvusのマネージドサービス）に接続する場合:

```json
{
  "milvus": {
    "address": "your-instance.zillizcloud.com:19530",
    "token": "${MILVUS_TOKEN}",
    "shardNum": 2
  }
}
```

**注意**: トークンは環境変数を使用することを強く推奨します。

## embedding（埋め込み設定）

**型**: `object`
**必須**: いいえ（すべてのフィールドにデフォルト値あり）

ONNXベースのローカル埋め込みモデルの設定を指定します。

### 設定例

```json
{
  "embedding": {
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json",
    "maxLength": 256,
    "batchSize": 32
  }
}
```

### embeddingオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `modelPath` | string | `"./models/all-MiniLM-L6-v2.onnx"` | ONNXモデルファイルのパス（環境変数`MODEL_PATH`で上書き可） |
| `tokenizerPath` | string | `"./models/tokenizer.json"` | トークナイザーファイルのパス（環境変数`TOKENIZER_PATH`で上書き可） |
| `maxLength` | number | `256` | 最大シーケンス長（トークン数） |
| `batchSize` | number | `32` | 埋め込み生成のバッチサイズ |

### 推奨モデル

- **all-MiniLM-L6-v2** (デフォルト): 384次元、高速、バランスが良い
- **all-mpnet-base-v2**: 768次元、高精度だが遅い
- **multilingual-e5-small**: 384次元、多言語対応

モデルのダウンロード方法については、`docs/SETUP.md`を参照してください。

## bm25（BM25設定）

**型**: `object`
**必須**: いいえ（すべてのフィールドにデフォルト値あり）

BM25全文検索エンジンの設定を指定します。

### 設定例

```json
{
  "bm25": {
    "dbPath": "./data/bm25_index.db",
    "k1": 1.5,
    "b": 0.75
  }
}
```

### bm25オプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `dbPath` | string | `"./data/bm25_index.db"` | SQLiteデータベースファイルのパス（環境変数`BM25_DB_PATH`で上書き可） |
| `k1` | number | `1.5` | BM25パラメータk1（文書の飽和度、推奨範囲: 1.2-2.0） |
| `b` | number | `0.75` | BM25パラメータb（文書長の正規化、推奨範囲: 0.0-1.0） |

### BM25パラメータのチューニング

- **k1**: 高いほど用語頻度の影響が大きくなる
  - コード検索: `1.2` - `1.5`（推奨: `1.5`）
  - ドキュメント検索: `1.5` - `2.0`

- **b**: 高いほど短い文書が優遇される
  - 短いコードスニペット: `0.75` - `1.0`（推奨: `0.75`）
  - 長いドキュメント: `0.5` - `0.75`

## indexing（インデックス化設定）

**型**: `object`
**必須**: いいえ（すべてのフィールドにデフォルト値あり）

ファイルのインデックス化処理に関する設定を指定します。

### 設定例

```json
{
  "indexing": {
    "batchSize": 32,
    "maxParallel": 8,
    "collectionName": "code_vectors",
    "dimension": 384
  }
}
```

### indexingオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `batchSize` | number | `32` | ファイル処理のバッチサイズ（1以上必須） |
| `maxParallel` | number | `8` | 最大並列タスク数（1以上必須） |
| `collectionName` | string | `"code_vectors"` | Milvusコレクション名 |
| `dimension` | number | `384` | ベクトル次元数（使用モデルに合わせる、1以上必須） |

### パフォーマンスチューニング

- **batchSize**: システムのメモリに応じて調整
  - 16GB RAM: `32` - `64`
  - 8GB RAM: `16` - `32`
  - 4GB RAM: `8` - `16`

- **maxParallel**: CPUコア数に応じて調整
  - 8コア以上: `8` - `16`
  - 4コア: `4` - `8`
  - 2コア: `2` - `4`

- **dimension**: 使用する埋め込みモデルの次元数と一致させる
  - all-MiniLM-L6-v2: `384`
  - all-mpnet-base-v2: `768`

## hybrid（ハイブリッド検索設定）

**型**: `object`
**必須**: いいえ（すべてのフィールドにデフォルト値あり）

ハイブリッド検索（BM25 + ベクトル検索）の設定を指定します。

### 設定例

```json
{
  "hybrid": {
    "alpha": 0.3,
    "normalization": "MinMax",
    "bm25TopK": 20,
    "vectorTopK": 20
  }
}
```

### hybridオプション

| オプション | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `alpha` | number | `0.3` | ハイブリッド検索の重み（0.0-1.0、0=ベクトルのみ、1=BM25のみ） |
| `normalization` | string | `"MinMax"` | スコア正規化方法（`"MinMax"`, `"ZScore"`, `"None"`） |
| `bm25TopK` | number | `20` | BM25検索で取得する上位K件 |
| `vectorTopK` | number | `20` | ベクトル検索で取得する上位K件 |

### ハイブリッド検索の重み調整

最終スコアは以下の式で計算されます:

```
最終スコア = (1 - α) × 正規化済みベクトル類似度 + α × 正規化済みBM25スコア
```

**alphaの値による挙動**:

- `α = 0.0`: ベクトル検索のみ（セマンティック検索重視）
- `α = 0.3`: バランス型（**デフォルト、推奨**）
- `α = 0.5`: 完全に半々
- `α = 0.7`: BM25重視（キーワードマッチ重視）
- `α = 1.0`: BM25のみ（全文検索のみ）

**推奨値（用途別）**:

- **コード検索**: `0.3` - `0.4`（セマンティック重視）
- **ドキュメント検索**: `0.4` - `0.5`（バランス型）
- **キーワード検索**: `0.6` - `0.8`（BM25重視）

### 正規化方法

- **MinMax**: スコアを0-1に正規化（推奨）
- **ZScore**: Z-score正規化（平均0、分散1）
- **None**: 正規化なし（非推奨）

### Top-Kの調整

`bm25TopK`と`vectorTopK`は、各検索エンジンから取得する候補数を制御します。最終結果は、これらの候補をハイブリッドスコアでリランキングして返します。

- **高精度重視**: `bm25TopK = 50`, `vectorTopK = 50`
- **バランス**: `bm25TopK = 20`, `vectorTopK = 20`（デフォルト）
- **高速重視**: `bm25TopK = 10`, `vectorTopK = 10`

## 環境変数

設定ファイル内で環境変数を使用できます。また、一部の設定は環境変数で上書き可能です。

### 設定ファイル内での環境変数の使用

```json
{
  "milvus": {
    "token": "${MILVUS_TOKEN}"
  },
  "embedding": {
    "modelPath": "${MODEL_PATH}"
  }
}
```

### 上書き可能な環境変数

以下の環境変数は、設定ファイルの値を上書きします:

| 環境変数 | 設定項目 | 説明 |
|---------|---------|------|
| `MILVUS_ADDRESS` | `milvus.address` | Milvusサーバーアドレス |
| `MILVUS_TOKEN` | `milvus.token` | Milvus認証トークン |
| `MODEL_PATH` | `embedding.modelPath` | ONNXモデルファイルパス |
| `TOKENIZER_PATH` | `embedding.tokenizerPath` | トークナイザーファイルパス |
| `BM25_DB_PATH` | `bm25.dbPath` | BM25 SQLiteデータベースパス |

### 環境変数の設定方法

#### Linux/macOS

```bash
# ~/.bashrc または ~/.zshrc に追加
export MILVUS_ADDRESS="localhost:19530"
export MODEL_PATH="./models/all-MiniLM-L6-v2.onnx"
export TOKENIZER_PATH="./models/tokenizer.json"
export BM25_DB_PATH="./data/bm25_index.db"

# Zilliz Cloudを使用する場合
export MILVUS_TOKEN="your-zilliz-token"

# 反映
source ~/.bashrc
```

#### Windows (PowerShell)

```powershell
# 永続的に設定
[System.Environment]::SetEnvironmentVariable('MILVUS_ADDRESS', 'localhost:19530', 'User')
[System.Environment]::SetEnvironmentVariable('MODEL_PATH', './models/all-MiniLM-L6-v2.onnx', 'User')
[System.Environment]::SetEnvironmentVariable('TOKENIZER_PATH', './models/tokenizer.json', 'User')
[System.Environment]::SetEnvironmentVariable('BM25_DB_PATH', './data/bm25_index.db', 'User')
```

## 設定例集

### 最小構成（すべてデフォルト）

```json
{}
```

この設定は以下と同等です:
- Milvus: `localhost:19530`
- モデル: `./models/all-MiniLM-L6-v2.onnx`
- BM25 DB: `./data/bm25_index.db`
- ハイブリッドalpha: `0.3`

### 標準構成（ローカルMilvus）

```json
{
  "milvus": {
    "address": "localhost:19530"
  },
  "embedding": {
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json",
    "batchSize": 32
  },
  "indexing": {
    "batchSize": 32,
    "maxParallel": 8
  }
}
```

### 高性能構成（大規模プロジェクト）

```json
{
  "milvus": {
    "address": "localhost:19530",
    "shardNum": 4
  },
  "embedding": {
    "modelPath": "./models/all-mpnet-base-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json",
    "batchSize": 64
  },
  "bm25": {
    "dbPath": "./data/bm25_index.db",
    "k1": 1.2,
    "b": 0.75
  },
  "indexing": {
    "batchSize": 64,
    "maxParallel": 16,
    "dimension": 768
  },
  "hybrid": {
    "alpha": 0.3,
    "bm25TopK": 50,
    "vectorTopK": 50
  }
}
```

### Zilliz Cloud構成

```json
{
  "milvus": {
    "address": "your-instance.zillizcloud.com:19530",
    "token": "${MILVUS_TOKEN}",
    "shardNum": 2
  },
  "embedding": {
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json"
  },
  "indexing": {
    "collectionName": "my_project_vectors"
  }
}
```

### セマンティック検索重視

```json
{
  "hybrid": {
    "alpha": 0.2,
    "normalization": "MinMax",
    "bm25TopK": 20,
    "vectorTopK": 30
  }
}
```

### キーワード検索重視

```json
{
  "hybrid": {
    "alpha": 0.7,
    "normalization": "MinMax",
    "bm25TopK": 30,
    "vectorTopK": 20
  },
  "bm25": {
    "k1": 2.0,
    "b": 0.75
  }
}
```

### 低メモリ環境

```json
{
  "embedding": {
    "batchSize": 16,
    "maxLength": 128
  },
  "indexing": {
    "batchSize": 16,
    "maxParallel": 4
  },
  "hybrid": {
    "bm25TopK": 10,
    "vectorTopK": 10
  }
}
```

## 設定の検証

設定ファイルは起動時に自動的に検証されます。以下の検証が行われます:

### 検証項目

1. **alpha**: 0.0 から 1.0 の範囲内であること
2. **bm25.k1**: 正の値であること
3. **bm25.b**: 0.0 から 1.0 の範囲内であること
4. **normalization**: `"MinMax"`, `"ZScore"`, `"None"` のいずれかであること
5. **indexing.batchSize**: 1以上であること
6. **indexing.maxParallel**: 1以上であること
7. **indexing.dimension**: 1以上であること

### デフォルト設定の保存

デフォルト設定をファイルとして保存するには:

```bash
# Rust実装でデフォルト設定を生成（将来的に実装予定）
# context-mcp init --save-config
```

または、以下のデフォルト設定をコピーしてください:

```json
{
  "milvus": {
    "address": "localhost:19530",
    "token": null,
    "shardNum": 2
  },
  "embedding": {
    "modelPath": "./models/all-MiniLM-L6-v2.onnx",
    "tokenizerPath": "./models/tokenizer.json",
    "maxLength": 256,
    "batchSize": 32
  },
  "bm25": {
    "dbPath": "./data/bm25_index.db",
    "k1": 1.5,
    "b": 0.75
  },
  "indexing": {
    "batchSize": 32,
    "maxParallel": 8,
    "collectionName": "code_vectors",
    "dimension": 384
  },
  "hybrid": {
    "alpha": 0.3,
    "normalization": "MinMax",
    "bm25TopK": 20,
    "vectorTopK": 20
  }
}
```

## トラブルシューティング

### 設定ファイルが読み込まれない

1. ファイル名が `.context-mcp.json` であることを確認
2. JSON形式が正しいことを確認（JSONバリデータを使用）
3. ファイルの配置場所を確認（カレントディレクトリまたはホームディレクトリ）
4. ログ出力を確認してエラーメッセージを確認

### 設定値が反映されない

1. 環境変数が設定値を上書きしていないか確認
2. 設定ファイルのフィールド名が正しいか確認（camelCase形式）
3. デフォルト値が使用されていないか確認

### Milvusに接続できない

1. Milvusサーバーが起動しているか確認: `docker-compose ps`
2. アドレスとポートが正しいか確認
3. ネットワーク設定を確認
4. Zilliz Cloudの場合、トークンが正しいか確認

## 参考資料

- [セットアップガイド](SETUP.md)
- [アーキテクチャドキュメント](design.md)
- [Milvus公式ドキュメント](https://milvus.io/docs)
- [BM25アルゴリズム](https://en.wikipedia.org/wiki/Okapi_BM25)
