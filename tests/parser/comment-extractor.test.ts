/**
 * Tests for Comment Extractor
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { CommentExtractor } from '../../src/parser/comment-extractor.js';
import { LanguageParser } from '../../src/parser/language-parser.js';
import {
  Language,
  CommentType,
  CommentMarker,
  CommentInfo,
} from '../../src/parser/types.js';

describe('CommentExtractor', () => {
  let languageParser: LanguageParser;
  let commentExtractor: CommentExtractor;

  beforeAll(() => {
    languageParser = new LanguageParser();
    commentExtractor = new CommentExtractor(languageParser);
  });

  const loadFixture = (filename: string): string => {
    const fixturePath = join(
      __dirname,
      '..',
      'fixtures',
      'comment-extraction',
      filename
    );
    return readFileSync(fixturePath, 'utf-8');
  };

  // Test helper functions
  const testMarkerDetection = (
    comments: CommentInfo[],
    markers: CommentMarker[]
  ) => {
    markers.forEach((marker) => {
      const markerComments = comments.filter((c) => c.marker === marker);
      expect(markerComments.length).toBeGreaterThan(0);
    });
  };

  const testCommentTypes = (
    comments: CommentInfo[],
    types: CommentType[]
  ) => {
    types.forEach((type) => {
      const typeComments = comments.filter((c) => c.type === type);
      expect(typeComments.length).toBeGreaterThan(0);
    });
  };

  describe('TypeScript/JavaScript', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.ts');
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      comments = result.comments;
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);

      const beforeFunction = singleLineComments.find((c) =>
        c.content.includes('Single line comment before function')
      );
      expect(beforeFunction).toBeDefined();
    });

    test('should extract JSDoc comments', () => {
      const jsdocComments = comments.filter(
        (c) => c.type === CommentType.DocComment
      );
      expect(jsdocComments.length).toBeGreaterThan(0);

      const addFunctionDoc = jsdocComments.find((c) =>
        c.content.includes('JSDoc comment for add function')
      );
      expect(addFunctionDoc).toBeDefined();
      expect(addFunctionDoc?.tags).toBeDefined();
      expect(addFunctionDoc?.tags?.length).toBeGreaterThan(0);

      // Check for @param tags
      const paramTags = addFunctionDoc?.tags?.filter((t) => t.name === 'param');
      expect(paramTags).toBeDefined();
      expect(paramTags?.length).toBeGreaterThanOrEqual(2);

      // Check for @returns tag
      const returnTag = addFunctionDoc?.tags?.find((t) => t.name === 'returns');
      expect(returnTag).toBeDefined();
    });

    test('should extract multi-line block comments', () => {
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );
      expect(multiLineComments.length).toBeGreaterThan(0);

      const userClassComment = multiLineComments.find((c) =>
        c.content.includes('Multi-line block comment')
      );
      expect(userClassComment).toBeDefined();
    });

    test('should detect TODO markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      expect(todoComments.length).toBeGreaterThan(0);

      const todoComment = todoComments.find((c) =>
        c.content.includes('Implement user validation')
      );
      expect(todoComment).toBeDefined();
    });

    test('should detect FIXME markers', () => {
      const fixmeComments = comments.filter(
        (c) => c.marker === CommentMarker.FIXME
      );
      expect(fixmeComments.length).toBeGreaterThan(0);

      const fixmeComment = fixmeComments.find((c) =>
        c.content.includes('placeholder implementation')
      );
      expect(fixmeComment).toBeDefined();
    });

    test('should detect NOTE markers', () => {
      const noteComments = comments.filter((c) => c.marker === CommentMarker.NOTE);
      expect(noteComments.length).toBeGreaterThan(0);
    });

    test('should detect HACK markers', () => {
      const hackComments = comments.filter((c) => c.marker === CommentMarker.HACK);
      expect(hackComments.length).toBeGreaterThan(0);
    });

    test('should detect XXX markers', () => {
      const xxxComments = comments.filter((c) => c.marker === CommentMarker.XXX);
      expect(xxxComments.length).toBeGreaterThan(0);
    });

    test('should detect BUG markers', () => {
      const bugComments = comments.filter((c) => c.marker === CommentMarker.BUG);
      expect(bugComments.length).toBeGreaterThan(0);
    });

    test('should associate comments with code elements', () => {
      const associatedComments = comments.filter((c) => c.associatedSymbol);
      expect(associatedComments.length).toBeGreaterThan(0);

      // JSDoc for add function should be associated with 'add'
      const addDoc = comments.find(
        (c) =>
          c.type === CommentType.DocComment &&
          c.content.includes('JSDoc comment for add function')
      );
      expect(addDoc?.associatedSymbol).toBe('add');

      // Constructor comment should be associated with 'constructor'
      const constructorDoc = comments.find(
        (c) =>
          c.type === CommentType.DocComment &&
          c.content.includes('Constructor comment')
      );
      expect(constructorDoc?.associatedSymbol).toBe('constructor');
    });
  });

  describe('Python', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.py');
      const result = commentExtractor.extractComments(code, Language.Python);
      comments = result.comments;
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);
    });

    test('should extract docstrings', () => {
      const docstrings = comments.filter((c) => c.type === CommentType.DocComment);
      expect(docstrings.length).toBeGreaterThan(0);

      const addFunctionDoc = docstrings.find((c) =>
        c.content.includes('Docstring for add function')
      );
      expect(addFunctionDoc).toBeDefined();
      expect(addFunctionDoc?.associatedSymbol).toBe('add');
    });

    test('should detect all special markers', () => {
      testMarkerDetection(comments, [
        CommentMarker.TODO,
        CommentMarker.FIXME,
        CommentMarker.NOTE,
      ]);
    });
  });

  describe('Go', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.go');
      const result = commentExtractor.extractComments(code, Language.Go);
      comments = result.comments;
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);
    });

    test('should extract multi-line comments', () => {
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );
      expect(multiLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const markedComments = comments.filter((c) => c.marker !== undefined);
      expect(markedComments.length).toBeGreaterThan(0);
    });
  });

  describe('Rust', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.rs');
      const result = commentExtractor.extractComments(code, Language.Rust);
      comments = result.comments;
    });

    test('should extract doc comments (///)', () => {
      const docComments = comments.filter((c) => c.type === CommentType.DocComment);
      expect(docComments.length).toBeGreaterThan(0);

      const addDoc = docComments.find((c) =>
        c.content.includes('Doc comment for add function')
      );
      expect(addDoc).toBeDefined();
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      expect(todoComments.length).toBeGreaterThan(0);
    });
  });

  describe('Java', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('Sample.java');
      const result = commentExtractor.extractComments(code, Language.Java);
      comments = result.comments;
    });

    test('should extract JavaDoc comments', () => {
      const javadocComments = comments.filter(
        (c) => c.type === CommentType.DocComment
      );
      expect(javadocComments.length).toBeGreaterThan(0);

      const classDoc = javadocComments.find((c) =>
        c.content.includes('JavaDoc comment for User class')
      );
      expect(classDoc).toBeDefined();
    });

    test('should extract single line and multi-line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );

      expect(singleLineComments.length).toBeGreaterThan(0);
      expect(multiLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const markedComments = comments.filter((c) => c.marker !== undefined);
      expect(markedComments.length).toBeGreaterThan(0);
    });
  });

  describe('C/C++', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.cpp');
      const result = commentExtractor.extractComments(code, Language.CPP);
      comments = result.comments;
    });

    test('should extract doc comments (@brief)', () => {
      const docComments = comments.filter((c) => c.type === CommentType.DocComment);
      expect(docComments.length).toBeGreaterThan(0);

      const addDoc = docComments.find((c) => c.content.includes('@brief Add'));
      expect(addDoc).toBeDefined();
    });

    test('should extract single line and multi-line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );

      expect(singleLineComments.length).toBeGreaterThan(0);
      expect(multiLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      const fixmeComments = comments.filter(
        (c) => c.marker === CommentMarker.FIXME
      );

      expect(todoComments.length).toBeGreaterThan(0);
      expect(fixmeComments.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    test('should handle empty code', () => {
      const result = commentExtractor.extractComments('', Language.TypeScript);
      expect(result.comments).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle code without comments', () => {
      const code = 'const x = 1; const y = 2;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle parse errors gracefully', () => {
      const invalidCode = 'function { invalid syntax }';
      const result = commentExtractor.extractComments(
        invalidCode,
        Language.TypeScript
      );
      // Should not throw, might have errors but still try to extract
      expect(result).toBeDefined();
    });

    test('should handle whitespace-only code', () => {
      const result = commentExtractor.extractComments('   \n  \t  \n   ', Language.TypeScript);
      expect(result.comments).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle Unknown language', () => {
      const code = '// comment';
      const result = commentExtractor.extractComments(code, Language.Unknown);
      expect(result.comments).toEqual([]);
      expect(result.hasError).toBe(false);
    });
  });

  describe('Edge cases for comment extraction', () => {
    test('should handle empty single-line comments', () => {
      const code = '//\nconst x = 1;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      // Empty comments should be skipped
      expect(result.comments).toEqual([]);
    });

    test('should handle single-line JSDoc', () => {
      const code = '/** Single line JSDoc */\nfunction foo() {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments.length).toBe(1);
      expect(result.comments[0]?.type).toBe(CommentType.DocComment);
      expect(result.comments[0]?.content).toContain('Single line JSDoc');
      expect(result.comments[0]?.associatedSymbol).toBe('foo');
    });

    test('should handle Python single-line docstring', () => {
      const code = 'def foo():\n    """Single line docstring"""\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      expect(result.comments.length).toBeGreaterThan(0);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docstring).toBeDefined();
      expect(docstring?.content).toContain('Single line docstring');
    });

    test('should handle Python multi-line docstring with content on first line', () => {
      const code = 'def foo():\n    """First line\n    Second line\n    Third line"""\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docstring).toBeDefined();
      expect(docstring?.content).toContain('First line');
      expect(docstring?.content).toContain('Second line');
      expect(docstring?.content).toContain('Third line');
    });

    test('should handle Python multi-line docstring with single quotes', () => {
      const code = "def foo():\n    '''Multi-line docstring\n    with single quotes'''\n    pass";
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docstring).toBeDefined();
      expect(docstring?.content).toContain('Multi-line docstring');
    });

    test('should handle Rust doc comments with multiple lines', () => {
      const code = '/// First line\n/// Second line\n/// Third line\nfn foo() {}';
      const result = commentExtractor.extractComments(code, Language.Rust);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment).toBeDefined();
      expect(docComment?.content).toContain('First line');
      expect(docComment?.content).toContain('Second line');
      expect(docComment?.associatedSymbol).toBe('foo');
    });

    test('should handle Rust module doc comments (//!)', () => {
      const code = '//! Module documentation\n//! Second line\nfn foo() {}';
      const result = commentExtractor.extractComments(code, Language.Rust);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment).toBeDefined();
      expect(docComment?.content).toContain('Module documentation');
    });

    test('should handle C++ doc comments (///)', () => {
      const code = '/// Function documentation\n/// Second line\nvoid foo() {}';
      const result = commentExtractor.extractComments(code, Language.CPP);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment).toBeDefined();
      expect(docComment?.content).toContain('Function documentation');
    });

    test('should handle multi-line comment on single line', () => {
      const code = '/* Single line block */\nconst x = 1;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments.length).toBe(1);
      expect(result.comments[0]?.type).toBe(CommentType.MultiLine);
      expect(result.comments[0]?.content).toContain('Single line block');
    });

    test('should handle multi-line comment with empty lines', () => {
      const code = '/*\n\n  Content\n\n*/\nconst x = 1;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments.length).toBe(1);
      expect(result.comments[0]?.type).toBe(CommentType.MultiLine);
      expect(result.comments[0]?.content).toContain('Content');
    });

    test('should handle inline comments', () => {
      const code = 'const x = 1; // Inline comment';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments.length).toBe(1);
      expect(result.comments[0]?.type).toBe(CommentType.SingleLine);
      expect(result.comments[0]?.content).toContain('Inline comment');
    });

    test('should not confuse /** with /*', () => {
      const code = '/* Not JSDoc */\n/** JSDoc */\nfunction foo() {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments.length).toBe(2);
      const multiLine = result.comments.find(c => c.type === CommentType.MultiLine);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(multiLine).toBeDefined();
      expect(docComment).toBeDefined();
      expect(docComment?.associatedSymbol).toBe('foo');
    });
  });

  describe('Doc tag extraction', () => {
    test('should extract JSDoc @param tags', () => {
      const code = '/**\n * @param x - First parameter\n * @param y - Second parameter\n */\nfunction add(x, y) {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment?.tags).toBeDefined();
      expect(docComment?.tags?.length).toBeGreaterThanOrEqual(2);
      const paramTags = docComment?.tags?.filter(t => t.name === 'param');
      expect(paramTags?.length).toBe(2);
    });

    test('should extract JSDoc @returns tag', () => {
      const code = '/**\n * @returns The sum\n */\nfunction add(x, y) {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      const returnTag = docComment?.tags?.find(t => t.name === 'returns');
      expect(returnTag).toBeDefined();
    });

    test('should extract Python docstring Args: tag', () => {
      const code = 'def foo(x, y):\n    """Function\n    Args:\n        x: First\n        y: Second\n    """\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      const argsTag = docstring?.tags?.find(t => t.name === 'args');
      expect(argsTag).toBeDefined();
    });

    test('should extract Python docstring Returns: tag', () => {
      const code = 'def foo():\n    """Function\n    Returns:\n        Something\n    """\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      const returnsTag = docstring?.tags?.find(t => t.name === 'returns');
      expect(returnsTag).toBeDefined();
    });

    test('should extract Python docstring Raises: tag', () => {
      const code = 'def foo():\n    """Function\n    Raises:\n        ValueError: When invalid\n    """\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      const raisesTag = docstring?.tags?.find(t => t.name === 'raises');
      expect(raisesTag).toBeDefined();
    });

    test('should extract Python docstring Yields: tag', () => {
      const code = 'def foo():\n    """Generator\n    Yields:\n        int: Numbers\n    """\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      const yieldsTag = docstring?.tags?.find(t => t.name === 'yields');
      expect(yieldsTag).toBeDefined();
    });

    test('should extract Rust # Arguments tag', () => {
      const code = '/// Function\n/// # Arguments\n/// * `x` - First\nfn foo(x: i32) {}';
      const result = commentExtractor.extractComments(code, Language.Rust);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      const argsTag = docComment?.tags?.find(t => t.name === 'arguments');
      expect(argsTag).toBeDefined();
    });
  });

  describe('Symbol association', () => {
    test('should associate comment with symbol within 3 lines', () => {
      const code = '/**\n * Doc comment\n */\n\n\nfunction foo() {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment?.associatedSymbol).toBe('foo');
    });

    test('should not associate comment with symbol more than 3 lines away', () => {
      const code = '/**\n * Doc comment\n */\n\n\n\n\nfunction foo() {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment?.associatedSymbol).toBeUndefined();
    });

    test('should associate comment with class', () => {
      const code = '/**\n * Class documentation\n */\nclass User {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment?.associatedSymbol).toBe('User');
    });

    test('should associate comment with method', () => {
      const code = 'class User {\n  /**\n   * Method doc\n   */\n  getName() {}\n}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.content.includes('Method doc'));
      expect(docComment?.associatedSymbol).toBe('getName');
    });
  });

  describe('Special marker detection', () => {
    test('should detect all marker types', () => {
      const markers = ['TODO', 'FIXME', 'NOTE', 'HACK', 'XXX', 'BUG'];
      for (const marker of markers) {
        const code = `// ${marker}: Test comment`;
        const result = commentExtractor.extractComments(code, Language.TypeScript);
        expect(result.comments[0]?.marker).toBe(marker);
      }
    });

    test('should detect markers in multi-line comments', () => {
      const code = '/**\n * TODO: Implement this\n */\nfunction foo() {}';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const docComment = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docComment?.marker).toBe(CommentMarker.TODO);
    });

    test('should detect markers in Python docstrings', () => {
      const code = 'def foo():\n    """FIXME: Fix this\n    """\n    pass';
      const result = commentExtractor.extractComments(code, Language.Python);
      const docstring = result.comments.find(c => c.type === CommentType.DocComment);
      expect(docstring?.marker).toBe(CommentMarker.FIXME);
    });
  });

  describe('Position information', () => {
    test('should provide correct line numbers for single-line comments', () => {
      const code = 'const x = 1;\n// Comment on line 2\nconst y = 2;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments[0]?.position.startLine).toBe(1);
      expect(result.comments[0]?.position.endLine).toBe(1);
    });

    test('should provide correct line numbers for multi-line comments', () => {
      const code = 'const x = 1;\n/*\n * Line 2\n * Line 3\n */\nconst y = 2;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      const multiLine = result.comments.find(c => c.type === CommentType.MultiLine);
      expect(multiLine?.position.startLine).toBe(1);
      expect(multiLine?.position.endLine).toBe(4);
    });

    test('should provide column information for inline comments', () => {
      const code = 'const x = 1; // Inline';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments[0]?.position.startColumn).toBeGreaterThan(0);
      expect(result.comments[0]?.position.endColumn).toBeGreaterThan(result.comments[0]?.position.startColumn || 0);
    });
  });
});
