# Milvus SDK移行計画

## 概要

非公式`milvus v0.2.0`から公式`milvus-sdk-rust v0.1.0`への移行計画

**移行理由**: Milvus v2.6.4互換性問題（VarChar型エラー）の根本的解決

## 調査結果サマリー

### 公式milvus-sdk-rust v0.1.0の評価

✅ **互換性**: Milvus v2.6.4と完全互換
✅ **VarCharサポート**: `new_varchar()`, `new_primary_varchar()`完備
✅ **アクティブメンテナンス**: 最終更新2025年2月18日
✅ **プロダクション対応**: README明記
✅ **API品質**: ビルダーパターンで使いやすい
✅ **ビルド検証**: コンパイル成功確認済み

**リポジトリ**: https://github.com/milvus-io/milvus-sdk-rust
**バージョン**: v0.1.0
**ライセンス**: Apache License 2.0

## タスクブレイクダウン

### Phase 1: 依存関係の更新

#### Task 1.1: Cargo.tomlの更新

**作業内容**:
```toml
# 削除
[dependencies.milvus]
path = "vendor/milvus-patched"

# 追加
[dependencies.milvus]
git = "https://github.com/milvus-io/milvus-sdk-rust.git"
package = "milvus-sdk-rust"
```

**ファイル**: `/home/tsk/sync/git/lsp_mcp/Cargo.toml`
**所要時間**: 5分
**リスク**: 低

#### Task 1.2: vendor/milvus-patchedディレクトリの削除

**作業内容**:
```bash
git rm -rf vendor/milvus-patched
```

**ファイル**: `/home/tsk/sync/git/lsp_mcp/vendor/milvus-patched/`
**所要時間**: 2分
**リスク**: 低（削除のみ、ロールバック可能）

#### Task 1.3: 依存関係の再構築

**作業内容**:
```bash
cargo clean
cargo build
```

**期待される結果**: ビルドエラー発生（次フェーズで修正）
**所要時間**: 10分
**リスク**: 低

---

### Phase 2: milvus_client.rsの書き換え

#### Task 2.1: スキーマ定義の書き換え

**ファイル**: `/home/tsk/sync/git/lsp_mcp/src/storage/milvus_client.rs`

**変更箇所**: Line 39-61（SCHEMA定義）

**旧コード**:
```rust
const SCHEMA: &'static [schema::FieldSchema<'static>] = &[
    FieldSchema::new_primary_varchar(
        "id",
        Some("Unique identifier (file_path:line_start)"),
        false,
        256,
    ),
    FieldSchema::new_float_vector("vector", Some("Embedding vector"), DIMENSION),
    // ...
];
```

**新コード**:
```rust
fn create_schema() -> CollectionSchema {
    CollectionSchemaBuilder::new(
        COLLECTION_NAME,
        "Code vectors collection for semantic search",
    )
    .add_field(FieldSchema::new_primary_varchar(
        "id",
        "Unique identifier (file_path:line_start)",
        false,
        256,
    ))
    .add_field(FieldSchema::new_float_vector(
        "vector",
        "Embedding vector",
        DIMENSION as i64,
    ))
    .add_field(FieldSchema::new_varchar("project_id", "Project identifier", 128))
    .add_field(FieldSchema::new_varchar("file_path", "Source file path", 512))
    .add_field(FieldSchema::new_varchar("language", "Programming language", 32))
    .add_field(FieldSchema::new_varchar(
        "symbol_type",
        "Symbol type (function, class, etc.)",
        32,
    ))
    .add_field(FieldSchema::new_varchar("symbol_name", "Symbol name", 128))
    .add_field(FieldSchema::new_int64("line_start", "Start line number"))
    .add_field(FieldSchema::new_int64("line_end", "End line number"))
    .add_field(FieldSchema::new_varchar("snippet", "Code snippet", 2048))
    .add_field(FieldSchema::new_varchar("docstring", "Documentation string", 4096))
    .add_field(FieldSchema::new_varchar("metadata", "Additional metadata as JSON", 2048))
    .build()
    .expect("Failed to build collection schema")
}
```

**所要時間**: 30分
**リスク**: 中（ビルダーパターンへの変更、フィールド定義の移行）

#### Task 2.2: コレクション作成メソッドの書き換え

**変更箇所**: `ensure_collection()`メソッド（Line 73-120付近）

**旧コード**:
```rust
let collection = Collection::new(&self.client, COLLECTION_NAME);
if !collection.exists().await? {
    let schema = CollectionSchema::new(SCHEMA);
    collection.create(schema, None).await?;
}
```

**新コード**:
```rust
let collection_exists = self.client.has_collection(COLLECTION_NAME).await?;
if !collection_exists {
    let schema = create_schema();
    self.client.create_collection(schema, None).await?;
}
```

**所要時間**: 20分
**リスク**: 中

#### Task 2.3: insertメソッドの書き換え

**変更箇所**: `insert()`メソッド（Line 135-180付近）

**主要変更**:
- `FieldColumn::new()`の引数変更
- `client.insert()`のAPI変更確認

**所要時間**: 30分
**リスク**: 中（データ挿入ロジックの変更）

#### Task 2.4: searchメソッドの書き換え

**変更箇所**: `search()`メソッド（Line 220-280付近）

**主要変更**:
- `SearchOptions`の構築方法変更
- レスポンス構造の変更に対応

**所要時間**: 40分
**リスク**: 高（検索結果のパース処理を含む）

#### Task 2.5: その他のメソッド書き換え

**対象メソッド**:
- `delete_by_ids()` (Line 290付近)
- `clear_collection()` (Line 310付近)
- `drop_collection()` (Line 330付近)

**所要時間**: 20分
**リスク**: 低

---

### Phase 3: ビルドエラー修正

#### Task 3.1: 型エラーの修正

**作業内容**:
```bash
cargo build 2>&1 | tee build_errors.log
# エラーを1つずつ修正
```

**対象**:
- import文の修正（`use milvus::...`）
- 型名の変更（`schema::FieldSchema` → `FieldSchema`等）
- オプショナル引数の対応（`Some("desc")` → `"desc"`）

**所要時間**: 60分
**リスク**: 中（予期しないエラーの可能性）

#### Task 3.2: コンパイル成功確認

**作業内容**:
```bash
cargo build --lib
cargo build --bins
```

**期待結果**: エラーゼロ、警告のみ
**所要時間**: 10分
**リスク**: 低

---

### Phase 4: テストの更新

#### Task 4.1: 単体テストの修正

**対象ファイル**: `src/storage/milvus_client.rs`（tests module）

**主要変更**:
- モックデータの構造変更
- アサーション条件の更新

**所要時間**: 30分
**リスク**: 低

#### Task 4.2: 統合テスト（6個）の確認

**対象ファイル**: `src/server/tests.rs`

**テストケース**:
1. `test_server_full_initialization`
2. `test_index_project_real_integration`
3. `test_search_code_real_integration`
4. `test_get_symbol_real_integration`
5. `test_clear_index_real_integration`
6. `test_server_double_initialization`

**作業内容**:
- 新SDKでAPIが変わった部分を修正
- エラーメッセージの変化に対応

**所要時間**: 40分
**リスク**: 中

#### Task 4.3: ローカルテスト実行

**作業内容**:
```bash
# Milvus起動（別途）
cargo test --lib

# 統合テストは除外（CI環境で実行）
cargo test --lib -- --ignored
```

**期待結果**: 423個のテストがパス
**所要時間**: 15分
**リスク**: 中

---

### Phase 5: CI統合テストの実行

#### Task 5.1: CIでのテスト実行

**作業内容**:
```bash
git add .
git commit -m "feat: Migrate to official milvus-sdk-rust v0.1.0 for Milvus v2.6.4 compatibility"
git push origin feature/rust-migration
```

**GitHub Actions**: rust-ci.ymlのcoverageジョブが自動実行

**期待結果**:
- 435/438テスト成功 → 438/438テスト成功
- カバレッジ: 72.76% → 80%+

**所要時間**: 20分（CI実行時間）
**リスク**: 高（統合テストの成功が移行完了の証明）

#### Task 5.2: CI結果の確認と修正

**作業内容**:
- CI失敗時のログ確認
- エラー修正とプッシュ
- 再テスト

**所要時間**: 30分〜60分（失敗時）
**リスク**: 中

---

### Phase 6: ドキュメント更新とコミット

#### Task 6.1: ドキュメント更新

**対象ファイル**:
1. ✅ `docs/design.md` - 完了済み
2. `README.md` - Milvus SDKバージョン情報の更新
3. `docs/COVERAGE_ROADMAP.md` - フェーズ12.5完了のマーク

**所要時間**: 15分
**リスク**: 低

#### Task 6.2: 最終コミット

**作業内容**:
```bash
git add .
git commit -m "feat: Complete migration to milvus-sdk-rust v0.1.0

- Replace unofficial milvus v0.2.0 with official milvus-sdk-rust v0.1.0
- Fix Milvus v2.6.4 VarChar compatibility issue
- Update schema definition using CollectionSchemaBuilder
- Update all CRUD operations to new API
- All 438 tests passing (including 6 integration tests)
- Test coverage: 80%+ achieved in CI

Closes #XX (issue番号）
"
```

**所要時間**: 5分
**リスク**: 低

---

## 所要時間の見積もり

| Phase | タスク数 | 所要時間 | リスク |
|-------|---------|---------|--------|
| Phase 1: 依存関係更新 | 3 | 17分 | 低 |
| Phase 2: milvus_client.rs書き換え | 5 | 140分 | 中〜高 |
| Phase 3: ビルドエラー修正 | 2 | 70分 | 中 |
| Phase 4: テスト更新 | 3 | 85分 | 中 |
| Phase 5: CI統合テスト | 2 | 50分 | 高 |
| Phase 6: ドキュメント更新 | 2 | 20分 | 低 |
| **合計** | **17** | **約6時間** | **中** |

## リスク管理

### 高リスク項目

1. **Task 2.4: searchメソッドの書き換え**
   - 対策: 新SDKのexamplesを参考にする
   - ロールバック: 旧実装のバックアップを保持

2. **Task 5.1: CI統合テスト**
   - 対策: ローカルでMilvus v2.6.4環境を構築して事前テスト
   - ロールバック: feature branchのため、main branchは影響なし

### 中リスク項目

- **Task 2.1〜2.3**: API変更への対応
  - 対策: 公式ドキュメントと examples/ を詳細に確認
  - 段階的にコミット（各タスク完了時）

### 低リスク項目

- Phase 1, 6: 依存関係とドキュメント更新
  - 影響範囲が限定的で容易にロールバック可能

## 成功基準

✅ **必須条件**:
1. `cargo build --release`が成功
2. 全テスト（438個）がパス
3. CI coverageジョブが成功（80%+達成）
4. Milvus v2.6.4でVarCharエラーが解消

✅ **推奨条件**:
1. 警告ゼロ（可能な限り）
2. パフォーマンス劣化なし（検索速度等）
3. メモリ使用量の増加なし

## ロールバック計画

万が一移行に失敗した場合:

```bash
# 1. ブランチを元に戻す
git reset --hard <移行前のコミットハッシュ>

# 2. vendor/milvus-patchedを復元
git checkout HEAD vendor/milvus-patched

# 3. Cargo.tomlを復元
git checkout HEAD Cargo.toml

# 4. 再ビルド
cargo clean
cargo build
```

**ロールバック所要時間**: 10分

## 次のステップ

移行完了後:
1. フェーズ12完了のマーク（COVERAGE_ROADMAP.md更新）
2. PRのマージ（main branchへ）
3. リリースノート作成
4. ユーザーへの移行情報の通知（該当する場合）

## 参考資料

- 公式SDK: https://github.com/milvus-io/milvus-sdk-rust
- 調査結果: 本ドキュメントの前半部分
- 設計書: `docs/design.md` - 決定8
