import type BetterSqlite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * BM25パラメータ
 */
export interface BM25Params {
  /** ターム頻度の飽和度を制御 (デフォルト: 1.5) */
  k1: number;
  /** ドキュメント長の正規化を制御 (デフォルト: 0.75) */
  b: number;
}

/**
 * 検索結果
 */
export interface SearchResult {
  /** ドキュメントID */
  documentId: string;
  /** BM25スコア */
  score: number;
}

/**
 * 転置インデックスのエントリ
 */
export interface InvertedIndexEntry {
  /** ドキュメントID */
  documentId: string;
  /** ターム出現頻度 */
  frequency: number;
  /** ターム出現位置の配列 */
  positions: number[];
}

/**
 * ドキュメント統計
 */
export interface DocumentStats {
  /** 総ドキュメント数 */
  totalDocuments: number;
  /** 平均ドキュメント長 */
  averageDocumentLength: number;
}

/**
 * 英語の一般的なストップワード
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'this',
  'to',
  'was',
  'will',
  'with',
]);

/**
 * BM25全文検索エンジン
 */
export class BM25Engine {
  private db: BetterSqlite3.Database | null = null;
  private params: BM25Params;
  private isInitialized = false;

  /**
   * BM25エンジンを初期化
   * @param dbPath SQLiteデータベースファイルのパス
   * @param params BM25パラメータ（デフォルト: k1=1.5, b=0.75）
   */
  constructor(
    private dbPath: string,
    params?: Partial<BM25Params>,
  ) {
    this.params = {
      k1: params?.k1 ?? 1.5,
      b: params?.b ?? 0.75,
    };
  }

  /**
   * データベースを初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    // データベース接続
    this.db = new Database(this.dbPath);

    // テーブル作成
    this.createTables();

    this.isInitialized = true;
  }

  /**
   * データベーステーブルを作成
   */
  private createTables(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 転置インデックステーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inverted_index (
        term TEXT NOT NULL,
        document_id TEXT NOT NULL,
        frequency INTEGER NOT NULL,
        positions TEXT NOT NULL,
        PRIMARY KEY (term, document_id)
      )
    `);

    // ドキュメント統計テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_stats (
        document_id TEXT PRIMARY KEY,
        length INTEGER NOT NULL
      )
    `);

    // インデックス作成
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_term ON inverted_index(term);
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_document ON inverted_index(document_id);
    `);
  }

  /**
   * テキストをトークン化
   * @param text 入力テキスト
   * @returns トークンの配列
   */
  tokenize(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // 小文字化して記号を分割
    const tokens = text
      .toLowerCase()
      .split(/[\s\-_@.,:;!?(){}[\]<>/\\|"'`~]+/)
      .filter((token) => token.length > 0)
      .filter((token) => !STOP_WORDS.has(token));

    return tokens;
  }

  /**
   * ドキュメントをインデックス化
   * @param documentId ドキュメントID
   * @param content ドキュメント内容
   */
  async indexDocument(documentId: string, content: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 既存のインデックスを削除
    await this.deleteDocument(documentId);

    const tokens = this.tokenize(content);
    const termFrequency = new Map<string, { freq: number; positions: number[] }>();

    // ターム頻度と位置を計算
    tokens.forEach((token, index) => {
      const entry = termFrequency.get(token) ?? { freq: 0, positions: [] };
      entry.freq++;
      entry.positions.push(index);
      termFrequency.set(token, entry);
    });

    // トランザクション開始
    const insertTerm = this.db.prepare(`
      INSERT OR REPLACE INTO inverted_index (term, document_id, frequency, positions)
      VALUES (?, ?, ?, ?)
    `);

    const insertStats = this.db.prepare(`
      INSERT OR REPLACE INTO document_stats (document_id, length)
      VALUES (?, ?)
    `);

    const transaction = this.db.transaction(() => {
      // 転置インデックスに追加
      for (const [term, data] of termFrequency) {
        insertTerm.run(term, documentId, data.freq, JSON.stringify(data.positions));
      }

      // ドキュメント統計を記録
      insertStats.run(documentId, tokens.length);
    });

    transaction();
  }

  /**
   * BM25検索を実行
   * @param query 検索クエリ
   * @param topK 取得する上位結果数
   * @returns 検索結果の配列
   */
  async search(query: string, topK: number): Promise<SearchResult[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const stats = await this.getDocumentStats();
    if (stats.totalDocuments === 0) {
      return [];
    }

    const scores = new Map<string, number>();

    // 各クエリタームについてBM25スコアを計算
    for (const term of queryTokens) {
      const docs = this.getTermDocuments(term);

      if (docs.length === 0) {
        continue;
      }

      // IDF計算
      const idf = this.calculateIDF(docs.length, stats.totalDocuments);

      // 各ドキュメントのスコアを計算
      for (const doc of docs) {
        const docLength = this.getDocumentLength(doc.documentId);
        const tf = doc.frequency;

        // BM25スコア計算
        const score =
          idf *
          ((tf * (this.params.k1 + 1)) /
            (tf + this.params.k1 * (1 - this.params.b + this.params.b * (docLength / stats.averageDocumentLength))));

        const currentScore = scores.get(doc.documentId) ?? 0;
        scores.set(doc.documentId, currentScore + score);
      }
    }

    // スコアでソート
    const results = Array.from(scores.entries())
      .map(([documentId, score]) => ({ documentId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  /**
   * IDF（逆文書頻度）を計算
   * @param docFreq タームを含むドキュメント数
   * @param totalDocs 総ドキュメント数
   * @returns IDF値
   */
  private calculateIDF(docFreq: number, totalDocs: number): number {
    return Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }

  /**
   * タームを含むドキュメントを取得
   * @param term 検索タームterm
   * @returns ドキュメント情報の配列
   */
  private getTermDocuments(term: string): Array<{ documentId: string; frequency: number }> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT document_id, frequency
      FROM inverted_index
      WHERE term = ?
    `);

    const rows = stmt.all(term) as Array<{ document_id: string; frequency: number }>;
    return rows.map((row) => ({
      documentId: row.document_id,
      frequency: row.frequency,
    }));
  }

  /**
   * ドキュメント長を取得
   * @param documentId ドキュメントID
   * @returns ドキュメント長
   */
  private getDocumentLength(documentId: string): number {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT length
      FROM document_stats
      WHERE document_id = ?
    `);

    const row = stmt.get(documentId) as { length: number } | undefined;
    return row?.length ?? 0;
  }

  /**
   * ドキュメント統計を取得
   * @returns ドキュメント統計
   */
  async getDocumentStats(): Promise<DocumentStats> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count, AVG(length) as avgLength
      FROM document_stats
    `);

    const row = stmt.get() as { count: number; avgLength: number | null } | undefined;

    return {
      totalDocuments: row?.count ?? 0,
      averageDocumentLength: row?.avgLength ?? 0,
    };
  }

  /**
   * 転置インデックスを取得（テスト用）
   * @param term タームterm
   * @returns インデックスエントリ
   */
  async getInvertedIndex(term: string): Promise<InvertedIndexEntry | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT document_id, frequency, positions
      FROM inverted_index
      WHERE term = ?
      LIMIT 1
    `);

    const row = stmt.get(term) as { document_id: string; frequency: number; positions: string } | undefined;

    if (!row) {
      return null;
    }

    return {
      documentId: row.document_id,
      frequency: row.frequency,
      positions: JSON.parse(row.positions),
    };
  }

  /**
   * ドキュメントを削除
   * @param documentId ドキュメントID
   */
  async deleteDocument(documentId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction(() => {
      this.db!.prepare(`DELETE FROM inverted_index WHERE document_id = ?`).run(documentId);
      this.db!.prepare(`DELETE FROM document_stats WHERE document_id = ?`).run(documentId);
    });

    transaction();
  }

  /**
   * すべてのインデックスをクリア
   */
  async clearIndex(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const transaction = this.db.transaction(() => {
      this.db!.exec('DELETE FROM inverted_index');
      this.db!.exec('DELETE FROM document_stats');
    });

    transaction();
  }

  /**
   * データベース接続を閉じる
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}
