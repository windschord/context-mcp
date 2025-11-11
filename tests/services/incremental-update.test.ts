import { IndexingService } from '../../src/services/indexing-service';
import { FileScanner } from '../../src/scanner/file-scanner';
import { LanguageParser } from '../../src/parser/language-parser';
import { SymbolExtractor } from '../../src/parser/symbol-extractor';
import { CommentExtractor } from '../../src/parser/comment-extractor';
import { MarkdownParser } from '../../src/parser/markdown-parser';
import { DocCodeLinker } from '../../src/parser/doc-code-linker';
import { FileWatcher } from '../../src/watcher/file-watcher';
import { MockEmbeddingEngine } from '../__mocks__/mock-embedding-engine';
import { MockVectorStore } from '../__mocks__/mock-vector-store';
import { MockBM25Engine } from '../__mocks__/mock-bm25-engine';
import type { EmbeddingEngine } from '../../src/embedding/types';
import type { VectorStorePlugin } from '../../src/storage/types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('インクリメンタル更新機能とFile Watcherの統合', () => {
  let indexingService: IndexingService;
  let fileWatcher: FileWatcher;
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
    testProjectPath = path.join(process.cwd(), './tmp', `test-incremental-${timestamp}`);

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

    // File Watcherの初期化
    fileWatcher = new FileWatcher({
      rootPath: testProjectPath,
      debounceMs: 100, // テストでは短く設定
    });
  });

  afterEach(async () => {
    // File Watcherを停止
    if (fileWatcher.isWatching()) {
      await fileWatcher.stop();
    }

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

  describe('File Watcherとの連携', () => {
    test('enableWatcher: File Watcherを有効化できる', async () => {
      await indexingService.enableWatcher('project-1');

      expect(fileWatcher.isWatching()).toBe(true);
    });

    test('disableWatcher: File Watcherを無効化できる', async () => {
      await indexingService.enableWatcher('project-1');
      expect(fileWatcher.isWatching()).toBe(true);

      await indexingService.disableWatcher('project-1');
      expect(fileWatcher.isWatching()).toBe(false);
    });

    test('ファイル変更イベント時に自動的に再インデックス化される', async () => {
      const testFile = path.join(testProjectPath, 'watched.ts');
      await fs.writeFile(testFile, 'export const version = 1;');

      // 初回インデックス化
      await indexingService.indexFile(testFile, 'project-1');

      // File Watcherを有効化
      await indexingService.enableWatcher('project-1');
      await fileWatcher.start();

      // updateFileが呼ばれることを追跡
      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // ファイルを変更
      await fs.writeFile(testFile, 'export const version = 2;');

      // debounce待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // updateFileが呼ばれたことを確認
      expect(updateSpy).toHaveBeenCalledWith(testFile, 'project-1');
    });

    test('ファイル削除イベント時に自動的にインデックスから削除される', async () => {
      const testFile = path.join(testProjectPath, 'to-delete.ts');
      await fs.writeFile(testFile, 'export const value = 1;');

      // 初回インデックス化
      await indexingService.indexFile(testFile, 'project-1');

      // File Watcherを有効化
      await indexingService.enableWatcher('project-1');
      await fileWatcher.start();

      // deleteFileが呼ばれることを追跡
      const deleteSpy = jest.spyOn(indexingService, 'deleteFile');

      // ファイルを削除
      await fs.unlink(testFile);

      // debounce待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // deleteFileが呼ばれたことを確認
      expect(deleteSpy).toHaveBeenCalledWith(testFile, 'project-1');
    });

    test('ファイル追加イベント時に自動的にインデックス化される', async () => {
      // File Watcherを有効化
      await indexingService.enableWatcher('project-1');
      await fileWatcher.start();

      // indexFileが呼ばれることを追跡
      const indexSpy = jest.spyOn(indexingService, 'indexFile');

      // 新しいファイルを追加
      const newFile = path.join(testProjectPath, 'new.ts');
      await fs.writeFile(newFile, 'export const newValue = 1;');

      // debounce待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // indexFileが呼ばれたことを確認
      expect(indexSpy).toHaveBeenCalledWith(newFile, 'project-1');
    });

    test('連続したファイル変更はデバウンスされる', async () => {
      const testFile = path.join(testProjectPath, 'debounced.ts');
      await fs.writeFile(testFile, 'export const v = 1;');

      // 初回インデックス化
      await indexingService.indexFile(testFile, 'project-1');

      // File Watcherを有効化
      await indexingService.enableWatcher('project-1');
      await fileWatcher.start();

      const updateSpy = jest.spyOn(indexingService, 'updateFile');

      // 短時間に複数回変更
      await fs.writeFile(testFile, 'export const v = 2;');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.writeFile(testFile, 'export const v = 3;');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await fs.writeFile(testFile, 'export const v = 4;');

      // debounce待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // デバウンスにより1回だけ呼ばれる
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('エラーハンドリング', () => {
    test('更新エラーが発生しても File Watcher は継続動作する', async () => {
      const goodFile = path.join(testProjectPath, 'good.ts');
      const badFile = path.join(testProjectPath, 'bad.ts');

      await fs.writeFile(goodFile, 'export const good = 1;');
      await fs.writeFile(badFile, 'export const bad = 1;');

      // 初回インデックス化
      await indexingService.indexFile(goodFile, 'project-1');
      await indexingService.indexFile(badFile, 'project-1');

      // File Watcherを有効化
      await indexingService.enableWatcher('project-1');
      await fileWatcher.start();

      // badFileをディレクトリに置き換え（エラーを発生させる）
      await fs.unlink(badFile);
      await fs.mkdir(badFile);

      // debounce待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // goodFileは正常に更新できる
      await fs.writeFile(goodFile, 'export const good = 999;');

      // debounce待機
      await new Promise((resolve) => setTimeout(resolve, 200));

      // File Watcherは停止していない
      expect(fileWatcher.isWatching()).toBe(true);
    });
  });

  describe('ロックフリー設計', () => {
    test('更新中でも検索が可能（ロック不要）', async () => {
      const testFile = path.join(testProjectPath, 'no-lock.ts');
      await fs.writeFile(testFile, 'export const value = 1;');

      // 初回インデックス化
      await indexingService.indexFile(testFile, 'project-1');

      // 更新を開始（await しない）
      const updatePromise = indexingService.updateFile(testFile, 'project-1');

      // 更新中に統計情報を取得（ロックがないため可能）
      const stats = await indexingService.getIndexStats('project-1');
      expect(stats).toBeDefined();

      // 更新完了を待つ
      await updatePromise;
    });
  });
});
