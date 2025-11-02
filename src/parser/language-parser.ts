import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import Java from 'tree-sitter-java';
import Cpp from 'tree-sitter-cpp';
import { Language, ParseResult, ExtensionMapping } from './types.js';

/**
 * LanguageParser: Tree-sitterを使用してソースコードをパースするクラス
 */
export class LanguageParser {
  private parsers: Map<Language, Parser> = new Map();
  private extensionMap: ExtensionMapping;

  constructor() {
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
   */
  async initialize(): Promise<void> {
    // TypeScript/JavaScript parser
    const tsParser = new Parser();
    tsParser.setLanguage(TypeScript.typescript as any);
    this.parsers.set(Language.TypeScript, tsParser);

    const jsParser = new Parser();
    jsParser.setLanguage(TypeScript.typescript as any); // TypeScript parser handles JS too
    this.parsers.set(Language.JavaScript, jsParser);

    // Python parser
    const pythonParser = new Parser();
    pythonParser.setLanguage(Python as any);
    this.parsers.set(Language.Python, pythonParser);

    // Go parser
    const goParser = new Parser();
    goParser.setLanguage(Go as any);
    this.parsers.set(Language.Go, goParser);

    // Rust parser
    const rustParser = new Parser();
    rustParser.setLanguage(Rust as any);
    this.parsers.set(Language.Rust, rustParser);

    // Java parser
    const javaParser = new Parser();
    javaParser.setLanguage(Java as any);
    this.parsers.set(Language.Java, javaParser);

    // C parser
    const cParser = new Parser();
    cParser.setLanguage(Cpp as any);
    this.parsers.set(Language.C, cParser);

    // C++ parser
    const cppParser = new Parser();
    cppParser.setLanguage(Cpp as any);
    this.parsers.set(Language.CPP, cppParser);
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
    return this.parsers.has(language);
  }

  /**
   * ソースコードをパース
   */
  parse(code: string, language: Language): ParseResult {
    if (code === null || code === undefined) {
      throw new Error('Code cannot be null or undefined');
    }

    const parser = this.parsers.get(language);
    if (!parser) {
      throw new Error(`No parser available for language: ${language}`);
    }

    const tree = parser.parse(code);
    const hasError = tree.rootNode.hasError;

    return {
      tree,
      hasError,
      language,
    };
  }
}
