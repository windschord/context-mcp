import type { marked as markedType, Token } from 'marked';

// markedのインポートを遅延実行
let marked: typeof markedType;
async function getMarked(): Promise<typeof markedType> {
  if (!marked) {
    const markedModule = await import('marked');
    marked = markedModule.marked;
  }
  return marked;
}

/**
 * 見出しノードの情報
 */
export interface HeadingNode {
  level: number; // 見出しレベル (1-6)
  text: string; // 見出しテキスト
  line: number; // 行番号
}

/**
 * コードブロックノードの情報
 */
export interface CodeBlockNode {
  language: string; // 言語タグ（例: typescript, python）
  code: string; // コード内容
  startLine: number; // 開始行番号
  endLine: number; // 終了行番号
}

/**
 * リンクノードの情報
 */
export interface LinkNode {
  text: string; // リンクテキスト
  url: string; // URL
  type: 'internal' | 'external'; // リンク種別
  line: number; // 行番号
}

/**
 * ファイルパス参照の情報
 */
export interface FilePathReference {
  path: string; // ファイルパス
  isAbsolute: boolean; // 絶対パスかどうか
  line: number; // 行番号
}

/**
 * 画像ノードの情報
 */
export interface ImageNode {
  alt: string; // alt text
  url: string; // 画像URL
  line: number; // 行番号
}

/**
 * Markdownドキュメント全体の解析結果
 */
export interface MarkdownDocument {
  headings: HeadingNode[];
  codeBlocks: CodeBlockNode[];
  links: LinkNode[];
  filePaths: FilePathReference[];
  images: ImageNode[];
}

/**
 * Markdownパーサー
 * Markdownファイルの構造解析と情報抽出を行う
 */
export class MarkdownParser {
  /**
   * Markdownテキストを解析する
   * @param content Markdownテキスト
   * @returns 解析結果
   */
  async parse(content: string): Promise<MarkdownDocument> {
    const headings: HeadingNode[] = [];
    const codeBlocks: CodeBlockNode[] = [];
    const links: LinkNode[] = [];
    const filePaths: FilePathReference[] = [];
    const images: ImageNode[] = [];

    // 行番号マッピング用
    const lines = content.split('\n');

    // markedのトークナイザーを使用してパース
    const markedInstance = await getMarked();
    const tokens = markedInstance.lexer(content);

    // トークンを走査して情報を抽出
    this.extractFromTokens(tokens, lines, headings, codeBlocks, links, images, filePaths);

    return {
      headings,
      codeBlocks,
      links,
      filePaths,
      images,
    };
  }

  /**
   * トークンから情報を抽出する
   */
  private extractFromTokens(
    tokens: Token[],
    lines: string[],
    headings: HeadingNode[],
    codeBlocks: CodeBlockNode[],
    links: LinkNode[],
    images: ImageNode[],
    filePaths: FilePathReference[],
    startLine: number = 0
  ): void {
    let currentLine = startLine;
    for (const token of tokens) {
      // 行番号を取得（rawテキストから計算）
      const lineNumber = this.getLineNumber(token.raw, lines, currentLine);
      currentLine = lineNumber + 1;

      switch (token.type) {
        case 'heading':
          headings.push({
            level: token.depth,
            text: token.text,
            line: lineNumber,
          });
          break;

        case 'code': {
          const codeLines = token.text.split('\n');
          codeBlocks.push({
            language: token.lang || '',
            code: token.text,
            startLine: lineNumber,
            endLine: lineNumber + codeLines.length - 1,
          });
          break;
        }

        case 'paragraph':
        case 'text':
          // テキスト内のリンクや画像、ファイルパスを抽出
          if ('tokens' in token && token.tokens) {
            this.extractInlineElements(token.tokens, lineNumber, links, images, filePaths);
          }
          break;

        case 'list':
          // リスト内の要素を再帰的に処理
          if ('items' in token && token.items) {
            this.extractFromTokens(
              token.items,
              lines,
              headings,
              codeBlocks,
              links,
              images,
              filePaths,
              lineNumber
            );
          }
          break;

        case 'list_item':
          if ('tokens' in token && token.tokens) {
            this.extractFromTokens(
              token.tokens,
              lines,
              headings,
              codeBlocks,
              links,
              images,
              filePaths,
              lineNumber
            );
          }
          break;
      }
    }
  }

  /**
   * インライン要素（リンク、画像、ファイルパス）を抽出
   */
  private extractInlineElements(
    tokens: Token[],
    lineNumber: number,
    links: LinkNode[],
    images: ImageNode[],
    filePaths: FilePathReference[]
  ): void {
    for (const token of tokens) {
      switch (token.type) {
        case 'link':
          links.push({
            text: token.text,
            url: token.href,
            type: this.getLinkType(token.href),
            line: lineNumber,
          });
          break;

        case 'image':
          images.push({
            alt: token.text,
            url: token.href,
            line: lineNumber,
          });
          break;

        case 'codespan': {
          // インラインコード内のファイルパス参照を検出
          const filePath = this.extractFilePath(token.text);
          if (filePath) {
            filePaths.push({
              path: filePath,
              isAbsolute: filePath.startsWith('/'),
              line: lineNumber,
            });
          }
          break;
        }

        case 'text':
          // ネストされたトークンを処理
          if ('tokens' in token && token.tokens) {
            this.extractInlineElements(token.tokens, lineNumber, links, images, filePaths);
          }
          break;
      }
    }
  }

  /**
   * リンクの種別を判定する
   */
  private getLinkType(url: string): 'internal' | 'external' {
    // http/httpsで始まるまたは//で始まる場合は外部リンク
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return 'external';
    }
    // それ以外は内部リンク
    return 'internal';
  }

  /**
   * テキストからファイルパスを抽出
   * ファイルパスの形式: src/file.ts, ./file.ts, /absolute/path.ts
   */
  private extractFilePath(text: string): string | null {
    // ファイルパスのパターン（拡張子付き）
    const filePathPattern = /^(?:\.{0,2}\/)?(?:[\w-]+\/)*[\w-]+\.[\w]+$/;

    if (filePathPattern.test(text.trim())) {
      return text.trim();
    }

    return null;
  }

  /**
   * トークンの行番号を取得
   */
  private getLineNumber(raw: string, lines: string[], startLine: number = 0): number {
    // rawテキストの最初の行を使って行番号を特定
    const firstLine = raw.split('\n')[0]?.trim();
    if (!firstLine) {
      return startLine;
    }

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (line && (line.trim() === firstLine || line.includes(firstLine))) {
        return i;
      }
    }
    return startLine;
  }
}
