import { BM25Engine } from '../../src/storage/bm25-engine';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('BM25Engine', () => {
  let engine: BM25Engine;
  let testDbPath: string;

  beforeEach(async () => {
    // テスト用の一時データベースパスを作成
    testDbPath = path.join(process.cwd(), './tmp', `test-bm25-${Date.now()}.db`);
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    engine = new BM25Engine(testDbPath);
    await engine.initialize();
  });

  afterEach(async () => {
    await engine.close();
    // テストデータベースを削除
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  });

  describe('トークナイゼーション', () => {
    test('英文を正しくトークン化できる', () => {
      const text = 'Hello World! This is a test.';
      const tokens = engine.tokenize(text);
      expect(tokens).toEqual(['hello', 'world', 'test']);
    });

    test('記号と数字を適切に処理できる', () => {
      const text = 'function-name_123 test@email.com';
      const tokens = engine.tokenize(text);
      expect(tokens).toContain('function');
      expect(tokens).toContain('name');
      expect(tokens).toContain('123');
      expect(tokens).toContain('test');
      expect(tokens).toContain('email');
      expect(tokens).toContain('com');
    });

    test('ストップワードが除外される', () => {
      const text = 'the quick brown fox is at the park';
      const tokens = engine.tokenize(text);
      expect(tokens).not.toContain('the');
      expect(tokens).not.toContain('is');
      expect(tokens).not.toContain('at');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
      expect(tokens).toContain('park');
    });

    test('空文字列を処理できる', () => {
      const tokens = engine.tokenize('');
      expect(tokens).toEqual([]);
    });

    test('コードのトークン化が適切に行われる', () => {
      const code = 'function calculateTotal(price, tax) { return price + tax; }';
      const tokens = engine.tokenize(code);
      expect(tokens).toContain('function');
      expect(tokens).toContain('calculatetotal');
      expect(tokens).toContain('price');
      expect(tokens).toContain('tax');
      expect(tokens).toContain('return');
    });
  });

  describe('ドキュメントのインデックス化', () => {
    test('単一ドキュメントをインデックス化できる', async () => {
      const docId = 'doc1';
      const content = 'This is a test document about search';

      await engine.indexDocument(docId, content);

      const results = await engine.search('test search', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].documentId).toBe(docId);
    });

    test('複数ドキュメントをインデックス化できる', async () => {
      await engine.indexDocument('doc1', 'The quick brown fox jumps over the lazy dog');
      await engine.indexDocument('doc2', 'A fast brown fox leaps over a sleeping dog');
      await engine.indexDocument('doc3', 'The lazy cat sleeps in the sun');

      const results = await engine.search('brown fox', 10);
      expect(results.length).toBe(2);
      expect(results[0].documentId).toMatch(/doc[12]/);
    });

    test('同じドキュメントIDで再インデックス化すると更新される', async () => {
      await engine.indexDocument('doc1', 'original content about cats');
      await engine.indexDocument('doc1', 'updated content about dogs');

      const catResults = await engine.search('cats', 10);
      expect(catResults.length).toBe(0);

      const dogResults = await engine.search('dogs', 10);
      expect(dogResults.length).toBe(1);
      expect(dogResults[0].documentId).toBe('doc1');
    });

    test('ドキュメント統計が正しく更新される', async () => {
      await engine.indexDocument('doc1', 'short text');
      await engine.indexDocument('doc2', 'this is a much longer text with many more words');

      const stats = await engine.getDocumentStats();
      expect(stats.totalDocuments).toBe(2);
      expect(stats.averageDocumentLength).toBeGreaterThan(0);
    });
  });

  describe('BM25検索', () => {
    beforeEach(async () => {
      // テストデータをインデックス化
      await engine.indexDocument('doc1', 'TypeScript is a typed superset of JavaScript');
      await engine.indexDocument('doc2', 'JavaScript is a dynamic programming language');
      await engine.indexDocument(
        'doc3',
        'Python is a dynamic programming language with simple syntax'
      );
      await engine.indexDocument(
        'doc4',
        'TypeScript provides static typing for JavaScript development'
      );
    });

    test('単一キーワード検索が機能する', async () => {
      const results = await engine.search('TypeScript', 10);
      expect(results.length).toBe(2);
      expect(results[0].documentId).toMatch(/doc[14]/);
    });

    test('複数キーワード検索が機能する', async () => {
      const results = await engine.search('JavaScript programming', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    test('検索結果がスコア順にソートされる', async () => {
      const results = await engine.search('TypeScript JavaScript', 10);
      expect(results.length).toBeGreaterThan(1);

      // スコアが降順になっていることを確認
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    test('topK制限が機能する', async () => {
      const results = await engine.search('programming', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('該当なしの検索は空配列を返す', async () => {
      const results = await engine.search('nonexistent query xyz', 10);
      expect(results).toEqual([]);
    });

    test('BM25スコアが正しく計算される', async () => {
      const results = await engine.search('TypeScript', 10);

      // スコアは正の値である
      expect(results[0].score).toBeGreaterThan(0);

      // より関連性の高いドキュメントのスコアが高い
      const typescript1 = results.find((r) => r.documentId === 'doc1');
      const typescript4 = results.find((r) => r.documentId === 'doc4');
      expect(typescript1).toBeDefined();
      expect(typescript4).toBeDefined();
      expect(typescript1!.score).toBeGreaterThan(0);
      expect(typescript4!.score).toBeGreaterThan(0);
    });
  });

  describe('転置インデックス', () => {
    test('ターム頻度が正しく記録される', async () => {
      await engine.indexDocument('doc1', 'apple banana apple cherry apple');

      const index = await engine.getInvertedIndex('apple');
      expect(index).toBeDefined();
      expect(index?.documentId).toBe('doc1');
      expect(index?.frequency).toBe(3);
    });

    test('複数ドキュメントでの転置インデックスが機能する', async () => {
      await engine.indexDocument('doc1', 'apple banana');
      await engine.indexDocument('doc2', 'banana cherry');
      await engine.indexDocument('doc3', 'apple cherry');

      const appleIndex = await engine.getInvertedIndex('apple');
      const bananaIndex = await engine.getInvertedIndex('banana');
      const cherryIndex = await engine.getInvertedIndex('cherry');

      expect(appleIndex).toBeDefined();
      expect(bananaIndex).toBeDefined();
      expect(cherryIndex).toBeDefined();
    });

    test('位置情報が正しく記録される', async () => {
      await engine.indexDocument('doc1', 'first second third second fifth');

      const index = await engine.getInvertedIndex('second');
      expect(index).toBeDefined();
      expect(index?.positions).toBeDefined();
      expect(index?.positions.length).toBe(2);
      expect(index?.positions).toContain(1); // 0-indexed position
      expect(index?.positions).toContain(3);
    });
  });

  describe('ドキュメント削除', () => {
    beforeEach(async () => {
      await engine.indexDocument('doc1', 'TypeScript is great');
      await engine.indexDocument('doc2', 'JavaScript is awesome');
      await engine.indexDocument('doc3', 'Python is simple');
    });

    test('ドキュメントを削除できる', async () => {
      await engine.deleteDocument('doc2');

      const results = await engine.search('JavaScript', 10);
      expect(results.length).toBe(0);
    });

    test('削除後もドキュメント統計が更新される', async () => {
      const statsBefore = await engine.getDocumentStats();
      expect(statsBefore.totalDocuments).toBe(3);

      await engine.deleteDocument('doc2');

      const statsAfter = await engine.getDocumentStats();
      expect(statsAfter.totalDocuments).toBe(2);
    });

    test('存在しないドキュメントの削除はエラーにならない', async () => {
      await expect(engine.deleteDocument('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('インデックスクリア', () => {
    test('すべてのインデックスをクリアできる', async () => {
      await engine.indexDocument('doc1', 'test content');
      await engine.indexDocument('doc2', 'more content');

      await engine.clearIndex();

      const results = await engine.search('content', 10);
      expect(results.length).toBe(0);

      const stats = await engine.getDocumentStats();
      expect(stats.totalDocuments).toBe(0);
    });
  });

  describe('BM25パラメータ', () => {
    test('カスタムパラメータでエンジンを初期化できる', async () => {
      await engine.close();

      engine = new BM25Engine(testDbPath, { k1: 2.0, b: 0.5 });
      await engine.initialize();

      await engine.indexDocument('doc1', 'test content');
      const results = await engine.search('test', 10);

      expect(results.length).toBeGreaterThan(0);
    });

    test('デフォルトパラメータが使用される', async () => {
      // k1=1.5, b=0.75がデフォルト
      await engine.indexDocument('doc1', 'test content');
      const results = await engine.search('test', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  describe('エッジケース', () => {
    test('非常に長いドキュメントを処理できる', async () => {
      const longContent = Array(1000).fill('word').join(' ');
      await engine.indexDocument('doc1', longContent);

      const results = await engine.search('word', 10);
      expect(results.length).toBe(1);
    });

    test('特殊文字のみのドキュメントを処理できる', async () => {
      await engine.indexDocument('doc1', '!@#$%^&*()');

      const results = await engine.search('test', 10);
      expect(results).toEqual([]);
    });

    test('空のドキュメントを処理できる', async () => {
      await engine.indexDocument('doc1', '');

      const stats = await engine.getDocumentStats();
      expect(stats.totalDocuments).toBe(1);
    });

    test('Unicode文字を含むテキストを処理できる', async () => {
      await engine.indexDocument('doc1', 'Hello 世界 مرحبا');

      const results = await engine.search('Hello', 10);
      expect(results.length).toBe(1);
    });
  });
});
