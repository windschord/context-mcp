import { Language, ParseResult, ExtensionMapping } from './types';
import { ParserPool } from './parser-pool';

/**
 * LanguageParser: Tree-sitterを使用してソースコードをパースするクラス
 */
export class LanguageParser {
  private parserPool: ParserPool;
  private extensionMap: ExtensionMapping;

  constructor() {
    this.parserPool = new ParserPool({ maxPoolSize: 4 });
    this.extensionMap = {
      '.ts': Language.TypeScript,
      '.tsx': Language.TypeScript,
      '.js': Language.JavaScript,
      '.jsx': Language.JavaScript,
      '.mjs': Language.JavaScript,
      '.py': Language.Python,
      '.pyi': Language.Python,
      '.go': Language.Go,
      '.rs': Language.Rust,
      '.java': Language.Java,
      '.c': Language.C,
      '.h': Language.C,
      '.cpp': Language.CPP,
      '.cc': Language.CPP,
      '.cxx': Language.CPP,
      '.hpp': Language.CPP,
      '.ino': Language.CPP, // Arduino files are treated as C++
    };
  }

  /**
   * パーサーの初期化
   * Note: ParserPoolを使用する場合、事前の初期化は不要です。
   * パーサーはオンデマンドで作成されます。
   */
  async initialize(): Promise<void> {
    // LanguageRegistryは既に初期化されているため、
    // ここでは何もしない
  }

  /**
   * ファイル名から言語を検出
   */
  detectLanguage(filePath: string): Language {
    const ext = this.getFileExtension(filePath);
    return this.extensionMap[ext] || Language.Unknown;
  }

  /**
   * ファイル拡張子を取得（.を含む）
   */
  private getFileExtension(filePath: string): string {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  /**
   * 指定した言語のパーサーが存在するか確認
   */
  hasParser(language: Language): boolean {
    // ParserPoolはすべてのLanguageに対応しているため、
    // Unknownでなければtrueを返す
    return language !== Language.Unknown;
  }

  /**
   * ソースコードをパース
   */
  parse(code: string, language: Language): ParseResult {
    if (code === null || code === undefined) {
      throw new Error('Code cannot be null or undefined');
    }

    if (language === Language.Unknown) {
      throw new Error('Cannot parse code with Unknown language');
    }

    // ParserPoolからパーサーを取得して使用
    const parser = this.parserPool.acquire(language);
    try {
      const tree = parser.parse(code);
      const hasError = tree?.rootNode?.hasError ?? true;

      return {
        tree,
        hasError,
        language,
      };
    } finally {
      // パーサーをプールに戻す
      this.parserPool.release(language, parser);
    }
  }

  /**
   * ParserPoolのクリーンアップ
   */
  cleanup(): void {
    this.parserPool.clear();
  }
}
