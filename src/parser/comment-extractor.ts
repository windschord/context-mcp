/**
 * Comment Extractor: ソースコードからコメントとdocstringを抽出
 */

import { LanguageParser } from './language-parser.js';
import { ASTEngine } from './ast-engine.js';
import {
  Language,
  CommentType,
  CommentMarker,
  CommentInfo,
  CommentTag,
  CommentExtractionResult,
  ParserError,
} from './types.js';

/**
 * CommentExtractor: コメント抽出クラス
 */
export class CommentExtractor {
  private astEngine: ASTEngine;

  // 特殊マーカーの正規表現
  private static readonly MARKER_REGEX = /(TODO|FIXME|NOTE|HACK|XXX|BUG):/;

  // 各言語のコメント構文定義
  private static readonly COMMENT_PATTERNS: Record<
    Language,
    {
      singleLine: string[];
      multiLineStart: string[];
      multiLineEnd: string[];
      docComment: string[];
    }
  > = {
    [Language.TypeScript]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: ['/**'], // JSDoc
    },
    [Language.JavaScript]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: ['/**'], // JSDoc
    },
    [Language.Python]: {
      singleLine: ['#'],
      multiLineStart: ['"""', "'''"],
      multiLineEnd: ['"""', "'''"],
      docComment: ['"""', "'''"], // Python docstring
    },
    [Language.Go]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: [], // Go uses // for doc comments, but we'll handle it differently
    },
    [Language.Rust]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: ['///', '//!'], // Rust doc comments
    },
    [Language.Java]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: ['/**'], // JavaDoc
    },
    [Language.C]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: ['/**'], // Doxygen
    },
    [Language.CPP]: {
      singleLine: ['//'],
      multiLineStart: ['/*'],
      multiLineEnd: ['*/'],
      docComment: ['/**', '///'], // Doxygen
    },
    [Language.Unknown]: {
      singleLine: [],
      multiLineStart: [],
      multiLineEnd: [],
      docComment: [],
    },
  };

  constructor(languageParser: LanguageParser) {
    this.astEngine = new ASTEngine(languageParser);
  }

  /**
   * ソースコードからコメントを抽出
   * @param code ソースコード
   * @param language プログラミング言語
   * @returns コメント抽出結果
   */
  extractComments(code: string, language: Language): CommentExtractionResult {
    const comments: CommentInfo[] = [];
    const errors: ParserError[] = [];

    try {
      // 空のコードはスキップ
      if (!code || code.trim().length === 0) {
        return {
          comments: [],
          language,
          hasError: false,
        };
      }

      // ASTを解析してコメントノードを取得
      const parseResult = this.astEngine.parseToAST(code, language);

      // Tree-sitterではコメントは通常のノードとして表示されないため、
      // ソースコードを直接解析する必要がある
      const extractedComments = this.extractCommentsFromSource(
        code,
        language,
        parseResult.rootNode
      );

      comments.push(...extractedComments);

      return {
        comments,
        language,
        hasError: parseResult.hasError,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      });

      return {
        comments,
        language,
        hasError: true,
        errors,
      };
    }
  }

  /**
   * ソースコードから直接コメントを抽出
   * @param code ソースコード
   * @param language プログラミング言語
   * @param rootNode ASTルートノード
   * @returns コメント情報の配列
   */
  private extractCommentsFromSource(
    code: string,
    language: Language,
    rootNode: any
  ): CommentInfo[] {
    const comments: CommentInfo[] = [];
    const lines = code.split('\n');
    const patterns = CommentExtractor.COMMENT_PATTERNS[language];

    // シンボル情報を取得して、コメントとの関連付けに使用
    const symbols = this.extractSymbolPositions(rootNode);

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i++;
        continue;
      }
      const trimmedLine = line.trim();

      // Doc comment チェック (優先度高)
      const docCommentResult = this.tryExtractDocComment(
        lines,
        i,
        trimmedLine,
        patterns,
        language
      );
      if (docCommentResult) {
        const comment = this.associateCommentWithSymbol(
          docCommentResult.comment,
          symbols,
          i
        );
        comments.push(comment);
        i = docCommentResult.nextLine;
        continue;
      }

      // Multi-line comment チェック
      const multiLineResult = this.tryExtractMultiLineComment(
        lines,
        i,
        trimmedLine,
        patterns
      );
      if (multiLineResult) {
        const comment = this.associateCommentWithSymbol(
          multiLineResult.comment,
          symbols,
          i
        );
        comments.push(comment);
        i = multiLineResult.nextLine;
        continue;
      }

      // Single line comment チェック
      const singleLineComment = this.tryExtractSingleLineComment(
        line,
        i,
        trimmedLine,
        patterns
      );
      if (singleLineComment) {
        const comment = this.associateCommentWithSymbol(
          singleLineComment,
          symbols,
          i
        );
        comments.push(comment);
      }

      i++;
    }

    return comments;
  }

  /**
   * Doc commentの抽出を試みる
   */
  private tryExtractDocComment(
    lines: string[],
    startLine: number,
    trimmedLine: string,
    patterns: (typeof CommentExtractor.COMMENT_PATTERNS)[Language],
    language: Language
  ): { comment: CommentInfo; nextLine: number } | null {
    for (const docPattern of patterns.docComment) {
      if (trimmedLine.startsWith(docPattern)) {
        // Pythonのdocstringの場合
        if (language === Language.Python && (docPattern === '"""' || docPattern === "'''")) {
          return this.extractPythonDocstring(lines, startLine, docPattern);
        }

        // Rustの///または//!の場合
        if (language === Language.Rust && (docPattern === '///' || docPattern === '//!')) {
          return this.extractRustDocComment(lines, startLine, docPattern);
        }

        // C++の///の場合
        if (language === Language.CPP && docPattern === '///') {
          return this.extractCppDocComment(lines, startLine);
        }

        // JSDoc, JavaDoc, Doxygenの場合
        if (docPattern === '/**') {
          return this.extractBlockDocComment(lines, startLine, '/**', '*/');
        }
      }
    }

    return null;
  }

  /**
   * Python docstringの抽出
   */
  private extractPythonDocstring(
    lines: string[],
    startLine: number,
    delimiter: string
  ): { comment: CommentInfo; nextLine: number } {
    const content: string[] = [];
    let endLine = startLine;

    // @ts-ignore - array bounds are checked in calling code
    const firstLine = lines[startLine].trim();
    const contentAfterStart = firstLine.substring(delimiter.length);

    // 1行で閉じている場合
    if (
      contentAfterStart.endsWith(delimiter) &&
      contentAfterStart.length > delimiter.length
    ) {
      content.push(
        contentAfterStart.substring(0, contentAfterStart.length - delimiter.length)
      );
    } else {
      // 最初の行に内容がある場合
      if (contentAfterStart.length > 0) {
        content.push(contentAfterStart);
      }

      // 複数行の場合
      endLine++;
      while (endLine < lines.length) {
        // @ts-ignore - array bounds are checked in loop condition
        const line = lines[endLine];
        if (line && line.trim().endsWith(delimiter)) {
          const lineContent = line.substring(
            0,
            line.lastIndexOf(delimiter)
          );
          if (lineContent.trim().length > 0) {
            content.push(lineContent);
          }
          break;
        }
        if (line) {
          content.push(line);
        }
        endLine++;
      }
    }

    const comment: CommentInfo = {
      type: CommentType.DocComment,
      content: content.join('\n'),
      position: {
        startLine,
        startColumn: 0,
        endLine,
        endColumn: lines[endLine]?.length || 0,
      },
      marker: this.detectMarker(content.join('\n')),
    };

    return { comment, nextLine: endLine + 1 };
  }

  /**
   * Rust doc commentの抽出 (/// または //!)
   */
  private extractRustDocComment(
    lines: string[],
    startLine: number,
    prefix: string
  ): { comment: CommentInfo; nextLine: number } {
    const content: string[] = [];
    let endLine = startLine;

    while (endLine < lines.length) {
      // @ts-ignore - array bounds are checked in loop condition
      const line = lines[endLine].trim();
      if (!line.startsWith(prefix)) {
        break;
      }
      content.push(line.substring(prefix.length).trim());
      endLine++;
    }

    const comment: CommentInfo = {
      type: CommentType.DocComment,
      content: content.join('\n'),
      position: {
        startLine,
        startColumn: 0,
        endLine: endLine - 1,
        endColumn: lines[endLine - 1]?.length || 0,
      },
      marker: this.detectMarker(content.join('\n')),
      tags: this.extractDocTags(content.join('\n')),
    };

    return { comment, nextLine: endLine };
  }

  /**
   * C++ doc commentの抽出 (///)
   */
  private extractCppDocComment(
    lines: string[],
    startLine: number
  ): { comment: CommentInfo; nextLine: number } {
    const content: string[] = [];
    let endLine = startLine;

    while (endLine < lines.length) {
      // @ts-ignore - array bounds are checked in loop condition
      const line = lines[endLine].trim();
      if (!line.startsWith('///')) {
        break;
      }
      content.push(line.substring(3).trim());
      endLine++;
    }

    const comment: CommentInfo = {
      type: CommentType.DocComment,
      content: content.join('\n'),
      position: {
        startLine,
        startColumn: 0,
        endLine: endLine - 1,
        endColumn: lines[endLine - 1]?.length || 0,
      },
      marker: this.detectMarker(content.join('\n')),
      tags: this.extractDocTags(content.join('\n')),
    };

    return { comment, nextLine: endLine };
  }

  /**
   * Block doc comment の抽出
   */
  private extractBlockDocComment(
    lines: string[],
    startLine: number,
    startDelimiter: string,
    endDelimiter: string
  ): { comment: CommentInfo; nextLine: number } {
    const content: string[] = [];
    let endLine = startLine;

    // @ts-ignore - array bounds are checked in calling code
    const firstLine = lines[startLine] || '';
    const firstLineContent = firstLine.substring(
      firstLine.indexOf(startDelimiter) + startDelimiter.length
    );

    // 1行で閉じている場合
    if (firstLineContent.includes(endDelimiter)) {
      const singleLineContent = firstLineContent.substring(
        0,
        firstLineContent.indexOf(endDelimiter)
      );
      content.push(singleLineContent.trim());
    } else {
      // 複数行の場合
      if (firstLineContent.trim().length > 0) {
        content.push(firstLineContent.trim());
      }

      endLine++;
      while (endLine < lines.length) {
        const line = lines[endLine];
        if (!line) {
          endLine++;
          continue;
        }
        if (line.includes(endDelimiter)) {
          const lineContent = line.substring(0, line.indexOf(endDelimiter));
          const cleaned = lineContent.trim();
          // 先頭の * を削除
          const withoutAsterisk = cleaned.startsWith('*')
            ? cleaned.substring(1).trim()
            : cleaned;
          if (withoutAsterisk.length > 0) {
            content.push(withoutAsterisk);
          }
          break;
        }
        const cleaned = line.trim();
        const withoutAsterisk = cleaned.startsWith('*')
          ? cleaned.substring(1).trim()
          : cleaned;
        if (withoutAsterisk.length > 0) {
          content.push(withoutAsterisk);
        }
        endLine++;
      }
    }

    const comment: CommentInfo = {
      type: CommentType.DocComment,
      content: content.join('\n'),
      position: {
        startLine,
        startColumn: 0,
        endLine,
        endColumn: lines[endLine]?.length || 0,
      },
      marker: this.detectMarker(content.join('\n')),
      tags: this.extractDocTags(content.join('\n')),
    };

    return { comment, nextLine: endLine + 1 };
  }

  /**
   * Multi-line commentの抽出を試みる
   */
  private tryExtractMultiLineComment(
    lines: string[],
    startLine: number,
    trimmedLine: string,
    patterns: (typeof CommentExtractor.COMMENT_PATTERNS)[Language]
  ): { comment: CommentInfo; nextLine: number } | null {
    for (let i = 0; i < patterns.multiLineStart.length; i++) {
      const startPattern = patterns.multiLineStart[i];
      const endPattern = patterns.multiLineEnd[i];

      if (!startPattern || !endPattern) {
        continue;
      }

      if (
        trimmedLine.startsWith(startPattern) &&
        !trimmedLine.startsWith('/' + '**') // Doc commentは除外
      ) {
        return this.extractMultiLineComment(
          lines,
          startLine,
          startPattern,
          endPattern
        );
      }
    }

    return null;
  }

  /**
   * Multi-line commentの抽出
   */
  private extractMultiLineComment(
    lines: string[],
    startLine: number,
    startPattern: string,
    endPattern: string
  ): { comment: CommentInfo; nextLine: number } {
    const content: string[] = [];
    let endLine = startLine;

    const firstLine = lines[startLine];
    if (!firstLine) {
      return {
        comment: {
          type: CommentType.MultiLine,
          content: '',
          position: {
            startLine,
            startColumn: 0,
            endLine,
            endColumn: 0,
          },
        },
        nextLine: startLine + 1,
      };
    }

    const firstLineContent = firstLine.substring(
      firstLine.indexOf(startPattern) + startPattern.length
    );

    // 1行で閉じている場合
    if (firstLineContent.includes(endPattern)) {
      const singleLineContent = firstLineContent.substring(
        0,
        firstLineContent.indexOf(endPattern)
      );
      content.push(singleLineContent.trim());
    } else {
      // 複数行の場合
      if (firstLineContent.trim().length > 0) {
        content.push(firstLineContent.trim());
      }

      endLine++;
      while (endLine < lines.length) {
        const line = lines[endLine];
        if (!line) {
          endLine++;
          continue;
        }
        if (line.includes(endPattern)) {
          const lineContent = line.substring(0, line.indexOf(endPattern));
          if (lineContent.trim().length > 0) {
            content.push(lineContent.trim());
          }
          break;
        }
        content.push(line.trim());
        endLine++;
      }
    }

    const comment: CommentInfo = {
      type: CommentType.MultiLine,
      content: content.join('\n'),
      position: {
        startLine,
        startColumn: 0,
        endLine,
        endColumn: lines[endLine]?.length || 0,
      },
      marker: this.detectMarker(content.join('\n')),
    };

    return { comment, nextLine: endLine + 1 };
  }

  /**
   * Single line commentの抽出を試みる
   */
  private tryExtractSingleLineComment(
    line: string,
    lineNumber: number,
    _trimmedLine: string,
    patterns: (typeof CommentExtractor.COMMENT_PATTERNS)[Language]
  ): CommentInfo | null {
    for (const pattern of patterns.singleLine) {
      if (!pattern) {
        continue;
      }
      const index = line.indexOf(pattern);
      if (index !== -1) {
        const content = line.substring(index + pattern.length).trim();

        // 空のコメントはスキップ
        if (content.length === 0) {
          continue;
        }

        const comment: CommentInfo = {
          type: CommentType.SingleLine,
          content,
          position: {
            startLine: lineNumber,
            startColumn: index,
            endLine: lineNumber,
            endColumn: line.length,
          },
          marker: this.detectMarker(content),
        };

        return comment;
      }
    }

    return null;
  }

  /**
   * 特殊マーカーを検出
   */
  private detectMarker(content: string): CommentMarker | undefined {
    const match = content.match(CommentExtractor.MARKER_REGEX);
    if (match && match[1]) {
      return match[1] as CommentMarker;
    }
    return undefined;
  }

  /**
   * Doc commentからタグを抽出
   */
  private extractDocTags(content: string): CommentTag[] {
    const tags: CommentTag[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // JSDoc/JavaDoc style: @param, @return, @throws, etc.
      const jsdocMatch = line.match(/@(\w+)\s+(.+)/);
      if (jsdocMatch && jsdocMatch[1] && jsdocMatch[2]) {
        const name = jsdocMatch[1];
        const rest = jsdocMatch[2];
        const parts = rest.split(/\s+-\s+/);
        tags.push({
          name,
          value: parts[0]?.trim() || '',
          description: parts[1]?.trim(),
        });
        continue;
      }

      // Rust/Doxygen style: # Arguments, # Returns, etc.
      const rustMatch = line.match(/#\s+(\w+)/);
      if (rustMatch && rustMatch[1]) {
        tags.push({
          name: rustMatch[1].toLowerCase(),
          value: '',
        });
        continue;
      }

      // Python docstring style: Args:, Returns:, Raises:
      const pythonMatch = line.match(/^(Args|Returns|Raises|Yields):/);
      if (pythonMatch && pythonMatch[1]) {
        tags.push({
          name: pythonMatch[1].toLowerCase(),
          value: '',
        });
      }
    }

    return tags;
  }

  /**
   * ASTからシンボル位置情報を抽出
   */
  private extractSymbolPositions(
    rootNode: any
  ): Array<{ name: string; line: number }> {
    const symbols: Array<{ name: string; line: number }> = [];

    // 関数、クラス、メソッドなどの定義を検索
    const symbolNodeTypes = [
      'function_definition',
      'function_declaration',
      'method_definition',
      'class_definition',
      'class_declaration',
      'struct_item',
      'impl_item',
      'type_definition',
    ];

    this.astEngine.findNodesByTypes(rootNode, symbolNodeTypes).forEach((node) => {
      const nameNode = this.findNameNode(node);
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          line: node.startPosition.row,
        });
      }
    });

    return symbols;
  }

  /**
   * ノードから名前ノードを検索
   */
  private findNameNode(node: any): any {
    // よくある名前フィールド
    const nameFields = ['name', 'declarator', 'identifier'];

    for (const field of nameFields) {
      if (node[field]) {
        return this.extractIdentifier(node[field]);
      }
    }

    // 子ノードから identifier を検索
    for (const child of node.children || []) {
      if (child.type === 'identifier') {
        return child;
      }
    }

    return null;
  }

  /**
   * identifier ノードを抽出
   */
  private extractIdentifier(node: any): any {
    if (node.type === 'identifier') {
      return node;
    }

    // 再帰的に検索
    for (const child of node.children || []) {
      if (child.type === 'identifier') {
        return child;
      }
    }

    return null;
  }

  /**
   * コメントとシンボルを関連付け
   */
  private associateCommentWithSymbol(
    comment: CommentInfo,
    symbols: Array<{ name: string; line: number }>,
    _commentLine: number
  ): CommentInfo {
    // コメントの直後にあるシンボルを検索
    for (const symbol of symbols) {
      // コメントが終わった次の行からの数行以内にシンボルがあれば関連付け
      if (
        symbol.line > comment.position.endLine &&
        symbol.line <= comment.position.endLine + 3
      ) {
        return {
          ...comment,
          associatedSymbol: symbol.name,
        };
      }
    }

    return comment;
  }
}
