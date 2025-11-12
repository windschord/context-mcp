# Embedding Engine

ローカル埋め込みエンジン（Transformers.js）の実装

## 概要

LocalEmbeddingEngineは、Transformers.jsを使用したローカル実行可能な埋め込みエンジンです。
デフォルトモデルはall-MiniLM-L6-v2（384次元）で、完全オフライン動作が可能です。

## 特徴

- **完全ローカル実行**: 初回モデルダウンロード後は外部通信なし
- **プライバシー保護**: ユーザーコードを外部サーバーに送信しない
- **メモリ効率的**: シングルトンパターンでモデルインスタンスを再利用
- **バッチ処理サポート**: 複数テキストを効率的に処理

## インストール

```bash
npm install @xenova/transformers
```

## 基本的な使い方

```typescript
import { LocalEmbeddingEngine } from './src/embedding';

// エンジンの作成
const engine = new LocalEmbeddingEngine({
  modelName: 'Xenova/all-MiniLM-L6-v2',  // デフォルト
  cacheDir: './.context-mcp/models',          // デフォルト
  batchSize: 32                            // デフォルト
});

// 初期化（モデルのロード）
await engine.initialize();

// 単一テキストの埋め込み
const vector = await engine.embed('Hello, world!');
console.log(vector.length); // 384

// バッチ埋め込み
const texts = ['Text 1', 'Text 2', 'Text 3'];
const vectors = await engine.embedBatch(texts);
console.log(vectors.length); // 3

// リソースの解放
await engine.dispose();
```

## API

### `initialize(): Promise<void>`

エンジンを初期化します。モデルのロードを行います。
初回実行時はモデルがダウンロードされ、キャッシュディレクトリに保存されます。

### `embed(text: string): Promise<number[]>`

単一のテキストを埋め込みベクトルに変換します。

- **パラメータ**:
  - `text`: 埋め込み対象のテキスト
- **戻り値**: 埋め込みベクトル（384次元の数値配列）

### `embedBatch(texts: string[]): Promise<number[][]>`

複数のテキストをバッチで埋め込みベクトルに変換します。
バッチサイズで分割して処理することでメモリ効率を向上させています。

- **パラメータ**:
  - `texts`: 埋め込み対象のテキスト配列
- **戻り値**: 埋め込みベクトルの配列

### `getDimension(): number`

ベクトルの次元数を取得します。

- **戻り値**: 次元数（all-MiniLM-L6-v2の場合は384）

### `dispose(): Promise<void>`

モデルインスタンスを解放し、メモリをクリーンアップします。

## 設定オプション

### `LocalEmbeddingOptions`

```typescript
interface LocalEmbeddingOptions {
  /** モデル名（デフォルト: Xenova/all-MiniLM-L6-v2） */
  modelName?: string;
  /** モデルキャッシュディレクトリ（デフォルト: ./.context-mcp/models） */
  cacheDir?: string;
  /** バッチサイズ（デフォルト: 32） */
  batchSize?: number;
}
```

## モデルキャッシング

初回実行時、モデルは自動的にダウンロードされ、`cacheDir`に保存されます。
以降の実行ではキャッシュから読み込まれるため、外部通信は発生しません。

キャッシュディレクトリの構造:

```
.context-mcp/models/
└── models--Xenova--all-MiniLM-L6-v2/
    ├── config.json
    ├── tokenizer.json
    ├── model.onnx
    └── ...
```

## エラーハンドリング

```typescript
try {
  const engine = new LocalEmbeddingEngine();
  await engine.initialize();
  const vector = await engine.embed('test');
} catch (error) {
  if (error.message.includes('not initialized')) {
    // 初期化前にembedが呼ばれた
  } else if (error.message.includes('Failed to initialize')) {
    // モデルのロードに失敗
  }
}
```

## パフォーマンス

- **初回実行**: モデルダウンロード含めて数分（ネットワーク速度に依存）
- **2回目以降**: モデルロード数秒 + 埋め込み処理
- **埋め込み速度**: 約100テキスト/秒（CPU性能に依存）

## メモリ使用量

- **モデルサイズ**: 約90MB（all-MiniLM-L6-v2）
- **実行時メモリ**: 約200-300MB

## トラブルシューティング

### モデルのダウンロードに失敗する

- インターネット接続を確認してください
- プロキシ環境の場合、環境変数を設定してください
- キャッシュディレクトリの書き込み権限を確認してください

### メモリ不足エラー

- `batchSize`を小さくしてください（デフォルト: 32 → 16 or 8）
- 長いテキストを分割してください

### オフラインで動作しない

- 一度オンライン環境でモデルをダウンロードしてください
- キャッシュディレクトリが正しく設定されているか確認してください
