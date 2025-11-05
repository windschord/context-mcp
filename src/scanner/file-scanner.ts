import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import ignore, { Ignore } from 'ignore';

/**
 * ファイルスキャナーのオプション
 */
export interface FileScannerOptions {
  /** 追加の除外パターン */
  excludePatterns?: string[];
  /** 含めるファイルタイプ（拡張子のリスト） */
  includeExtensions?: string[];
}

/**
 * スキャン統計情報
 */
export interface ScanStats {
  /** スキャンされた総ファイル数 */
  totalFiles: number;
  /** スキャンにかかった時間(ms) */
  duration: number;
  /** 除外されたファイル数 */
  excludedFiles: number;
}

/**
 * ファイルシステムスキャナー
 *
 * プロジェクトディレクトリを再帰的にスキャンし、
 * 対象ファイルを列挙する機能を提供します。
 */
export class FileScanner extends EventEmitter {
  private rootPath: string;
  private options: FileScannerOptions;
  private gitignore: Ignore | null = null;
  private mcpignore: Ignore | null = null;

  /** 対応している拡張子のリスト */
  private static readonly SUPPORTED_EXTENSIONS = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs', // TypeScript/JavaScript
    '.py', // Python
    '.go', // Go
    '.rs', // Rust
    '.java', // Java
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.ino', // C/C++/Arduino
    '.md', // Markdown
  ];

  /** デフォルトで除外するパターン */
  private static readonly DEFAULT_EXCLUSIONS = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.next/**',
    '.nuxt/**',
    '.cache/**',
    'vendor/**',
    '__pycache__/**',
    '*.pyc',
    'target/**',
    'bin/**',
    'obj/**',
    '**/.env',
    '**/.env.*',
    '**/credentials.json',
    '**/secrets.json',
    '**/id_rsa',
    '**/id_rsa.pub',
    '**/id_ed25519',
    '**/id_ed25519.pub',
    '**/*.key',
    '**/*.pem',
    '**/*.p12',
  ];

  constructor(rootPath: string, options: FileScannerOptions = {}) {
    super();
    this.rootPath = path.resolve(rootPath);
    this.options = options;
  }

  /**
   * ディレクトリをスキャンして対象ファイルのリストを返す
   */
  async scan(): Promise<string[]> {
    const startTime = Date.now();
    let excludedCount = 0;

    // .gitignoreと.mcpignoreを読み込む
    await this.loadIgnoreFiles();

    const files: string[] = [];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      this.emit('directoryEntered', dirPath);

      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch (error) {
        // ディレクトリ読み取りエラーはスキップ
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);

        // 除外パターンチェック
        if (this.shouldExclude(relativePath, entry.isDirectory())) {
          excludedCount++;
          continue;
        }

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          this.emit('fileFound', fullPath);

          // ファイル種別チェック
          if (this.isTargetFile(fullPath)) {
            files.push(fullPath);
            this.emit('fileScanned', fullPath);
          } else {
            excludedCount++;
          }
        }
      }
    };

    // ルートディレクトリの存在チェック
    try {
      const stats = await fs.stat(this.rootPath);
      if (!stats.isDirectory()) {
        throw new Error(`Not a directory: ${this.rootPath}`);
      }
    } catch (error) {
      throw new Error(`Cannot access directory: ${this.rootPath}`);
    }

    await scanDirectory(this.rootPath);

    const duration = Date.now() - startTime;
    const stats: ScanStats = {
      totalFiles: files.length,
      duration,
      excludedFiles: excludedCount,
    };

    this.emit('scanComplete', stats);

    return files;
  }

  /**
   * .gitignoreと.mcpignoreファイルを読み込む
   */
  private async loadIgnoreFiles(): Promise<void> {
    // .gitignore読み込み
    const gitignorePath = path.join(this.rootPath, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      this.gitignore = ignore().add(content);
    } catch {
      // .gitignoreがない場合は無視
      this.gitignore = null;
    }

    // .mcpignore読み込み
    const mcpignorePath = path.join(this.rootPath, '.mcpignore');
    try {
      const content = await fs.readFile(mcpignorePath, 'utf-8');
      this.mcpignore = ignore().add(content);
    } catch {
      // .mcpignoreがない場合は無視
      this.mcpignore = null;
    }
  }

  /**
   * ファイルまたはディレクトリを除外すべきかチェック
   */
  private shouldExclude(relativePath: string, isDirectory: boolean): boolean {
    // Windowsパス区切りをUnix形式に変換
    const normalizedPath = relativePath.split(path.sep).join('/');
    const pathToCheck = isDirectory ? `${normalizedPath}/` : normalizedPath;

    // デフォルト除外パターンチェック
    const defaultIgnore = ignore().add(FileScanner.DEFAULT_EXCLUSIONS);
    if (defaultIgnore.ignores(pathToCheck)) {
      return true;
    }

    // カスタム除外パターンチェック
    if (this.options.excludePatterns && this.options.excludePatterns.length > 0) {
      const customIgnore = ignore().add(this.options.excludePatterns);
      if (customIgnore.ignores(pathToCheck)) {
        return true;
      }
    }

    // .gitignoreチェック
    if (this.gitignore && this.gitignore.ignores(pathToCheck)) {
      return true;
    }

    // .mcpignoreチェック
    if (this.mcpignore && this.mcpignore.ignores(pathToCheck)) {
      return true;
    }

    return false;
  }

  /**
   * 対象ファイルかどうかをチェック
   */
  private isTargetFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    const basename = path.basename(filePath);

    // platformio.iniは特別扱い
    if (basename === 'platformio.ini') {
      return true;
    }

    // カスタム拡張子指定がある場合
    if (this.options.includeExtensions && this.options.includeExtensions.length > 0) {
      return this.options.includeExtensions.includes(ext);
    }

    // デフォルト対応拡張子
    return FileScanner.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * 対応している拡張子のリストを取得
   */
  getSupportedExtensions(): string[] {
    return [...FileScanner.SUPPORTED_EXTENSIONS];
  }

  /**
   * デフォルトの除外パターンを取得
   */
  getDefaultExclusions(): string[] {
    return [...FileScanner.DEFAULT_EXCLUSIONS];
  }
}
