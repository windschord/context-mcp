# 可観測性ガイド: OpenTelemetryによる監視

Context-MCPは、OpenTelemetryによる包括的な可観測性機能を提供します。トレース、メトリクス、ログの3つの観測シグナルを収集し、Jaeger、Prometheus、Grafanaなどの監視バックエンドと統合できます。

## 概要

### OpenTelemetryとは

OpenTelemetry (OTEL)は、ベンダー中立のオープンソース可観測性フレームワークです。Cloud Native Computing Foundation (CNCF)プロジェクトとして、業界標準として広く採用されています。

### 3つの観測シグナル

1. **トレース（Trace）**: リクエストの流れを追跡し、処理の詳細なタイムラインを可視化
2. **メトリクス（Metrics）**: システムの定量的な測定値（リクエスト数、レイテンシー、メモリ使用量等）
3. **ログ（Logs）**: エラーやイベントの詳細情報

### メリット

- **パフォーマンス最適化**: ボトルネックの特定と解決
- **エラー追跡**: エラー発生箇所と原因の迅速な特定
- **リソース管理**: メモリやCPU使用量の監視
- **SLA/SLO管理**: サービスレベルの測定と改善

## クイックスタート

### 1. テレメトリの有効化

最も簡単な方法は、環境変数でテレメトリを有効化することです。

```bash
# Claude CodeのMCP設定（claude_desktop_config.json）
{
  "mcpServers": {
    "context-mcp": {
      "command": "node",
      "args": ["path/to/context_mcp/dist/index.js"],
      "env": {
        "CONTEXT_MCP_TELEMETRY_ENABLED": "true",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
        "OTEL_SERVICE_NAME": "context-mcp"
      }
    }
  }
}
```

### 2. Jaeger/Prometheusのセットアップ

監視スタック全体を起動するには、提供されているDocker Composeファイルを使用します。

```bash
# 監視スタックの起動
docker-compose -f docs/observability-stack.yml up -d

# ステータス確認
docker-compose -f docs/observability-stack.yml ps

# ログ確認
docker-compose -f docs/observability-stack.yml logs -f
```

これにより以下のサービスが起動します:
- **Jaeger**: http://localhost:16686 (トレース可視化)
- **Prometheus**: http://localhost:9090 (メトリクス収集)
- **Grafana**: http://localhost:3000 (ダッシュボード)
- **OTLP Collector**: http://localhost:4317 (テレメトリ受信)

### 3. Context-MCPの起動

テレメトリ設定を有効にしてContext-MCPを起動します。

```bash
# 環境変数で設定
export CONTEXT_MCP_TELEMETRY_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Context-MCP起動
node dist/index.js
```

### 4. ダッシュボードへのアクセス

- **Jaeger UI**: http://localhost:16686
  - サービス名: `context-mcp`を選択
  - トレースを検索・可視化

- **Grafana**: http://localhost:3000
  - デフォルト認証情報: admin / admin
  - Prometheusデータソースは自動設定済み
  - サンプルダッシュボードをインポート: `docs/grafana-dashboard-sample.json`

## 設定ガイド

### 設定ファイル（.context-mcp.json）

`.context-mcp.json`の`telemetry`セクションで詳細な設定が可能です。

```json
{
  "telemetry": {
    "enabled": true,
    "serviceName": "context-mcp",
    "samplingRate": 0.1,
    "otlp": {
      "endpoint": "http://localhost:4317",
      "protocol": "grpc"
    },
    "exporters": {
      "traces": "otlp",
      "metrics": "otlp",
      "logs": "otlp"
    }
  }
}
```

#### 設定項目の説明

| 項目 | 型 | 説明 | デフォルト |
|------|------|------|-----------|
| `enabled` | boolean | テレメトリ機能の有効化 | `false` |
| `serviceName` | string | サービス名（Jaeger/Prometheus等で表示） | `"context-mcp"` |
| `samplingRate` | number | トレースサンプリングレート（0.0-1.0） | `0.1` (10%) |
| `otlp.endpoint` | string | OTLPエンドポイントURL | `"http://localhost:4317"` |
| `otlp.protocol` | string | OTLPプロトコル（grpc/http/protobuf） | `"grpc"` |
| `exporters.traces` | string | トレースエクスポーター（otlp/console/none） | `"none"` |
| `exporters.metrics` | string | メトリクスエクスポーター（otlp/console/none） | `"none"` |
| `exporters.logs` | string | ログエクスポーター（otlp/console/none） | `"none"` |

### 環境変数による設定

環境変数は設定ファイルより優先されます。

```bash
# テレメトリ有効化
export CONTEXT_MCP_TELEMETRY_ENABLED=true

# サービス名
export OTEL_SERVICE_NAME=context-mcp

# OTLPエンドポイント
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# エクスポーター設定
export OTEL_TRACES_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp

# サンプリングレート
export CONTEXT_MCP_TELEMETRY_SAMPLE_RATE=0.1
```

### 設定の優先順位

```
優先度（高）
  ↓
1. 環境変数（CONTEXT_MCP_TELEMETRY_ENABLED、OTEL_*等）
  ↓
2. 設定ファイル（.context-mcp.json）
  ↓
3. デフォルト設定
  ↓
優先度（低）
```

## 環境変数リファレンス

### OpenTelemetry標準環境変数

| 環境変数 | 説明 | 例 |
|---------|------|-----|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLPエンドポイントURL | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | OTLPプロトコル | `grpc` または `http/protobuf` |
| `OTEL_SERVICE_NAME` | サービス名 | `context-mcp` |
| `OTEL_TRACES_EXPORTER` | トレースエクスポーター | `otlp`, `console`, `none` |
| `OTEL_METRICS_EXPORTER` | メトリクスエクスポーター | `otlp`, `console`, `none` |
| `OTEL_LOGS_EXPORTER` | ログエクスポーター | `otlp`, `console`, `none` |

参考: [OpenTelemetry Environment Variable Specification](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)

### Context-MCPカスタム環境変数

| 環境変数 | 説明 | 例 |
|---------|------|-----|
| `CONTEXT_MCP_TELEMETRY_ENABLED` | テレメトリの有効化（true/false） | `true` |
| `CONTEXT_MCP_TELEMETRY_SAMPLE_RATE` | サンプリングレート（0.0-1.0） | `0.1` (10%) |

## Jaeger連携

### Jaegerのセットアップ（Docker Compose）

```bash
# Jaegerのみ起動
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 4317:4317 \
  -p 16686:16686 \
  jaegertracing/all-in-one:1.65.0

# Jaeger UI
open http://localhost:16686
```

または、`docs/observability-stack.yml`を使用します。

```bash
docker-compose -f docs/observability-stack.yml up -d
```

### トレース可視化の方法

1. **Jaeger UIにアクセス**: http://localhost:16686
2. **サービス選択**: "Service"ドロップダウンから`context-mcp`を選択
3. **検索条件設定**:
   - Operation: 特定のMCPツール（例: `search_code`）
   - Lookback: 過去1時間など
4. **Find Traces**: トレース一覧を表示
5. **トレース詳細**: トレースをクリックして詳細タイムラインを表示

### スパン情報の読み方

トレースは複数のスパンから構成されます。各スパンには以下の情報が含まれます:

- **Operation Name**: 処理名（例: `search_code`, `vectordb.query`）
- **Duration**: 処理時間（ミリ秒）
- **Tags/Attributes**: メタデータ（tool.name, query, file.path等）
- **Logs**: スパン内のイベントログ

スパンの階層構造により、どの処理がボトルネックかが一目で分かります。

## Grafana Tempo連携

Grafana Tempoは、Grafana Labs提供の分散トレーシングバックエンドです。

### Grafana Tempoのセットアップ

```bash
# Tempo起動（Docker）
docker run -d --name tempo \
  -p 4317:4317 \
  -p 3200:3200 \
  grafana/tempo:latest

# Grafanaでデータソース設定
# URL: http://tempo:3200
# Type: Tempo
```

### Grafana UIでのトレース表示

1. **Grafana UIにアクセス**: http://localhost:3000
2. **Explore画面**: 左メニューから"Explore"を選択
3. **データソース**: "Tempo"を選択
4. **Query**: Service nameに`context-mcp`、Operation nameを選択
5. **Run query**: トレース一覧を表示

Grafanaでは、トレースとメトリクスを同一画面で確認できるため、より高度な分析が可能です。

## Prometheus連携

### Prometheusのセットアップ

Prometheusは、OTLP Collector経由でメトリクスを収集します。

```bash
# Prometheus設定ファイル（prometheus.yml）
docker-compose -f docs/observability-stack.yml up -d prometheus
```

設定ファイルの詳細は`docs/prometheus-sample.yml`を参照してください。

### メトリクスのスクレイピング設定

Prometheusは、OTLP Collectorが公開するメトリクスエンドポイントからデータを取得します。

```yaml
# prometheus.yml（抜粋）
scrape_configs:
  - job_name: 'context-mcp'
    scrape_interval: 15s
    static_configs:
      - targets: ['otel-collector:8889']
```

### Grafanaでのダッシュボード作成

1. **Grafana UIにアクセス**: http://localhost:3000
2. **ダッシュボードインポート**:
   - 左メニュー > Dashboards > Import
   - `docs/grafana-dashboard-sample.json`をアップロード
3. **データソース選択**: Prometheusを選択
4. **Import完了**: Context-MCPメトリクスダッシュボードが表示

サンプルダッシュボードには以下が含まれます:
- リクエスト数（requests.total）
- リクエスト処理時間（requests.duration）
- エラー率（requests.errors / requests.total）
- インデックス統計（index.files, index.symbols）
- メモリ使用量（memory.usage）

## メトリクス一覧

### Counter（累積カウンター）

| メトリクス名 | 説明 | ラベル |
|------------|------|--------|
| `context_mcp.requests.total` | リクエスト総数 | `tool.name`: MCPツール名 |
| `context_mcp.requests.errors` | エラー発生回数 | `tool.name`: MCPツール名, `error.type`: エラータイプ |
| `context_mcp.vectordb.operations` | ベクターDB操作回数 | `operation.type`: 操作タイプ（insert, search, delete） |

### Histogram（分布記録）

| メトリクス名 | 説明 | ラベル | 単位 |
|------------|------|--------|------|
| `context_mcp.requests.duration` | リクエスト処理時間の分布 | `tool.name`: MCPツール名 | ms |
| `context_mcp.search.results` | 検索結果数の分布 | なし | 1 |

### Gauge（現在値）

| メトリクス名 | 説明 | ラベル | 単位 |
|------------|------|--------|------|
| `context_mcp.index.files` | インデックス済みファイル数 | なし | 1 |
| `context_mcp.index.symbols` | インデックス済みシンボル数 | なし | 1 |
| `context_mcp.memory.usage` | メモリ使用量（ヒープ） | なし | MB |

### メトリクスの利用例

**PromQLクエリ例**:

```promql
# リクエストレート（秒あたり）
rate(context_mcp_requests_total[5m])

# エラー率
rate(context_mcp_requests_errors[5m]) / rate(context_mcp_requests_total[5m])

# 平均リクエスト処理時間（P50, P95, P99）
histogram_quantile(0.50, rate(context_mcp_requests_duration_bucket[5m]))
histogram_quantile(0.95, rate(context_mcp_requests_duration_bucket[5m]))
histogram_quantile(0.99, rate(context_mcp_requests_duration_bucket[5m]))

# メモリ使用量
context_mcp_memory_usage
```

## トレース情報

### MCPツール呼び出しトレース

MCPツール（index_project, search_code等）が呼び出されると、トレーススパンが自動的に作成されます。

**スパン属性**:
- `tool.name`: MCPツール名
- `tool.params`: ツールパラメータ（JSON）
- `tool.duration`: 実行時間（ms）
- `tool.status`: 成功/失敗ステータス

### ベクターDB操作トレース

ベクターDB操作（検索、インデックス追加）のトレーススパンが記録されます。

**スパン属性**:
- `operation.type`: 操作タイプ（search, insert, delete）
- `operation.duration`: 処理時間（ms）
- `operation.status`: 成功/失敗ステータス
- `vectordb.collection`: コレクション名
- `vectordb.query.topK`: 検索結果数（検索時）

### AST解析トレース

Tree-sitterによるAST解析のトレーススパンが記録されます。

**スパン属性**:
- `language`: プログラミング言語（typescript, python等）
- `file.path`: ファイルパス
- `parse.duration`: 解析時間（ms）
- `parse.status`: 成功/失敗ステータス

### 埋め込み生成トレース

テキストの埋め込みベクトル生成のトレーススパンが記録されます。

**スパン属性**:
- `provider`: 埋め込みプロバイダー（transformers, openai等）
- `model`: モデル名
- `batch.size`: バッチサイズ
- `embed.duration`: 生成時間（ms）

### スパン属性の説明

トレーススパンには、処理の詳細を示す属性（Tags）が付与されます。Jaeger UIで各スパンをクリックすると、これらの属性を確認できます。

## ログ情報

### ログレベル

Context-MCPは、以下のログレベルをサポートします:

- **error**: エラー（重大な問題）
- **warn**: 警告（注意が必要な事象）
- **info**: 情報（通常の動作ログ）
- **debug**: デバッグ（詳細な処理フロー）

ログレベルは環境変数`LOG_LEVEL`で設定します。

```bash
export LOG_LEVEL=DEBUG
```

### ログ出力先

ログは以下の出力先に送信されます:

1. **Console**: 標準出力（常に有効）
2. **OTLP**: OpenTelemetry Logs Exporter（テレメトリ有効時）

### ログコンテキスト

OpenTelemetryログには、トレースコンテキスト（Trace ID、Span ID）が自動的に含まれます。これにより、ログとトレースを関連付けて分析できます。

## トラブルシューティング

### テレメトリが動作しない場合

**症状**: JaegerやPrometheusにデータが表示されない

**チェックポイント**:

1. **テレメトリ有効化の確認**:
   ```bash
   # 環境変数またはログで確認
   echo $CONTEXT_MCP_TELEMETRY_ENABLED
   # ログ出力: "OpenTelemetryテレメトリを初期化しました"
   ```

2. **OTLPエンドポイント接続確認**:
   ```bash
   # Jaeger/Collector起動確認
   docker ps | grep jaeger

   # ポート疎通確認
   nc -zv localhost 4317
   ```

3. **設定ファイルの確認**:
   ```bash
   # .context-mcp.jsonの内容確認
   cat .context-mcp.json
   ```

4. **ログ確認**:
   ```bash
   # エラーメッセージを確認
   grep -i "telemetry" context-mcp.log
   ```

### OTLPエンドポイント接続エラー

**エラーメッセージ**:
```
Error: Failed to export spans: connect ECONNREFUSED 127.0.0.1:4317
```

**原因と対処法**:

1. **JaegerまたはOTLP Collectorが起動していない**:
   ```bash
   # 監視スタック起動
   docker-compose -f docs/observability-stack.yml up -d
   ```

2. **ファイアウォールがポート4317をブロック**:
   ```bash
   # ポート開放（macOS）
   sudo pfctl -d

   # ポート確認
   lsof -i :4317
   ```

3. **エンドポイントURLが誤っている**:
   ```bash
   # 正しいURL形式
   export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
   # 誤り: https://localhost:4317（TLS未対応の場合）
   ```

### パフォーマンスへの影響

**症状**: テレメトリ有効化後にパフォーマンスが低下

**対処法**:

1. **サンプリングレートの調整**:
   ```bash
   # サンプリングを50%に減らす
   export CONTEXT_MCP_TELEMETRY_SAMPLE_RATE=0.5

   # サンプリングを1%に減らす（本番環境推奨）
   export CONTEXT_MCP_TELEMETRY_SAMPLE_RATE=0.01
   ```

2. **エクスポーター選択の最適化**:
   ```json
   // トレースとメトリクスのみ有効化（ログは無効）
   {
     "telemetry": {
       "exporters": {
         "traces": "otlp",
         "metrics": "otlp",
         "logs": "none"
       }
     }
   }
   ```

3. **バッチ処理設定の調整**:
   Context-MCPはデフォルトでバッチ処理を使用しますが、さらに調整したい場合はコードレベルでの変更が必要です（`TelemetryManager.ts`の`BatchSpanProcessor`設定）。

### サンプリング率の調整

サンプリングレートは、トレース収集の頻度を制御します。

- **開発環境**: `1.0`（全トレース収集）
- **ステージング環境**: `0.1`（10%収集）
- **本番環境**: `0.01`（1%収集）

高頻度な操作（例: 検索）では、サンプリングにより負荷を軽減できます。

### デバッグ方法

**コンソールエクスポーター使用**:

```bash
# トレースをコンソール出力
export OTEL_TRACES_EXPORTER=console
export CONTEXT_MCP_TELEMETRY_ENABLED=true

# Context-MCP起動
node dist/index.js
```

これにより、標準出力にトレースとメトリクスがJSON形式で出力されます。

## ベストプラクティス

### 本番環境でのサンプリング設定

本番環境では、低サンプリングレート（1-5%）を推奨します。

```bash
export CONTEXT_MCP_TELEMETRY_SAMPLE_RATE=0.01  # 1%
```

トラブルシューティング時に一時的にサンプリングレートを上げることも可能です。

### アラート設定の推奨事項

Prometheusアラートルールの例:

```yaml
# prometheus-alerts.yml
groups:
  - name: context-mcp
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(context_mcp_requests_errors[5m]) / rate(context_mcp_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Context-MCPのエラー率が5%を超えています"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(context_mcp_requests_duration_bucket[5m])) > 2000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Context-MCPのP95レイテンシーが2秒を超えています"

      - alert: HighMemoryUsage
        expr: context_mcp_memory_usage > 1500
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Context-MCPのメモリ使用量が1.5GBを超えています"
```

### ダッシュボードの構成例

Grafanaダッシュボードに以下のパネルを配置することを推奨します:

1. **リクエストレート**: `rate(context_mcp_requests_total[5m])`
2. **エラー率**: `rate(context_mcp_requests_errors[5m]) / rate(context_mcp_requests_total[5m])`
3. **レイテンシー分布**: P50, P95, P99（Histogramクエリ）
4. **メモリ使用量**: `context_mcp_memory_usage`
5. **インデックス統計**: `context_mcp_index_files`, `context_mcp_index_symbols`
6. **ベクターDB操作数**: `rate(context_mcp_vectordb_operations[5m])`

サンプルダッシュボード（`docs/grafana-dashboard-sample.json`）を参考にしてください。

## 参考リンク

### OpenTelemetry

- [OpenTelemetry公式サイト](https://opentelemetry.io/)
- [OpenTelemetry JavaScript/Node.js SDK](https://opentelemetry.io/docs/languages/js/)
- [Environment Variable Specification](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)

### Jaeger

- [Jaeger公式ドキュメント](https://www.jaegertracing.io/docs/)
- [Jaeger UI Guide](https://www.jaegertracing.io/docs/latest/frontend-ui/)

### Prometheus

- [Prometheus公式ドキュメント](https://prometheus.io/docs/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Recording Rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Alerting Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)

### Grafana

- [Grafana公式ドキュメント](https://grafana.com/docs/)
- [Grafana Tempo Documentation](https://grafana.com/docs/tempo/latest/)
- [Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)

### その他

- [CNCF OpenTelemetry Project](https://www.cncf.io/projects/opentelemetry/)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
