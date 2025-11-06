/**
 * Indexing Service: インデックス化処理全体を管理するサービス
 *
 * プロジェクト全体またはファイル単位でのインデックス化を実行し、
 * AST解析、埋め込み生成、ベクトルストア/BM25エンジンへの保存を統合管理します。
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileScanner } from '../scanner/file-scanner.js';
import { SymbolExtractor } from '../parser/symbol-extractor.js';
import { CommentExtractor } from '../parser/comment-extractor.js';
import { MarkdownParser } from '../parser/markdown-parser.js';
import { DocCodeLinker } from '../parser/doc-code-linker.js';
import { Language } from '../parser/types.js';
import type { EmbeddingEngine } from '../embedding/types.js';
import type { VectorStorePlugin, Vector } from '../storage/types.js';
import type { BM25Engine } from '../storage/bm25-engine.js';

/**
 * インデックス化オプション
 */
export interface IndexingOptions {
  /** 対象言語のリスト */
  languages?: string[];
  /** 除外パターン */
  excludePatterns?: string[];
  /** ドキュメント（Markdown）を含めるか */
  includeDocuments?: boolean;
  /** 最大並列Worker数（デフォルト: CPUコア数-1、最小1、最大4） */
  maxWorkers?: number;
}

/**
 * ファイルインデックス化結果
 */
export interface FileIndexResult {
  /** 成功したか */
  success: boolean;
  /** ファイルパス */
  filePath: string;
  /** 抽出されたシンボル数 */
  symbolsCount: number;
  /** 生成されたベクトル数 */
  vectorsCount: number;
  /** エラーがあったか */
  hasErrors?: boolean;
  /** エラーメッセージ */
  error?: string;
  /** 処理時間（ミリ秒） */
  processingTime?: number;
}

/**
 * プロジェクトインデックス化結果
 */
export interface ProjectIndexResult {
  /** 成功したか */
  success: boolean;
  /** プロジェクトID */
  projectId: string;
  /** 総ファイル数 */
  totalFiles: number;
  /** インデックス化されたファイル数 */
  indexedFiles: number;
  /** 失敗したファイル数 */
  failedFiles: number;
  /** 総シンボル数 */
  totalSymbols: number;
  /** 総ベクトル数 */
  totalVectors: number;
  /** 処理時間（ミリ秒） */
  processingTime: number;
  /** エラー情報 */
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * インデックス統計情報
 */
export interface IndexStats {
  /** プロジェクトID */
  projectId: string;
  /** ルートパス */
  rootPath: string;
  /** ステータス */
  status: 'indexed' | 'indexing' | 'error';
  /** 最終インデックス化日時 */
  lastIndexed: Date;
  /** 総ファイル数 */
  totalFiles: number;
  /** 総シンボル数 */
  totalSymbols: number;
  /** 総ベクトル数 */
  totalVectors: number;
}

/**
 * 削除結果
 */
export interface RemoveResult {
  /** 成功したか */
  success: boolean;
  /** ファイルパス */
  filePath?: string;
  /** エラーメッセージ */
  error?: string;
}

/**
 * クリア結果
 */
export interface ClearResult {
  /** 成功したか */
  success: boolean;
  /** エラーメッセージ */
  error?: string;
}

/**
 * Indexing Service
 *
 * イベント:
 * - fileStarted: ファイル処理開始時
 * - fileCompleted: ファイル処理完了時
 * - fileError: ファイルエラー時
 * - progressUpdate: 進捗更新時
 */
export class IndexingService extends EventEmitter {
  private indexMetadata: Map<string, IndexStats> = new Map();
  private collectionName = 'code_vectors';
  private fileWatchers: Map<string, any> = new Map();

  constructor(
    private fileScanner: FileScanner,
    private symbolExtractor: SymbolExtractor,
    private commentExtractor: CommentExtractor,
    private markdownParser: MarkdownParser,
    private docCodeLinker: DocCodeLinker,
    private embeddingEngine: EmbeddingEngine,
    private vectorStore: VectorStorePlugin,
    private bm25Engine: BM25Engine
  ) {
    super();
  }

  /**
   * プロジェクト全体をインデックス化
   */
  async indexProject(
    projectId: string,
    rootPath: string,
    options: IndexingOptions = {}
  ): Promise<ProjectIndexResult> {
    const startTime = Date.now();

    // ステータスを更新
    this.updateIndexMetadata(projectId, rootPath, 'indexing');

    try {
      // ファイルをスキャン
      const files = await this.fileScanner.scan();

      if (files.length === 0) {
        return {
          success: true,
          projectId,
          totalFiles: 0,
          indexedFiles: 0,
          failedFiles: 0,
          totalSymbols: 0,
          totalVectors: 0,
          processingTime: Date.now() - startTime,
          errors: [],
        };
      }

      // コレクションを作成（存在しない場合）
      try {
        await this.vectorStore.createCollection(
          this.collectionName,
          this.embeddingEngine.getDimension()
        );
      } catch (error) {
        // コレクションが既に存在する場合はエラーを無視
      }

      // 並列処理の設定
      const maxWorkers = this.getMaxWorkers(options.maxWorkers);
      const results: FileIndexResult[] = [];
      const errors: Array<{ filePath: string; error: string }> = [];

      // ファイルを並列処理（簡易実装: Promise.all）
      const chunks = this.chunkArray(files, maxWorkers);
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map((file) => this.indexFileInternal(file, projectId))
        );
        results.push(...chunkResults);
      }

      // 結果を集計
      const indexedFiles = results.filter((r) => r.success).length;
      const failedFiles = results.filter((r) => !r.success).length;
      const totalSymbols = results.reduce((sum, r) => sum + r.symbolsCount, 0);
      const totalVectors = results.reduce((sum, r) => sum + r.vectorsCount, 0);

      // エラーを収集
      for (const result of results) {
        if (!result.success && result.error) {
          errors.push({ filePath: result.filePath, error: result.error });
        }
      }

      // メタデータを更新
      this.updateIndexMetadata(projectId, rootPath, 'indexed', {
        totalFiles: indexedFiles,
        totalSymbols,
        totalVectors,
      });

      return {
        success: true,
        projectId,
        totalFiles: files.length,
        indexedFiles,
        failedFiles,
        totalSymbols,
        totalVectors,
        processingTime: Date.now() - startTime,
        errors,
      };
    } catch (error) {
      this.updateIndexMetadata(projectId, rootPath, 'error');
      throw error;
    }
  }

  /**
   * 単一ファイルをインデックス化
   */
  async indexFile(filePath: string, projectId: string): Promise<FileIndexResult> {
    return this.indexFileInternal(filePath, projectId);
  }

  /**
   * ファイルをインデックス化（内部実装）
   */
  private async indexFileInternal(filePath: string, projectId: string): Promise<FileIndexResult> {
    const startTime = Date.now();

    this.emit('fileStarted', { filePath, projectId });

    try {
      // ファイルが存在するか確認
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          throw new Error('Not a file');
        }
      } catch (error) {
        return {
          success: false,
          filePath,
          symbolsCount: 0,
          vectorsCount: 0,
          error: `File not found or not accessible: ${error}`,
        };
      }

      // ファイルを読み込む
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath);

      // ファイルタイプを判定
      if (ext === '.md') {
        return await this.indexMarkdownFile(filePath, content, projectId, startTime);
      } else if (this.isCodeFile(ext)) {
        return await this.indexCodeFile(filePath, content, projectId, startTime);
      } else {
        return {
          success: false,
          filePath,
          symbolsCount: 0,
          vectorsCount: 0,
          error: `Unsupported file type: ${ext}`,
        };
      }
    } catch (error: any) {
      this.emit('fileError', { filePath, projectId, error: error.message });

      return {
        success: false,
        filePath,
        symbolsCount: 0,
        vectorsCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * コードファイルをインデックス化
   */
  private async indexCodeFile(
    filePath: string,
    content: string,
    projectId: string,
    startTime: number
  ): Promise<FileIndexResult> {
    const language = this.getLanguageFromExtension(path.extname(filePath));

    try {
      // シンボル抽出
      const symbolResult = this.symbolExtractor.extractSymbols(content, language);
      const symbols = symbolResult.symbols;

      // コメント抽出
      const _comments = this.commentExtractor.extractComments(content, language);

      // 埋め込みを生成
      const vectors: Vector[] = [];
      const texts: string[] = [];
      const metadatas: Array<Record<string, any>> = [];

      // シンボルごとに埋め込みを生成
      for (const symbol of symbols) {
        const text = this.buildSymbolText(symbol, content);
        texts.push(text);
        metadatas.push({
          project_id: projectId,
          file_path: filePath,
          language: language.toString(),
          type: symbol.type,
          name: symbol.name,
          line_start: symbol.position.startLine,
          line_end: symbol.position.endLine,
          scope: symbol.scope,
        });
      }

      // バッチ埋め込み
      if (texts.length > 0) {
        const embeddings = await this.embeddingEngine.embedBatch(texts);

        for (let i = 0; i < embeddings.length; i++) {
          vectors.push({
            id: `${filePath}:${metadatas[i].line_start}`,
            vector: embeddings[i],
            metadata: metadatas[i],
          });
        }

        // ベクターストアに保存
        await this.vectorStore.upsert(this.collectionName, vectors);

        // BM25インデックスに追加
        for (let i = 0; i < texts.length; i++) {
          await this.bm25Engine.indexDocument(vectors[i].id, texts[i]);
        }
      }

      this.emit('fileCompleted', {
        filePath,
        projectId,
        symbolsCount: symbols.length,
        vectorsCount: vectors.length,
      });

      return {
        success: true,
        filePath,
        symbolsCount: symbols.length,
        vectorsCount: vectors.length,
        hasErrors: symbolResult.hasError,
        processingTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.emit('fileError', { filePath, projectId, error: error.message });

      // 構文エラーでも処理を継続（エラー耐性）
      return {
        success: true,
        filePath,
        symbolsCount: 0,
        vectorsCount: 0,
        hasErrors: true,
        error: error.message,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Markdownファイルをインデックス化
   */
  private async indexMarkdownFile(
    filePath: string,
    content: string,
    projectId: string,
    startTime: number
  ): Promise<FileIndexResult> {
    try {
      // Markdown解析
      const parsed = await this.markdownParser.parse(content);

      // 埋め込みを生成
      const vectors: Vector[] = [];
      const texts: string[] = [];
      const metadatas: Array<Record<string, any>> = [];

      // 見出しセクションごとに埋め込み
      for (const heading of parsed.headings) {
        texts.push(heading.text);
        metadatas.push({
          project_id: projectId,
          file_path: filePath,
          language: 'markdown',
          type: 'heading',
          name: heading.text,
          line_start: heading.line,
          line_end: heading.line,
        });
      }

      // コードブロックごとに埋め込み
      for (const codeBlock of parsed.codeBlocks) {
        texts.push(codeBlock.code);
        metadatas.push({
          project_id: projectId,
          file_path: filePath,
          language: codeBlock.language,
          type: 'code_block',
          name: `code_block_${codeBlock.startLine}`,
          line_start: codeBlock.startLine,
          line_end: codeBlock.endLine,
        });
      }

      // バッチ埋め込み
      if (texts.length > 0) {
        const embeddings = await this.embeddingEngine.embedBatch(texts);

        for (let i = 0; i < embeddings.length; i++) {
          vectors.push({
            id: `${filePath}:${metadatas[i].line_start}`,
            vector: embeddings[i],
            metadata: metadatas[i],
          });
        }

        // ベクターストアに保存
        await this.vectorStore.upsert(this.collectionName, vectors);

        // BM25インデックスに追加
        for (let i = 0; i < texts.length; i++) {
          await this.bm25Engine.indexDocument(vectors[i].id, texts[i]);
        }
      }

      this.emit('fileCompleted', {
        filePath,
        projectId,
        symbolsCount: 0,
        vectorsCount: vectors.length,
      });

      return {
        success: true,
        filePath,
        symbolsCount: 0,
        vectorsCount: vectors.length,
        processingTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.emit('fileError', { filePath, projectId, error: error.message });

      return {
        success: false,
        filePath,
        symbolsCount: 0,
        vectorsCount: 0,
        error: error.message,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * ファイルを更新（インクリメンタル更新）
   * 古いインデックスを削除してから新しいインデックスを作成
   */
  async updateFile(filePath: string, projectId: string): Promise<FileIndexResult> {
    try {
      // 古いインデックスエントリを削除
      await this.deleteFileFromIndex(filePath);

      // 新しいインデックスを作成
      return await this.indexFileInternal(filePath, projectId);
    } catch (error: any) {
      return {
        success: false,
        filePath,
        symbolsCount: 0,
        vectorsCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * ファイルを削除（インデックスから削除）
   */
  async deleteFile(filePath: string, _projectId: string): Promise<RemoveResult> {
    try {
      await this.deleteFileFromIndex(filePath);
      return { success: true, filePath };
    } catch (error: any) {
      return { success: false, filePath, error: error.message };
    }
  }

  /**
   * ファイルのインデックスエントリを削除（内部実装）
   */
  private async deleteFileFromIndex(filePath: string): Promise<void> {
    try {
      // ファイル内の全シンボル/セクションのIDを収集
      // IDの形式: ${filePath}:${lineNumber}
      // 簡易実装: ファイルを読み込んで行数を推定し、可能性のあるIDを生成して削除を試みる
      // または、ベクターストアにメタデータでクエリして該当IDを取得

      // より効率的な実装: ファイル内容を再解析してIDを特定
      // ただし、ファイルが既に削除されている場合は解析できないため、
      // ベクターストアのメタデータフィルタを使用するのが最善

      // 現状の簡易実装: 想定される最大行数（例: 10000行）までのIDを試行削除
      // 注: 本番実装では、ベクターストアのメタデータフィルタクエリを使用すべき

      const idsToDelete: string[] = [];

      // ファイルが存在する場合は、行数を取得してIDを生成
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 1; i <= lines.length; i++) {
          idsToDelete.push(`${filePath}:${i}`);
        }
      } catch (error) {
        // ファイルが存在しない場合は、最大行数で推定
        // 簡易実装として、最大1000行を想定
        for (let i = 1; i <= 1000; i++) {
          idsToDelete.push(`${filePath}:${i}`);
        }
      }

      // ベクターストアから削除（存在しないIDは無視される）
      if (idsToDelete.length > 0) {
        try {
          await this.vectorStore.delete(this.collectionName, idsToDelete);
        } catch (error) {
          // エラーがあってもスキップ
        }
      }

      // BM25インデックスから削除
      for (const id of idsToDelete) {
        try {
          await this.bm25Engine.deleteDocument(id);
        } catch (error) {
          // エラーがあってもスキップ（ドキュメントが存在しない場合など）
        }
      }
    } catch (error) {
      // エラーがあってもスキップ
    }
  }

  /**
   * インデックスからファイルを削除
   * @deprecated updateFileまたはdeleteFileを使用してください
   */
  async removeFromIndex(filePath: string, projectId: string): Promise<RemoveResult> {
    return this.deleteFile(filePath, projectId);
  }

  /**
   * File Watcherを有効化
   */
  async enableWatcher(projectId: string): Promise<void> {
    // 注: 実際の実装では、FileWatcherインスタンスを作成して管理する
    // この簡易実装では、外部からFileWatcherを設定することを想定
    this.fileWatchers.set(projectId, true);
  }

  /**
   * File Watcherを無効化
   */
  async disableWatcher(projectId: string): Promise<void> {
    this.fileWatchers.delete(projectId);
  }

  /**
   * インデックス統計を取得
   */
  async getIndexStats(projectId: string): Promise<IndexStats> {
    const metadata = this.indexMetadata.get(projectId);

    if (!metadata) {
      return {
        projectId,
        rootPath: '',
        status: 'indexed',
        lastIndexed: new Date(),
        totalFiles: 0,
        totalSymbols: 0,
        totalVectors: 0,
      };
    }

    return metadata;
  }

  /**
   * すべてのプロジェクトの統計を取得
   */
  async getAllIndexStats(): Promise<IndexStats[]> {
    return Array.from(this.indexMetadata.values());
  }

  /**
   * 特定プロジェクトのインデックスをクリア
   */
  async clearIndex(projectId: string): Promise<ClearResult> {
    try {
      // メタデータをクリア
      this.indexMetadata.delete(projectId);

      // 注: 実際の実装では、ベクターストアとBM25から該当データを削除する必要がある
      // ここでは簡易実装として、メタデータのみクリア

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 全プロジェクトのインデックスをクリア
   */
  async clearAllIndexes(): Promise<ClearResult> {
    try {
      this.indexMetadata.clear();

      // コレクションを削除して再作成
      try {
        await this.vectorStore.deleteCollection(this.collectionName);
      } catch (error) {
        // コレクションが存在しない場合はエラーを無視
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * メタデータを更新
   */
  private updateIndexMetadata(
    projectId: string,
    rootPath: string,
    status: 'indexed' | 'indexing' | 'error',
    stats?: { totalFiles: number; totalSymbols: number; totalVectors: number }
  ): void {
    const existing = this.indexMetadata.get(projectId);

    this.indexMetadata.set(projectId, {
      projectId,
      rootPath,
      status,
      lastIndexed: new Date(),
      totalFiles: stats?.totalFiles ?? existing?.totalFiles ?? 0,
      totalSymbols: stats?.totalSymbols ?? existing?.totalSymbols ?? 0,
      totalVectors: stats?.totalVectors ?? existing?.totalVectors ?? 0,
    });
  }

  /**
   * シンボルからテキストを構築
   */
  private buildSymbolText(symbol: any, content: string): string {
    const lines = content.split('\n');
    const snippet = lines
      .slice(symbol.startLine - 1, symbol.endLine)
      .join('\n')
      .substring(0, 500);

    const docstring = symbol.docstring || '';
    return `${symbol.name}\n${docstring}\n${snippet}`;
  }

  /**
   * 拡張子から言語を取得
   */
  private getLanguageFromExtension(ext: string): Language {
    const map: Record<string, Language> = {
      '.ts': Language.TypeScript,
      '.tsx': Language.TypeScript,
      '.js': Language.JavaScript,
      '.jsx': Language.JavaScript,
      '.mjs': Language.JavaScript,
      '.py': Language.Python,
      '.go': Language.Go,
      '.rs': Language.Rust,
      '.java': Language.Java,
      '.c': Language.C,
      '.h': Language.C,
      '.cpp': Language.CPP,
      '.hpp': Language.CPP,
      '.ino': Language.CPP, // Arduino
    };

    return map[ext] || Language.Unknown;
  }

  /**
   * コードファイルかどうか判定
   */
  private isCodeFile(ext: string): boolean {
    const codeExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.h',
      '.cpp',
      '.hpp',
      '.ino',
    ];
    return codeExtensions.includes(ext);
  }

  /**
   * 最大Worker数を取得
   */
  private getMaxWorkers(maxWorkers?: number): number {
    if (maxWorkers !== undefined) {
      return Math.max(1, Math.min(maxWorkers, 4));
    }

    // デフォルト: CPUコア数-1、最小1、最大4
    const cpus = require('os').cpus().length;
    return Math.max(1, Math.min(cpus - 1, 4));
  }

  /**
   * 配列をチャンクに分割
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
