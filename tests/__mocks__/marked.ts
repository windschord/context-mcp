// markedのモック（Jestでの動作用）
export interface Token {
  type: string;
  raw: string;
  [key: string]: any;
}

export const marked = {
  lexer: (content: string): Token[] => {
    const tokens: Token[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 見出しの検出
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        tokens.push({
          type: 'heading',
          raw: line,
          depth: headingMatch[1].length,
          text: headingMatch[2],
          tokens: [],
        });
        i++;
        continue;
      }

      // コードブロックの検出
      if (trimmed.startsWith('```')) {
        const lang = trimmed.substring(3).trim();
        const codeLines: string[] = [];
        const startLine = i;
        i++;

        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // 閉じる```をスキップ

        tokens.push({
          type: 'code',
          raw: lines.slice(startLine, i).join('\n'),
          lang: lang,
          text: codeLines.join('\n'),
        });
        continue;
      }

      // パラグラフとして処理
      if (
        trimmed.length > 0 &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('-') &&
        !trimmed.startsWith('1.')
      ) {
        const inlineTokens = extractInlineTokens(line);
        tokens.push({
          type: 'paragraph',
          raw: line,
          text: trimmed,
          tokens: inlineTokens,
        });
      }

      // リストの検出
      if (trimmed.startsWith('-') || trimmed.match(/^\d+\./)) {
        const listItems: Token[] = [];
        const startLine = i;

        while (i < lines.length) {
          const itemLine = lines[i].trim();
          if (!itemLine.startsWith('-') && !itemLine.match(/^\d+\./)) {
            break;
          }

          const itemText = itemLine.replace(/^(-|\d+\.)\s*/, '');
          const inlineTokens = extractInlineTokens(itemText);

          listItems.push({
            type: 'list_item',
            raw: lines[i],
            text: itemText,
            tokens: [
              {
                type: 'text',
                raw: itemText,
                text: itemText,
                tokens: inlineTokens,
              },
            ],
          });
          i++;
        }

        tokens.push({
          type: 'list',
          raw: lines.slice(startLine, i).join('\n'),
          items: listItems,
        });
        continue;
      }

      i++;
    }

    return tokens;
  },
};

function extractInlineTokens(text: string): Token[] {
  const tokens: Token[] = [];

  // リンクの検出
  const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    tokens.push({
      type: 'link',
      raw: match[0],
      text: match[1],
      href: match[2],
    });
  }

  // 画像の検出
  const imageRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
  while ((match = imageRegex.exec(text)) !== null) {
    tokens.push({
      type: 'image',
      raw: match[0],
      text: match[1],
      href: match[2],
    });
  }

  // コードスパンの検出
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(text)) !== null) {
    tokens.push({
      type: 'codespan',
      raw: match[0],
      text: match[1],
    });
  }

  // その他のテキスト
  if (tokens.length === 0) {
    tokens.push({
      type: 'text',
      raw: text,
      text: text,
    });
  }

  return tokens;
}

export default marked;
