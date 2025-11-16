# コンパイルエラー分析レポート

## 実行日時
2025-11-16

## エラー統計
- **総エラー数**: 136個
- **警告数**: 12個
- **ブロッカー**: 3個（高優先度）

---

## 問題分類

### 🔴 ブロッカー1: rusqlite Send/Syncの問題（最重要）

**影響範囲**: BM25Engine、HybridSearchEngine、ContextMcpServer全体

**根本原因**:
- `rusqlite::Connection`は`RefCell`を内部で使用
- `RefCell`は`Sync`トレイトを実装していない
- マルチスレッド環境（tokio）で使用できない

**エラーメッセージ**:
```
error[E0277]: `RefCell<rusqlite::inner_connection::InnerConnection>` cannot be shared between threads safely
    = help: within `HybridSearchEngine`, the trait `Sync` is not implemented for `RefCell<...>`
    = note: if you want to do aliasing and mutation between multiple threads, use `std::sync::RwLock` instead
```

**影響を受けるコンポーネント**:
- `BM25Engine` (src/search/bm25_engine.rs:31)
- `HybridSearchEngine` (src/search/hybrid_engine.rs:52)
- `ContextMcpServer` (src/server/mod.rs:26)

**根本解決策**:
1. **オプションA**: rusqlite ConnectionをMutexでラップ
2. **オプションB**: BM25Engineを別プロセス/スレッドに分離
3. **オプションC**: 他のSQL DBライブラリに変更（例: sqlx、tokio-rusqlite）

---

### 🔴 ブロッカー2: rmcp toolマクロの構文エラー（19箇所）

**根本原因**:
- rmcp v0.8の`#[tool]`マクロが`#[tool(schema(...))]`構文をサポートしていない
- パラメータの記述方法が変更された

**エラーメッセージ**:
```
error: expected non-macro attribute, found attribute macro `tool`
   --> src/server/mod.rs:229:11
229 |         #[tool(schema(description = "Root path of the project to index"))] root_path: String,
    |           ^^^^ not a non-macro attribute
```

**影響箇所**:
- index_project: 5パラメータ
- search_code: 5パラメータ
- get_symbol: 3パラメータ
- find_related_docs: 3パラメータ
- get_index_status: 1パラメータ
- clear_index: 2パラメータ

**根本解決策**:
rmcp v0.8の正しい構文に修正する必要がある

---

### 🔴 ブロッカー3: エラー型の不一致

**根本原因**:
- rmcp v0.8は`McpError`（= `ErrorData`）を期待
- 私たちは`ContextMcpError`を使用
- 型の互換性がない

**エラーメッセージ**:
```
error[E0271]: expected `impl Future<Output = Result<CallToolResult, ContextMcpError>>`
              to be a future that resolves to `Result<CallToolResult, ErrorData>`,
              but it resolves to `Result<CallToolResult, ContextMcpError>`
```

**根本解決策**:
1. `ContextMcpError`を`ErrorData`に変換する実装を追加
2. または`McpError`を直接使用

---

### 🟡 中優先度: Milvus API変更（12箇所以上）

**問題1**: FieldColumnのコンストラクタが存在しない
```
error[E0599]: no function or associated item named `new_varchar` found for struct `FieldColumn<'a>`
```

**問題2**: Clientのメソッドが見つからない
```
error[E0599]: no method named `insert` found for struct `Arc<Client>`
error[E0599]: no method named `search` found for struct `Arc<Client>`
error[E0599]: no method named `load_collection` found for struct `Arc<Client>`
```

**問題3**: インポートエラー
```
error[E0432]: unresolved import `milvus::collection::ParamValue`
error[E0432]: unresolved import `milvus::index`
```

**問題4**: FieldSchemaにメソッドが存在しない
```
error[E0599]: no method named `with_description` found for struct `milvus::schema::FieldSchema<'a>`
```

**根本原因**:
- ローカルにパッチしたmilvus v0.2.0のAPIが、期待されるAPIと異なる
- パッチ版と公式版でAPIが変更されている

**根本解決策**:
Milvus crateのAPIドキュメントを確認し、正しいAPIに修正

---

### 🟡 中優先度: ort（ONNX Runtime）API変更（3箇所）

**問題1**: Valueのインポート
```
error[E0433]: failed to resolve: use of undeclared type `Value`
help: consider importing one of these items
  1 + use ort::value::Value;
```

**問題2**: try_extractメソッドが存在しない
```
error[E0599]: no method named `try_extract` found for reference `&ort::value::Value`
help: there is a method `try_extract_map` with a similar name
```

**問題3**: SessionOutputs::getの引数型
```
error[E0277]: the trait bound `{integer}: AsRef<str>` is not satisfied
note: required by a bound in `SessionOutputs::<'r>::get`
```

**根本解決策**:
ort v2.0.0-rc.10の正しいAPIに修正

---

### 🟢 低優先度: その他の型不一致（23箇所）

- ジェネリクスの不一致
- 関数引数の不一致
- プライベートモジュールへのアクセス

---

## 推奨解決順序

### フェーズ1: 基盤修正（ブロッカー解決）
1. **Task A**: rusqlite Send/Sync問題の解決
2. **Task B**: rmcp toolマクロ構文の修正
3. **Task C**: エラー型の統一

### フェーズ2: API更新
4. **Task D**: Milvus API更新
5. **Task E**: ort API更新

### フェーズ3: 細部修正
6. **Task F**: 型不一致の修正
7. **Task G**: 警告の修正

---

## 詳細タスク定義

### Task A: rusqlite Send/Sync問題の解決

**方針**: Mutex/RwLockでConnectionをラップ

**変更箇所**:
1. `src/search/bm25_engine.rs`
   - `Connection`を`Arc<Mutex<Connection>>`に変更
   - 全メソッドでロック取得
2. `src/search/hybrid_engine.rs`
   - BM25Engineの変更に対応
3. `src/server/mod.rs`
   - ServerStateの変更に対応

**受入基準**:
- [ ] BM25EngineがSend + Syncを実装
- [ ] HybridSearchEngineがSend + Syncを実装
- [ ] ContextMcpServerがServerHandlerを実装可能

**推定工数**: 4時間

---

### Task B: rmcp toolマクロ構文の修正

**方針**: rmcp v0.8のドキュメントを確認し、正しい構文に修正

**調査事項**:
- rmcp v0.8の`#[tool]`マクロの正しい構文
- パラメータのスキーマ定義方法
- descriptionの記述方法

**変更箇所**:
- `src/server/mod.rs`の全6ツール（19パラメータ）

**受入基準**:
- [ ] 全toolマクロがコンパイル可能
- [ ] パラメータのdescriptionが正しく設定される

**推定工数**: 2時間

---

### Task C: エラー型の統一

**方針**: ContextMcpErrorからErrorDataへの変換実装

**変更箇所**:
1. `src/error.rs`
   - `From<ContextMcpError> for ErrorData`実装
2. `src/server/mod.rs`
   - エラーハンドリングの修正

**受入基準**:
- [ ] ContextMcpErrorがErrorDataに変換可能
- [ ] ServerHandlerの型制約を満たす

**推定工数**: 2時間

---

### Task D: Milvus API更新

**方針**: パッチ版milvusの実際のAPIに合わせる

**調査事項**:
- `FieldColumn`の実際のコンストラクタ
- `Client`の実際のメソッド
- `Collection`のジェネリクス

**変更箇所**:
- `src/storage/milvus_client.rs`全体

**受入基準**:
- [ ] 全Milvus操作がコンパイル可能
- [ ] insert、search、deleteが動作

**推定工数**: 6時間

---

### Task E: ort API更新

**方針**: ort v2.0.0-rc.10の正しいAPIに修正

**変更箇所**:
1. `src/embedding/engine.rs`
   - `Value`のインポート追加
   - `try_extract_map`使用
   - `SessionOutputs::get`を文字列で呼び出し

**受入基準**:
- [ ] 埋め込み生成が正常に動作

**推定工数**: 1時間

---

### Task F: 型不一致の修正

**変更箇所**:
- ジェネリクス引数の追加/削除
- 関数引数の型修正
- モジュールのpub化

**推定工数**: 3時間

---

### Task G: 警告の修正

**内容**:
- 未使用インポートの削除
- 未使用コードの削除
- 不要な括弧の削除

**推定工数**: 1時間

---

## 総推定工数

- **フェーズ1**: 8時間（ブロッカー）
- **フェーズ2**: 7時間（API更新）
- **フェーズ3**: 4時間（細部修正）

**合計**: 約19時間

---

## リスク

### 高リスク
1. **rusqliteの代替案が必要になる可能性**
   - Mutex/RwLockでも性能問題が発生する場合
   - 別のDBライブラリへの移行が必要

2. **rmcpの構文が大幅に変更されている可能性**
   - ドキュメント不足の場合、試行錯誤が必要
   - 最悪の場合、rmcpのバージョンダウングレード

### 中リスク
3. **Milvus APIの完全な変更**
   - パッチ版と公式版の大きな差異
   - 完全な書き直しが必要な可能性

---

## 推奨アプローチ

1. **段階的修正**: フェーズ1→2→3の順で実施
2. **並行作業**: Task B（rmcp構文）とTask A（rusqlite）を並行実施可能
3. **検証**: 各タスク完了後に`cargo check`で確認
4. **テスト**: フェーズ1完了後、基本的な統合テスト実施
