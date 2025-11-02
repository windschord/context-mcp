/**
 * Background Update Queue Tests
 */

import { BackgroundUpdateQueue } from '../../src/services/background-update-queue';
import { IndexingService } from '../../src/services/indexing-service';
import { FileScanner } from '../../src/scanner/file-scanner';
import { LanguageParser } from '../../src/parser/language-parser';
import { SymbolExtractor } from '../../src/parser/symbol-extractor';
import { CommentExtractor } from '../../src/parser/comment-extractor';
import { MarkdownParser } from '../../src/parser/markdown-parser';
import { DocCodeLinker } from '../../src/parser/doc-code-linker';
import { MockEmbeddingEngine } from '../__mocks__/mock-embedding-engine';
import { MockVectorStore } from '../__mocks__/mock-vector-store';
import { MockBM25Engine } from '../__mocks__/mock-bm25-engine';
import type { EmbeddingEngine } from '../../src/embedding/types';
import type { VectorStorePlugin } from '../../src/storage/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('BackgroundUpdateQueue', () => {
  let queue: BackgroundUpdateQueue;
  let indexingService: IndexingService;
  let fileScanner: FileScanner;
  let languageParser: LanguageParser;
  let symbolExtractor: SymbolExtractor;
  let commentExtractor: CommentExtractor;
  let markdownParser: MarkdownParser;
  let docCodeLinker: DocCodeLinker;
  let embeddingEngine: EmbeddingEngine;
  let vectorStore: VectorStorePlugin;
  let bm25Engine: MockBM25Engine;
  let testProjectPath: string;

  beforeAll(async () => {
    // Tree-sitterパーサーの初期化
    languageParser = new LanguageParser();
    await languageParser.initialize();
  });

  beforeEach(async () => {
    const timestamp = Date.now();
    testProjectPath = path.join(process.cwd(), './tmp', `test-bg-queue-${timestamp}`);

    // テストプロジェクトディレクトリを作成
    await fs.mkdir(testProjectPath, { recursive: true });

    // コンポーネントの初期化
    fileScanner = new FileScanner(testProjectPath);
    symbolExtractor = new SymbolExtractor(languageParser);
    commentExtractor = new CommentExtractor();
    markdownParser = new MarkdownParser();
    docCodeLinker = new DocCodeLinker(symbolExtractor, markdownParser);

    // 埋め込みエンジンの初期化（モック使用）
    embeddingEngine = new MockEmbeddingEngine();
    await embeddingEngine.initialize();

    // ベクターストアの初期化（モック使用）
    vectorStore = new MockVectorStore();
    await vectorStore.connect({
      backend: 'mock',
      config: {},
    });

    // BM25エンジンの初期化（モック使用）
    bm25Engine = new MockBM25Engine();
    await bm25Engine.initialize();

    // Indexing Serviceの初期化
    indexingService = new IndexingService(
      fileScanner,
      symbolExtractor,
      commentExtractor,
      markdownParser,
      docCodeLinker,
      embeddingEngine,
      vectorStore,
      bm25Engine
    );

    // BackgroundUpdateQueueの初期化
    queue = new BackgroundUpdateQueue(indexingService);
  });

  afterEach(async () => {
    // キューを停止
    queue.stop();

    // リソースのクリーンアップ
    await embeddingEngine.dispose();
    await vectorStore.disconnect();
    await bm25Engine.close();

    // テストファイルを削除
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  });

  describe('基本機能', () => {
    test('enqueue: ファイル更新をキューに追加できる', () => {
      const filePath = path.join(testProjectPath, 'test.ts');
      queue.enqueue(filePath, 'project-1');

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(1);
      expect(stats.isProcessing).toBe(false);
      expect(stats.processedCount).toBe(0);
    });

    test('enqueue: 複数のファイルをキューに追加できる', () => {
      const file1 = path.join(testProjectPath, 'file1.ts');
      const file2 = path.join(testProjectPath, 'file2.ts');
      const file3 = path.join(testProjectPath, 'file3.ts');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');
      queue.enqueue(file3, 'project-1');

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(3);
    });

    test('enqueue: 同じファイルの重複をキューに追加しない', () => {
      const filePath = path.join(testProjectPath, 'duplicate.ts');

      queue.enqueue(filePath, 'project-1');
      queue.enqueue(filePath, 'project-1');
      queue.enqueue(filePath, 'project-1');

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(1); // 重複排除により1つだけ
    });

    test('enqueue: 優先度を指定できる', () => {
      const file1 = path.join(testProjectPath, 'low.ts');
      const file2 = path.join(testProjectPath, 'high.ts');

      queue.enqueue(file1, 'project-1', 1); // 低優先度
      queue.enqueue(file2, 'project-1', 10); // 高優先度

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(2);
    });

    test('start: キューの処理を開始できる', () => {
      queue.start();

      const stats = queue.getStats();
      expect(stats.isProcessing).toBe(true);
    });

    test('stop: キューの処理を停止できる', () => {
      queue.start();
      expect(queue.getStats().isProcessing).toBe(true);

      queue.stop();
      expect(queue.getStats().isProcessing).toBe(false);
    });

    test('clear: キューをクリアできる', () => {
      const file1 = path.join(testProjectPath, 'file1.ts');
      const file2 = path.join(testProjectPath, 'file2.ts');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');
      expect(queue.getStats().queueSize).toBe(2);

      queue.clear();
      expect(queue.getStats().queueSize).toBe(0);
    });
  });

  describe('優先度制御', () => {
    test('高優先度のタスクが先に処理される', async () => {
      const lowPriorityFile = path.join(testProjectPath, 'low.ts');
      const highPriorityFile = path.join(testProjectPath, 'high.ts');

      await fs.writeFile(lowPriorityFile, 'export const low = 1;');
      await fs.writeFile(highPriorityFile, 'export const high = 1;');

      // スパイを設定
      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // 低優先度を先に追加
      queue.enqueue(lowPriorityFile, 'project-1', 1);
      // 高優先度を後に追加
      queue.enqueue(highPriorityFile, 'project-1', 10);

      // キュー処理を開始
      queue.start();

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 高優先度が先に処理されることを確認
      expect(updateSpy).toHaveBeenCalledTimes(2);
      const firstCall = updateSpy.mock.calls[0];
      expect(firstCall[0]).toBe(highPriorityFile);
    });

    test('優先度が指定されていない場合はタイムスタンプ順（FIFO）で処理される', async () => {
      const file1 = path.join(testProjectPath, 'first.ts');
      const file2 = path.join(testProjectPath, 'second.ts');
      const file3 = path.join(testProjectPath, 'third.ts');

      await fs.writeFile(file1, 'export const first = 1;');
      await fs.writeFile(file2, 'export const second = 2;');
      await fs.writeFile(file3, 'export const third = 3;');

      // スパイを設定
      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // 順番に追加
      queue.enqueue(file1, 'project-1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.enqueue(file2, 'project-1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.enqueue(file3, 'project-1');

      // キュー処理を開始
      queue.start();

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 500));

      // FIFO順で処理されることを確認
      expect(updateSpy).toHaveBeenCalledTimes(3);
      expect(updateSpy.mock.calls[0][0]).toBe(file1);
      expect(updateSpy.mock.calls[1][0]).toBe(file2);
      expect(updateSpy.mock.calls[2][0]).toBe(file3);
    });

    test('タイムスタンプベースの優先度: 最近の変更ほど高優先度', async () => {
      const oldFile = path.join(testProjectPath, 'old.ts');
      const newFile = path.join(testProjectPath, 'new.ts');

      await fs.writeFile(oldFile, 'export const old = 1;');
      await fs.writeFile(newFile, 'export const new = 1;');

      // スパイを設定
      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // 古いファイルを先に追加
      queue.enqueue(oldFile, 'project-1');

      // 少し待ってから新しいファイルを追加
      await new Promise((resolve) => setTimeout(resolve, 50));
      queue.enqueue(newFile, 'project-1');

      // キュー処理を開始
      queue.start();

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 400));

      // 新しいファイルが先に処理されることを確認
      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy.mock.calls[0][0]).toBe(newFile);
    });
  });

  describe('バックグラウンド処理', () => {
    test('キュー処理はバックグラウンドで非同期に実行される', async () => {
      const testFile = path.join(testProjectPath, 'async.ts');
      await fs.writeFile(testFile, 'export const value = 1;');

      queue.enqueue(testFile, 'project-1');
      queue.start();

      // enqueue直後はまだ処理されていない
      expect(queue.getStats().processedCount).toBe(0);

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 処理が完了している
      expect(queue.getStats().processedCount).toBe(1);
    });

    test('複数のファイルを順次処理する', async () => {
      const files = [
        path.join(testProjectPath, 'file1.ts'),
        path.join(testProjectPath, 'file2.ts'),
        path.join(testProjectPath, 'file3.ts'),
        path.join(testProjectPath, 'file4.ts'),
        path.join(testProjectPath, 'file5.ts'),
      ];

      // ファイルを作成
      for (const file of files) {
        await fs.writeFile(file, `export const value = ${files.indexOf(file)};`);
        queue.enqueue(file, 'project-1');
      }

      queue.start();

      // すべて処理されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // すべて処理済み
      const stats = queue.getStats();
      expect(stats.processedCount).toBe(5);
      expect(stats.queueSize).toBe(0);
    });
  });

  describe('CPU使用率制限', () => {
    test('処理間隔を設定できる（デフォルト: 100ms）', async () => {
      const file1 = path.join(testProjectPath, 'rate1.ts');
      const file2 = path.join(testProjectPath, 'rate2.ts');

      await fs.writeFile(file1, 'export const v1 = 1;');
      await fs.writeFile(file2, 'export const v2 = 2;');

      // スパイを設定
      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');
      queue.start();

      // 最初の処理
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // デフォルト処理間隔（100ms）を待つ
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    test('処理間隔をカスタマイズできる', async () => {
      // 処理間隔を200msに設定
      queue = new BackgroundUpdateQueue(indexingService, { processingIntervalMs: 200 });

      const file1 = path.join(testProjectPath, 'custom1.ts');
      const file2 = path.join(testProjectPath, 'custom2.ts');

      await fs.writeFile(file1, 'export const v1 = 1;');
      await fs.writeFile(file2, 'export const v2 = 2;');

      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');
      queue.start();

      // 最初の処理
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // カスタム処理間隔（200ms）を待つ
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('エラーハンドリング', () => {
    test('処理エラーが発生してもキューは継続動作する', async () => {
      const goodFile = path.join(testProjectPath, 'good.ts');
      const badFile = path.join(testProjectPath, 'bad.ts'); // 存在しないファイル

      await fs.writeFile(goodFile, 'export const good = 1;');
      // badFileは作成しない

      queue.enqueue(badFile, 'project-1');
      queue.enqueue(goodFile, 'project-1');
      queue.start();

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 400));

      // エラーがあっても処理は継続
      const stats = queue.getStats();
      expect(stats.processedCount).toBeGreaterThan(0);
      expect(stats.isProcessing).toBe(true); // 停止していない
    });

    test('存在しないファイルの更新を試みてもエラーにならない', async () => {
      const nonExistentFile = path.join(testProjectPath, 'not-exists.ts');

      queue.enqueue(nonExistentFile, 'project-1');
      queue.start();

      // エラーが発生してもクラッシュしない
      await expect(
        new Promise((resolve) => setTimeout(resolve, 200))
      ).resolves.toBeUndefined();

      // 処理はカウントされる（失敗してもカウント）
      expect(queue.getStats().processedCount).toBe(1);
    });
  });

  describe('統計情報', () => {
    test('getStats: キューの状態を取得できる', () => {
      const file1 = path.join(testProjectPath, 'stats1.ts');
      const file2 = path.join(testProjectPath, 'stats2.ts');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');

      const stats = queue.getStats();
      expect(stats).toEqual({
        queueSize: 2,
        isProcessing: false,
        processedCount: 0,
      });
    });

    test('getStats: 処理カウントが正しく更新される', async () => {
      const file1 = path.join(testProjectPath, 'count1.ts');
      const file2 = path.join(testProjectPath, 'count2.ts');

      await fs.writeFile(file1, 'export const v1 = 1;');
      await fs.writeFile(file2, 'export const v2 = 2;');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');
      queue.start();

      // 初期状態
      expect(queue.getStats().processedCount).toBe(0);

      // 1つ目処理完了
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(queue.getStats().processedCount).toBe(1);

      // 2つ目処理完了
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(queue.getStats().processedCount).toBe(2);
    });

    test('getStats: キューサイズが処理と共に減少する', async () => {
      const file1 = path.join(testProjectPath, 'size1.ts');
      const file2 = path.join(testProjectPath, 'size2.ts');

      await fs.writeFile(file1, 'export const v1 = 1;');
      await fs.writeFile(file2, 'export const v2 = 2;');

      queue.enqueue(file1, 'project-1');
      queue.enqueue(file2, 'project-1');
      expect(queue.getStats().queueSize).toBe(2);

      queue.start();

      // 1つ目処理完了
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(queue.getStats().queueSize).toBe(1);

      // 2つ目処理完了
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(queue.getStats().queueSize).toBe(0);
    });
  });

  describe('キュー管理', () => {
    test('処理中にキューに追加できる', async () => {
      const file1 = path.join(testProjectPath, 'dynamic1.ts');
      const file2 = path.join(testProjectPath, 'dynamic2.ts');

      await fs.writeFile(file1, 'export const v1 = 1;');
      await fs.writeFile(file2, 'export const v2 = 2;');

      queue.enqueue(file1, 'project-1');
      queue.start();

      // 処理中に追加
      await new Promise((resolve) => setTimeout(resolve, 50));
      queue.enqueue(file2, 'project-1');

      // すべて処理されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(queue.getStats().processedCount).toBe(2);
    });

    test('停止後に再開できる', async () => {
      const file1 = path.join(testProjectPath, 'restart1.ts');
      const file2 = path.join(testProjectPath, 'restart2.ts');

      await fs.writeFile(file1, 'export const v1 = 1;');
      await fs.writeFile(file2, 'export const v2 = 2;');

      queue.enqueue(file1, 'project-1');
      queue.start();

      // 処理中に停止
      await new Promise((resolve) => setTimeout(resolve, 50));
      queue.stop();

      // 新しいタスクを追加
      queue.enqueue(file2, 'project-1');

      // 再開
      queue.start();

      // すべて処理されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(queue.getStats().processedCount).toBeGreaterThan(0);
    });

    test('clear: 処理中のキューをクリアできる', async () => {
      const files = Array.from({ length: 10 }, (_, i) =>
        path.join(testProjectPath, `clear${i}.ts`)
      );

      for (const file of files) {
        await fs.writeFile(file, `export const v${files.indexOf(file)} = 1;`);
        queue.enqueue(file, 'project-1');
      }

      queue.start();

      // 少し処理させてからクリア
      await new Promise((resolve) => setTimeout(resolve, 150));
      queue.clear();

      // キューがクリアされている
      expect(queue.getStats().queueSize).toBe(0);
    });
  });

  describe('同じファイルの重複排除', () => {
    test('キューに同じファイルが複数回追加されても1回だけ処理される', async () => {
      const testFile = path.join(testProjectPath, 'dedup.ts');
      await fs.writeFile(testFile, 'export const value = 1;');

      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // 同じファイルを複数回追加
      queue.enqueue(testFile, 'project-1');
      queue.enqueue(testFile, 'project-1');
      queue.enqueue(testFile, 'project-1');

      queue.start();

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 1回だけ処理される
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(queue.getStats().processedCount).toBe(1);
    });

    test('処理中に同じファイルを追加した場合は既存エントリを更新', async () => {
      const testFile = path.join(testProjectPath, 'update-existing.ts');
      await fs.writeFile(testFile, 'export const value = 1;');

      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // 最初に低優先度で追加
      queue.enqueue(testFile, 'project-1', 1);
      queue.start();

      // 処理開始前に高優先度で追加
      await new Promise((resolve) => setTimeout(resolve, 20));
      queue.enqueue(testFile, 'project-1', 10);

      // 処理完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 1回だけ処理される（重複排除）
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(queue.getStats().processedCount).toBe(1);
    });
  });
});
