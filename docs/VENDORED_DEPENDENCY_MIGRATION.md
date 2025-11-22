# Vendored依存関係からGit Forkへの移行計画

## 概要

PR #17のレビューフィードバックを受けて、`vendor/milvus-patched`のvendored依存関係を、Git fork + `[patch.crates-io]`方式に移行する計画。

## 現状の問題

### 問題点
- **セキュリティリスク**: 上流のセキュリティパッチが自動適用されない
- **メンテナンス負担**: 手動でパッチを追跡・適用する必要がある
- **依存関係の透明性低下**: cargo-auditなどのツールが正常動作しない可能性
- **技術的負債**: 長期的なメンテナンスが困難

### 現在の実装
```toml
[dependencies.milvus]
path = "vendor/milvus-patched"
version = "0.2.0"
```

vendor/milvus-patchedディレクトリにローカルパッチを適用したMilvus SDKを配置。

## 推奨される解決策

### [patch.crates-io]方式

```toml
# Cargo.toml
[dependencies.milvus]
version = "0.2.0"

[patch.crates-io]
milvus = { git = "https://github.com/windschord/milvus-sdk-rust", branch = "fix/lifetime-bug" }
```

### この方式のメリット
- セキュリティ監査ツール (cargo-audit) が正常動作
- 上流の変更追跡が容易
- フォークをGitHubで管理し、PRを上流に送れる
- CI/CDでの依存関係の可視性が向上

## 実装計画

### Phase 1: Forkの作成とパッチの適用

#### Task 1.1: 元のリポジトリをFork
```bash
# GitHubでmilvus-io/milvus-sdk-rustをfork
# Fork先: windschord/milvus-sdk-rust
```

#### Task 1.2: パッチ用ブランチの作成
```bash
git clone https://github.com/windschord/milvus-sdk-rust.git
cd milvus-sdk-rust
git checkout -b fix/lifetime-bug
```

#### Task 1.3: vendor/milvus-patchedのパッチを適用
- `vendor/milvus-patched/src/data.rs:272`のlifetime修正を適用
- その他のパッチを確認して適用
- コミットメッセージに詳細な説明を記載

```bash
# パッチの内容を確認
cd /home/tsk/sync/git/lsp_mcp
diff -r vendor/milvus-patched/ <元のmilvus-0.2.0> > milvus_patches.diff

# Forkに適用
cd milvus-sdk-rust
git apply /path/to/milvus_patches.diff
git commit -m "fix: Apply lifetime bug fixes for Rust compilation

- Fix lifetime parameter in data.rs:272
- Ensure compatibility with rustc 1.XX
- Resolves compilation errors in context-mcp project"
```

#### Task 1.4: Forkをプッシュ
```bash
git push origin fix/lifetime-bug
```

**所要時間**: 60分
**リスク**: 低 (パッチの内容確認と適用)

### Phase 2: Cargo.tomlの更新

#### Task 2.1: 依存関係の変更
```toml
# 変更前
[dependencies.milvus]
path = "vendor/milvus-patched"
version = "0.2.0"

# 変更後
[dependencies.milvus]
version = "0.2.0"

[patch.crates-io]
milvus = { git = "https://github.com/windschord/milvus-sdk-rust", branch = "fix/lifetime-bug" }
```

**所要時間**: 5分
**リスク**: 低

#### Task 2.2: vendor/milvus-patchedの削除
```bash
git rm -rf vendor/milvus-patched
```

**所要時間**: 2分
**リスク**: 低

### Phase 3: ビルドとテスト

#### Task 3.1: 依存関係の再構築
```bash
cargo clean
cargo update
cargo build
```

**期待結果**: ビルド成功
**所要時間**: 10分
**リスク**: 低

#### Task 3.2: テストの実行
```bash
cargo test --lib
```

**期待結果**: 全テストパス
**所要時間**: 15分
**リスク**: 低

### Phase 4: 上流へのPR提出

#### Task 4.1: 上流リポジトリへのPR作成
- milvus-io/milvus-sdk-rustにPRを提出
- パッチの必要性と内容を説明
- コミュニティのフィードバックを待つ

**所要時間**: 30分
**リスク**: 中 (上流の受け入れ状況に依存)

#### Task 4.2: 上流のレビュー対応
- PRのレビューコメントに対応
- 必要に応じてコミットを修正

**所要時間**: 可変 (数日〜数週間)
**リスク**: 中

### Phase 5: ドキュメント更新

#### Task 5.1: README.mdの更新
- 依存関係の変更を記載
- Forkの使用理由を説明

#### Task 5.2: 本ドキュメントのステータス更新
- 移行完了をマーク

**所要時間**: 15分
**リスク**: 低

## 所要時間の見積もり

| Phase | タスク数 | 所要時間 | リスク |
|-------|---------|---------|--------|
| Phase 1: Forkの作成とパッチ適用 | 4 | 60分 | 低 |
| Phase 2: Cargo.toml更新 | 2 | 7分 | 低 |
| Phase 3: ビルドとテスト | 2 | 25分 | 低 |
| Phase 4: 上流へのPR提出 | 2 | 30分 + 可変 | 中 |
| Phase 5: ドキュメント更新 | 2 | 15分 | 低 |
| **合計 (初期作業)** | **12** | **約2時間** | **低〜中** |

**注**: Phase 4の上流レビュー対応は、コミュニティの反応次第で数日〜数週間かかる可能性があります。

## 優先度と実施タイミング

### 優先度: High

レビューコメントで「マージ前に必須」とされていますが、以下の理由により段階的な対応を推奨します:

1. **短期対応** (本PR):
   - vendored依存関係の使用理由を文書化 (本ドキュメント)
   - 移行計画をIssueとして起票
   - レビュアーに計画を共有し、次回PRでの対応を合意

2. **中期対応** (次回PR):
   - Forkの作成とパッチ適用
   - [patch.crates-io]への移行
   - 上流へのPR提出

### 実施タイミング

**Option A: 本PRでの実施**
- メリット: レビュー指摘に即座に対応
- デメリット: PRのスコープが広がり、レビューが複雑化

**Option B: 次回PRでの実施 (推奨)**
- メリット: PRのスコープを限定、段階的な移行
- デメリット: 完全な対応まで時間がかかる

**推奨**: Option B

## 成功基準

✅ **必須条件**:
1. Forkが正常に作成され、パッチが適用されている
2. `cargo build --release`が成功
3. 全テストがパス
4. cargo-auditが正常動作

✅ **推奨条件**:
1. 上流へのPR提出が完了
2. 依存関係の変更がREADME.mdに記載

## リスク管理

### 低リスク項目
- Forkの作成とパッチ適用
- Cargo.tomlの更新
- ビルドとテスト

### 中リスク項目
- 上流へのPR提出とレビュー対応
  - 対策: フォークを維持し、上流がマージするまで独自ブランチを使用

## ロールバック計画

万が一移行に失敗した場合:

```bash
# 1. Cargo.tomlを復元
git checkout HEAD Cargo.toml

# 2. vendor/milvus-patchedを復元
git checkout HEAD vendor/milvus-patched

# 3. 再ビルド
cargo clean
cargo build
```

**ロールバック所要時間**: 5分

## 次のステップ

### 本PRでの対応
- [x] 本ドキュメントの作成
- [ ] GitHubでIssueを起票 (タイトル: "Migrate from vendored milvus to Git fork + [patch.crates-io]")
- [ ] レビュアーに計画を共有

### 次回PRでの対応
- [ ] Phase 1-5の実施
- [ ] ドキュメント更新
- [ ] PRの作成とマージ

## 参考資料

- [The Cargo Book - Overriding Dependencies](https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html)
- [PR #17 Review Comment](https://github.com/windschord/context-mcp/pull/17#issuecomment-3565505457)
- vendor/milvus-patched/README.md
