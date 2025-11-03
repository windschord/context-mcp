# 設計変更: Milvusのみのサポートに変更

## 変更の概要

コードベースの削減とメンテナンス性向上のため、ベクターDBのサポートをMilvus standaloneのみに絞ります。

## 変更内容

### 削除するもの
- ❌ Chromaプラグイン（`src/storage/chroma-plugin.ts`）
- ❌ Chromaに関するドキュメント記述
- ❌ Chromaに関する設定オプション
- ❌ Chromaに関するテストコード
- ❌ chromadb npm依存関係

### 保持するもの
- ✅ Milvus standalone（ローカルモード）
- ✅ Zilliz Cloud（クラウドモード）
- ✅ VectorStorePluginインターフェース（将来の拡張性のため）

## 理由

1. **Chromaの問題点**:
   - ChromaDBのJavaScriptクライアントは、実際にはPython製のChromaDBサーバーと通信する
   - "Docker不要"と謳っていたが、実際にはPythonのchromaサーバーが必要
   - これではMilvus standaloneとほとんど変わらない複雑さ

2. **Milvus standaloneの利点**:
   - Docker Composeで簡単に起動可能
   - 高性能で安定している
   - Zilliz Cloudへの移行パスがスムーズ
   - 公式ドキュメントが充実

3. **コードベース削減**:
   - Chromaプラグインとそのテストを削除することで、コード量を削減
   - メンテナンスコストを削減
   - ドキュメントの複雑さを軽減

## 新しいモード構成

### ローカルモード
- **ベクターDB**: Milvus standalone（Docker Compose）
- **埋め込み**: Transformers.js（ローカル）
- **必要環境**: Docker & Docker Compose

### クラウドモード
- **ベクターDB**: Zilliz Cloud
- **埋め込み**: OpenAI API / VoyageAI API
- **必要環境**: インターネット接続

## 修正対象ドキュメント

### 要件定義
- [ ] docs/requirements.md
  - REQ-026: Chromaを削除、Milvus standaloneに変更
  - NFR-011: Chromaを削除
  - NFR-018: Chromaを削除
  - オプション依存関係セクション

### 設計書
- [ ] docs/design.md
  - ベクターDBセクション
  - プラグインアーキテクチャセクション

### ユーザードキュメント
- [ ] README.md
  - インストール手順
  - クイックスタート
  - 設定例
- [ ] docs/SETUP.md
  - セットアップ手順（軽量モードを削除）
  - モード選択フローチャート
- [ ] docs/CONFIGURATION.md
  - 設定例
  - vectorStoreセクション
- [ ] docs/CLAUDE_CODE_INTEGRATION.md
  - MCP設定例

### アーキテクチャドキュメント
- [ ] docs/ARCHITECTURE.md
  - Storage Layerセクション
- [ ] docs/PLUGIN_DEVELOPMENT.md
  - プラグイン開発ガイド（将来の拡張用として保持）

### その他
- [ ] docs/TROUBLESHOOTING.md
- [ ] docs/tasks.md（タスク3.3の記述）
- [ ] docs/security-checklist.md

### package.json
- [ ] chromadb依存関係を削除

## コード修正（後で実施）

### 削除するファイル
- src/storage/chroma-plugin.ts
- tests/storage/chroma-plugin.test.ts

### 修正するファイル
- src/storage/index.ts（エクスポートからChromaPluginを削除）
- src/config/types.ts（vectorStore.backendからchromaを削除）
- package.json（chromadb依存関係を削除）

## ユーザーへの影響

- **影響を受けるユーザー**: Docker環境がないユーザー
- **代替案**: Docker Desktopをインストール（Windows/Mac）、またはDocker Engine（Linux）
- **移行パス**: 既存のChromaユーザーは、Milvus standaloneへの移行が必要

## まとめ

この変更により：
- ✅ コードベースが簡潔になる
- ✅ メンテナンスが容易になる
- ✅ ドキュメントが明確になる
- ⚠️ Docker必須になるが、ほとんどの開発環境にはDockerがある
- ✅ Milvusの安定性と性能を活用できる
