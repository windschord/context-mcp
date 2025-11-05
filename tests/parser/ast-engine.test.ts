/**
 * AST Engine Tests
 * タスク2.2: AST解析エンジンの実装のテスト
 */

import * as fs from 'fs';
import * as path from 'path';
import { ASTEngine } from '../../src/parser/ast-engine.js';
import { LanguageParser } from '../../src/parser/language-parser.js';
import { Language } from '../../src/parser/types.js';

describe('ASTEngine', () => {
  let astEngine: ASTEngine;
  let languageParser: LanguageParser;

  beforeAll(async () => {
    languageParser = new LanguageParser();
    await languageParser.initialize();
    astEngine = new ASTEngine(languageParser);
  });

  describe('TypeScript', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/typescript-sample.ts');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should parse TypeScript code to AST', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.TypeScript);
      expect(result.rootNode).toBeDefined();
    });

    test('should traverse AST nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const nodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        nodes.push(node);
      });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0]).toBe(result.rootNode);
    });

    test('should get node position information', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const position = astEngine.getNodePosition(result.rootNode);

      expect(position).toBeDefined();
      expect(position.startLine).toBeGreaterThanOrEqual(0);
      expect(position.startColumn).toBeGreaterThanOrEqual(0);
      expect(position.endLine).toBeGreaterThanOrEqual(position.startLine);
      expect(position.endColumn).toBeGreaterThanOrEqual(0);
    });

    test('should find class nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'class_declaration') {
          classNodes.push(node);
        }
      });

      expect(classNodes.length).toBeGreaterThan(0);
      const classNode = classNodes[0];
      const position = astEngine.getNodePosition(classNode);
      expect(position.startLine).toBeGreaterThan(0);
    });

    test('should find function nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const functionNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_declaration' || node.type === 'method_definition') {
          functionNodes.push(node);
        }
      });

      expect(functionNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Python', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/python-sample.py');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should parse Python code to AST', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Python);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.Python);
      expect(result.rootNode).toBeDefined();
    });

    test('should find class nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Python);
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'class_definition') {
          classNodes.push(node);
        }
      });

      expect(classNodes.length).toBeGreaterThan(0);
    });

    test('should find function nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Python);
      const functionNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_definition') {
          functionNodes.push(node);
        }
      });

      expect(functionNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Go', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/go-sample.go');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should parse Go code to AST', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Go);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.Go);
      expect(result.rootNode).toBeDefined();
    });

    test('should find struct nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Go);
      const structNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'type_declaration') {
          structNodes.push(node);
        }
      });

      expect(structNodes.length).toBeGreaterThan(0);
    });

    test('should find function/method nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Go);
      const functionNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_declaration' || node.type === 'method_declaration') {
          functionNodes.push(node);
        }
      });

      expect(functionNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Rust', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/rust-sample.rs');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should parse Rust code to AST', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Rust);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.Rust);
      expect(result.rootNode).toBeDefined();
    });

    test('should find struct nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Rust);
      const structNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'struct_item') {
          structNodes.push(node);
        }
      });

      expect(structNodes.length).toBeGreaterThan(0);
    });

    test('should find function nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Rust);
      const functionNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_item') {
          functionNodes.push(node);
        }
      });

      expect(functionNodes.length).toBeGreaterThan(0);
    });

    test('should find impl blocks', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Rust);
      const implNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'impl_item') {
          implNodes.push(node);
        }
      });

      expect(implNodes.length).toBeGreaterThan(0);
    });

    test('should find trait nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Rust);
      const traitNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'trait_item') {
          traitNodes.push(node);
        }
      });

      expect(traitNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Java', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/java-sample.java');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should parse Java code to AST', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Java);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.Java);
      expect(result.rootNode).toBeDefined();
    });

    test('should find class nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Java);
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'class_declaration') {
          classNodes.push(node);
        }
      });

      expect(classNodes.length).toBeGreaterThan(0);
    });

    test('should find interface nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Java);
      const interfaceNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'interface_declaration') {
          interfaceNodes.push(node);
        }
      });

      expect(interfaceNodes.length).toBeGreaterThan(0);
    });

    test('should find method nodes', () => {
      const result = astEngine.parseToAST(sampleCode, Language.Java);
      const methodNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'method_declaration') {
          methodNodes.push(node);
        }
      });

      expect(methodNodes.length).toBeGreaterThan(0);
    });
  });

  describe('C/C++', () => {
    const cppSamplePath = path.join(__dirname, '../fixtures/samples/cpp-sample.cpp');
    const cppSampleCode = fs.readFileSync(cppSamplePath, 'utf-8');

    const cSamplePath = path.join(__dirname, '../fixtures/samples/c-sample.c');
    const cSampleCode = fs.readFileSync(cSamplePath, 'utf-8');

    test('should parse C++ code to AST', () => {
      const result = astEngine.parseToAST(cppSampleCode, Language.CPP);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.CPP);
      expect(result.rootNode).toBeDefined();
    });

    test('should parse C code to AST', () => {
      const result = astEngine.parseToAST(cSampleCode, Language.C);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.language).toBe(Language.C);
      expect(result.rootNode).toBeDefined();
    });

    test('should find struct nodes in C++', () => {
      const result = astEngine.parseToAST(cppSampleCode, Language.CPP);
      const structNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'struct_specifier') {
          structNodes.push(node);
        }
      });

      expect(structNodes.length).toBeGreaterThan(0);
    });

    test('should find class nodes in C++', () => {
      const result = astEngine.parseToAST(cppSampleCode, Language.CPP);
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'class_specifier') {
          classNodes.push(node);
        }
      });

      expect(classNodes.length).toBeGreaterThan(0);
    });

    test('should find function nodes in C', () => {
      const result = astEngine.parseToAST(cSampleCode, Language.C);
      const functionNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_definition') {
          functionNodes.push(node);
        }
      });

      expect(functionNodes.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    const errorSamplePath = path.join(__dirname, '../fixtures/samples/typescript-error.ts');
    const errorSampleCode = fs.readFileSync(errorSamplePath, 'utf-8');

    test('should handle partial syntax errors and continue processing', () => {
      const result = astEngine.parseToAST(errorSampleCode, Language.TypeScript);

      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
      expect(result.hasError).toBe(true);
      expect(result.rootNode).toBeDefined();
    });

    test('should traverse AST even with errors', () => {
      const result = astEngine.parseToAST(errorSampleCode, Language.TypeScript);
      const nodes: any[] = [];
      const errorNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        nodes.push(node);
        if (node.type === 'ERROR' || node.hasError) {
          errorNodes.push(node);
        }
      });

      expect(nodes.length).toBeGreaterThan(0);
      expect(errorNodes.length).toBeGreaterThan(0);
    });

    test('should find valid nodes before and after error', () => {
      const result = astEngine.parseToAST(errorSampleCode, Language.TypeScript);
      const functionNodes: any[] = [];
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_declaration') {
          functionNodes.push(node);
        }
        if (node.type === 'class_declaration') {
          classNodes.push(node);
        }
      });

      // Should find the valid function and class even with error in between
      expect(functionNodes.length).toBeGreaterThan(0);
      expect(classNodes.length).toBeGreaterThan(0);
    });

    test('should skip error nodes with skipErrors option', () => {
      const result = astEngine.parseToAST(errorSampleCode, Language.TypeScript);
      const nodes: any[] = [];

      astEngine.traverseAST(
        result.rootNode,
        (node) => {
          nodes.push(node);
        },
        { skipErrors: true }
      );

      // Should not include ERROR nodes
      const errorNodes = nodes.filter((n) => n.type === 'ERROR');
      expect(errorNodes.length).toBe(0);
    });
  });

  describe('Node Position Information', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/typescript-sample.ts');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should get accurate line numbers', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'class_declaration') {
          classNodes.push(node);
        }
      });

      expect(classNodes.length).toBeGreaterThan(0);
      const classNode = classNodes[0];
      const position = astEngine.getNodePosition(classNode);

      // The class should be somewhere in the middle of the file
      expect(position.startLine).toBeGreaterThan(0);
      expect(position.endLine).toBeGreaterThan(position.startLine);
    });

    test('should get accurate column numbers', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const classNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'class_declaration') {
          classNodes.push(node);
        }
      });

      const classNode = classNodes[0];
      const position = astEngine.getNodePosition(classNode);

      expect(position.startColumn).toBeGreaterThanOrEqual(0);
      expect(position.endColumn).toBeGreaterThanOrEqual(0);
    });

    test('should get node text content', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const functionNodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        if (node.type === 'function_declaration') {
          functionNodes.push(node);
        }
      });

      expect(functionNodes.length).toBeGreaterThan(0);
      const functionNode = functionNodes[0];
      const text = astEngine.getNodeText(functionNode, sampleCode);

      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('function');
    });
  });

  describe('Traversal Options', () => {
    const samplePath = path.join(__dirname, '../fixtures/samples/typescript-sample.ts');
    const sampleCode = fs.readFileSync(samplePath, 'utf-8');

    test('should support depth-first traversal', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const nodes: any[] = [];

      astEngine.traverseAST(result.rootNode, (node) => {
        nodes.push({ type: node.type, depth: node.depth || 0 });
      });

      expect(nodes.length).toBeGreaterThan(0);
    });

    test('should support maxDepth option', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const shallowNodes: any[] = [];
      const deepNodes: any[] = [];

      astEngine.traverseAST(
        result.rootNode,
        (node) => {
          shallowNodes.push(node);
        },
        { maxDepth: 2 }
      );

      astEngine.traverseAST(result.rootNode, (node) => {
        deepNodes.push(node);
      });

      expect(shallowNodes.length).toBeLessThan(deepNodes.length);
    });

    test('should support early termination', () => {
      const result = astEngine.parseToAST(sampleCode, Language.TypeScript);
      const nodes: any[] = [];
      let foundClass = false;

      astEngine.traverseAST(result.rootNode, (node) => {
        nodes.push(node);
        if (node.type === 'class_declaration') {
          foundClass = true;
          return false; // Stop traversal
        }
        return true; // Continue traversal
      });

      expect(foundClass).toBe(true);
      // Should have stopped after finding the class
      expect(nodes.length).toBeLessThan(100);
    });
  });

  describe('Edge cases and additional functionality', () => {
    test('should handle empty code', () => {
      const result = astEngine.parseToAST('', Language.TypeScript);
      expect(result).toBeDefined();
      expect(result.rootNode).toBeDefined();
    });

    test('should handle whitespace-only code', () => {
      const result = astEngine.parseToAST('   \n  \t  \n   ', Language.JavaScript);
      expect(result).toBeDefined();
      expect(result.rootNode).toBeDefined();
    });

    test('should handle single line code', () => {
      const result = astEngine.parseToAST('const x = 1;', Language.JavaScript);
      expect(result).toBeDefined();
      expect(result.hasError).toBe(false);
    });

    test('should handle Unknown language gracefully', () => {
      const result = astEngine.parseToAST('some code', Language.Unknown);
      expect(result).toBeDefined();
    });

    test('should find nodes by type', () => {
      const code = 'function a() {} function b() {} function c() {}';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      const functions = astEngine.findNodesByTypes(result.rootNode, ['function_declaration']);
      expect(functions.length).toBe(3);
    });

    test('should find nodes by multiple types', () => {
      const code = 'function foo() {} const bar = () => {};';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      const nodes = astEngine.findNodesByTypes(result.rootNode, [
        'function_declaration',
        'arrow_function',
      ]);
      expect(nodes.length).toBeGreaterThan(0);
    });

    test('should get node text for simple nodes', () => {
      const code = 'const x = 1;';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      const text = astEngine.getNodeText(result.rootNode, code);
      expect(text).toBe(code);
    });

    test('should get node text for nested nodes', () => {
      const code = 'function foo() { return 42; }';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      const functions = astEngine.findNodesByTypes(result.rootNode, ['function_declaration']);
      const text = astEngine.getNodeText(functions[0], code);
      expect(text).toContain('foo');
      expect(text).toContain('42');
    });

    test('should get position for root node', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      const position = astEngine.getNodePosition(result.rootNode);
      expect(position.startLine).toBe(0);
      expect(position.endLine).toBeGreaterThan(0);
    });

    test('should handle nodes with no children', () => {
      const code = 'const x = 1;';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      let leafNodes = 0;
      astEngine.traverseAST(result.rootNode, (node) => {
        if (!node.children || node.children.length === 0) {
          leafNodes++;
        }
      });
      expect(leafNodes).toBeGreaterThan(0);
    });

    test('should traverse with maxDepth 0 (only root)', () => {
      const code = 'function foo() { const x = 1; }';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      const nodes: any[] = [];
      astEngine.traverseAST(
        result.rootNode,
        (node) => {
          nodes.push(node);
        },
        { maxDepth: 0 }
      );
      expect(nodes.length).toBe(1);
      expect(nodes[0]).toBe(result.rootNode);
    });

    test('should handle very long code', () => {
      const longCode = Array(1000).fill('const x = 1;').join('\n');
      const result = astEngine.parseToAST(longCode, Language.JavaScript);
      expect(result).toBeDefined();
      expect(result.hasError).toBe(false);
    });

    test('should handle code with special characters', () => {
      const code = 'const str = "こんにちは"; // 日本語コメント';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      expect(result).toBeDefined();
      expect(result.hasError).toBe(false);
    });

    test('should handle code with emojis', () => {
      const code = 'const emoji = "😀🎉"; // Comment with emoji 🚀';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      expect(result).toBeDefined();
    });

    test('should find nested class declarations', () => {
      const code = 'class Outer { class Inner {} }';
      const result = astEngine.parseToAST(code, Language.TypeScript);
      const classes = astEngine.findNodesByTypes(result.rootNode, ['class_declaration']);
      expect(classes.length).toBeGreaterThanOrEqual(1);
    });

    test('should handle incomplete syntax gracefully', () => {
      const code = 'function foo(';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      expect(result).toBeDefined();
      expect(result.hasError).toBe(true);
    });

    test('should handle mixed valid and invalid code', () => {
      const code = 'const valid = 1;\nfunction broken(\nconst alsoValid = 2;';
      const result = astEngine.parseToAST(code, Language.JavaScript);
      expect(result).toBeDefined();
      expect(result.hasError).toBe(true);
      // Should still find the valid constants
      const validNodes = astEngine.findNodesByTypes(result.rootNode, ['lexical_declaration']);
      expect(validNodes.length).toBeGreaterThan(0);
    });
  });
});
