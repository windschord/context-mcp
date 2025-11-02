/**
 * Symbol Extractor: ASTからシンボル情報を抽出するエンジン
 */

import Parser from 'tree-sitter';
import { LanguageParser } from './language-parser.js';
import { ASTEngine } from './ast-engine.js';
import {
  Language,
  SymbolInfo,
  SymbolType,
  SymbolScope,
  SymbolExtractionResult,
  ParameterInfo,
  ParserError,
} from './types.js';

/**
 * SymbolExtractor: シンボル抽出を行うクラス
 */
export class SymbolExtractor {
  private astEngine: ASTEngine;

  constructor(languageParser: LanguageParser) {
    this.astEngine = new ASTEngine(languageParser);
  }

  /**
   * ソースコードからシンボルを抽出
   * @param code ソースコード
   * @param language プログラミング言語
   * @returns シンボル抽出結果
   */
  extractSymbols(code: string, language: Language): SymbolExtractionResult {
    // 空のコードまたは未知の言語の場合は空の配列を返す
    if (!code || language === Language.Unknown) {
      return {
        symbols: [],
        language,
        hasError: false,
      };
    }

    try {
      const astResult = this.astEngine.parseToAST(code, language);

      const symbols: SymbolInfo[] = [];
      const errors: ParserError[] = [];

      // 言語ごとにシンボル抽出ロジックを分岐
      switch (language) {
        case Language.TypeScript:
        case Language.JavaScript:
          this.extractTypeScriptSymbols(astResult.rootNode, code, symbols);
          break;

        case Language.Python:
          this.extractPythonSymbols(astResult.rootNode, code, symbols);
          break;

        case Language.Go:
          this.extractGoSymbols(astResult.rootNode, code, symbols);
          break;

        case Language.CPP:
        case Language.C:
          this.extractCppSymbols(astResult.rootNode, code, symbols, language);
          break;

        case Language.Rust:
          this.extractRustSymbols(astResult.rootNode, code, symbols);
          break;

        case Language.Java:
          this.extractJavaSymbols(astResult.rootNode, code, symbols);
          break;

        default:
          break;
      }

      return {
        symbols,
        language,
        hasError: astResult.hasError,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        symbols: [],
        language,
        hasError: true,
        errors: [
          {
            message: error instanceof Error ? error.message : 'Unknown error',
            severity: 'error',
          },
        ],
      };
    }
  }

  /**
   * TypeScript/JavaScriptのシンボル抽出
   */
  private extractTypeScriptSymbols(
    rootNode: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    this.astEngine.traverseAST(rootNode, (node) => {
      try {
        // グローバル変数・定数
        if (
          node.type === 'variable_declaration' ||
          node.type === 'lexical_declaration'
        ) {
          this.extractTSVariable(node, _code, symbols, SymbolScope.Global);
        }

        // 関数宣言
        if (node.type === 'function_declaration') {
          this.extractTSFunction(node, _code, symbols, SymbolScope.Global);
        }

        // アロー関数
        if (node.type === 'variable_declarator') {
          const init = node.childForFieldName('value');
          if (init && init.type === 'arrow_function') {
            this.extractTSArrowFunction(node, _code, symbols);
          }
        }

        // インターフェース
        if (node.type === 'interface_declaration') {
          this.extractTSInterface(node, _code, symbols);
        }

        // クラス
        if (node.type === 'class_declaration') {
          this.extractTSClass(node, _code, symbols);
        }

        // Enum
        if (node.type === 'enum_declaration') {
          this.extractTSEnum(node, _code, symbols);
        }
      } catch (error) {
        // エラーがあっても処理を継続
      }

      return true;
    });
  }

  /**
   * TypeScript変数抽出
   */
  private extractTSVariable(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[],
    scope: SymbolScope
  ): void {
    const declarators = node.children.filter(
      (c) => c.type === 'variable_declarator'
    );

    const kind = node.firstChild?.text; // const, let, var

    for (const declarator of declarators) {
      const nameNode = declarator.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const type =
        kind === 'const' ? SymbolType.Constant : SymbolType.Variable;

      const typeAnnotation = declarator.childForFieldName('type');
      const value = declarator.childForFieldName('value');

      // exportの確認
      let isExported = false;
      let current = node.parent;
      while (current) {
        if (current.type === 'export_statement') {
          isExported = true;
          break;
        }
        current = current.parent;
      }

      symbols.push({
        name,
        type,
        scope,
        position: this.astEngine.getNodePosition(declarator),
        valueType: typeAnnotation?.text,
        initialValue: value?.text,
        isExported,
      });
    }
  }

  /**
   * TypeScript関数抽出
   */
  private extractTSFunction(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[],
    scope: SymbolScope
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const parameters = this.extractTSParameters(node);
    const returnTypeNode = node.childForFieldName('return_type');

    // async関数の確認
    const isAsync = node.children.some((c) => c.text === 'async');

    // exportの確認
    let isExported = false;
    let current = node.parent;
    while (current) {
      if (current.type === 'export_statement') {
        isExported = true;
        break;
      }
      current = current.parent;
    }

    symbols.push({
      name,
      type: SymbolType.Function,
      scope,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: returnTypeNode?.text,
      isAsync,
      isExported,
    });
  }

  /**
   * TypeScriptアロー関数抽出
   */
  private extractTSArrowFunction(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const valueNode = node.childForFieldName('value');
    if (!valueNode) return;

    const parameters = this.extractTSParameters(valueNode);
    const returnTypeNode = valueNode.childForFieldName('return_type');

    // exportの確認
    let isExported = false;
    let current = node.parent;
    while (current) {
      if (current.type === 'export_statement') {
        isExported = true;
        break;
      }
      current = current.parent;
    }

    symbols.push({
      name,
      type: SymbolType.Function,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: returnTypeNode?.text,
      isExported,
    });
  }

  /**
   * TypeScriptパラメータ抽出
   */
  private extractTSParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (!paramsNode) return params;

    for (const child of paramsNode.children) {
      if (
        child.type === 'required_parameter' ||
        child.type === 'optional_parameter'
      ) {
        const patternNode = child.childForFieldName('pattern');
        const typeNode = child.childForFieldName('type');
        const valueNode = child.childForFieldName('value');

        if (patternNode) {
          params.push({
            name: patternNode.text,
            type: typeNode?.text,
            defaultValue: valueNode?.text,
            isOptional: child.type === 'optional_parameter',
          });
        }
      }
    }

    return params;
  }

  /**
   * TypeScriptインターフェース抽出
   */
  private extractTSInterface(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;

    // exportの確認
    let isExported = false;
    let current = node.parent;
    while (current) {
      if (current.type === 'export_statement') {
        isExported = true;
        break;
      }
      current = current.parent;
    }

    symbols.push({
      name,
      type: SymbolType.Interface,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      isExported,
    });
  }

  /**
   * TypeScriptクラス抽出
   */
  private extractTSClass(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;

    // 継承とインターフェース実装の抽出
    const extendsClause = node.children.find(
      (c) => c.type === 'class_heritage'
    );
    const extendsClasses: string[] = [];
    const implementsInterfaces: string[] = [];

    if (extendsClause) {
      for (const child of extendsClause.children) {
        if (child.type === 'extends_clause') {
          const typeNode = child.childForFieldName('value');
          if (typeNode) {
            extendsClasses.push(typeNode.text);
          }
        } else if (child.type === 'implements_clause') {
          // implements句の型を抽出
          for (const typeChild of child.children) {
            if (typeChild.type === 'type_identifier') {
              implementsInterfaces.push(typeChild.text);
            }
          }
        }
      }
    }

    // abstractクラスの確認
    const isAbstract = node.children.some((c) => c.text === 'abstract');

    // exportの確認
    let isExported = false;
    let current = node.parent;
    while (current) {
      if (current.type === 'export_statement') {
        isExported = true;
        break;
      }
      current = current.parent;
    }

    // メンバーの抽出
    const members: SymbolInfo[] = [];
    const bodyNode = node.childForFieldName('body');

    if (bodyNode) {
      for (const member of bodyNode.children) {
        if (member.type === 'method_definition') {
          this.extractTSMethod(member, _code, members);
        } else if (member.type === 'public_field_definition') {
          this.extractTSClassField(member, _code, members);
        }
      }
    }

    symbols.push({
      name,
      type: SymbolType.Class,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      extends: extendsClasses.length > 0 ? extendsClasses : undefined,
      implements:
        implementsInterfaces.length > 0 ? implementsInterfaces : undefined,
      members: members.length > 0 ? members : undefined,
      isAbstract,
      isExported,
    });
  }

  /**
   * TypeScriptメソッド抽出
   */
  private extractTSMethod(
    node: Parser.SyntaxNode,
    _code: string,
    members: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const parameters = this.extractTSParameters(node);
    const returnTypeNode = node.childForFieldName('return_type');

    const isStatic = node.children.some((c) => c.text === 'static');
    const isAsync = node.children.some((c) => c.text === 'async');
    const isPrivate = node.children.some((c) => c.text === 'private');
    const isAbstract = node.children.some((c) => c.text === 'abstract');

    members.push({
      name,
      type: SymbolType.Method,
      scope: SymbolScope.Class,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: returnTypeNode?.text,
      isStatic,
      isAsync,
      isPrivate,
      isAbstract,
    });
  }

  /**
   * TypeScriptクラスフィールド抽出
   */
  private extractTSClassField(
    node: Parser.SyntaxNode,
    _code: string,
    members: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const typeNode = node.childForFieldName('type');
    const valueNode = node.childForFieldName('value');

    const isStatic = node.children.some((c) => c.text === 'static');
    const isPrivate = node.children.some((c) => c.text === 'private');

    members.push({
      name,
      type: SymbolType.Variable,
      scope: SymbolScope.Class,
      position: this.astEngine.getNodePosition(node),
      valueType: typeNode?.text,
      initialValue: valueNode?.text,
      isStatic,
      isPrivate,
    });
  }

  /**
   * TypeScript Enum抽出
   */
  private extractTSEnum(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;

    // exportの確認
    let isExported = false;
    let current = node.parent;
    while (current) {
      if (current.type === 'export_statement') {
        isExported = true;
        break;
      }
      current = current.parent;
    }

    symbols.push({
      name,
      type: SymbolType.Enum,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      isExported,
    });
  }

  /**
   * Pythonのシンボル抽出
   */
  private extractPythonSymbols(
    rootNode: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    this.astEngine.traverseAST(rootNode, (node) => {
      try {
        // 関数定義
        if (node.type === 'function_definition') {
          this.extractPythonFunction(node, _code, symbols, SymbolScope.Global);
        }

        // クラス定義
        if (node.type === 'class_definition') {
          this.extractPythonClass(node, _code, symbols);
        }

        // グローバル変数
        if (node.type === 'assignment') {
          const parent = node.parent;
          if (parent && parent.type === 'module') {
            this.extractPythonVariable(node, _code, symbols);
          }
        }
      } catch (error) {
        // エラーがあっても処理を継続
      }

      return true;
    });
  }

  /**
   * Python関数抽出
   */
  private extractPythonFunction(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[],
    scope: SymbolScope
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const parameters = this.extractPythonParameters(node);
    const returnTypeNode = node.childForFieldName('return_type');

    // async関数の確認
    const isAsync = node.children.some((c) => c.text === 'async');

    symbols.push({
      name,
      type: scope === SymbolScope.Class ? SymbolType.Method : SymbolType.Function,
      scope,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: returnTypeNode?.text,
      isAsync,
    });
  }

  /**
   * Pythonパラメータ抽出
   */
  private extractPythonParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (!paramsNode) return params;

    for (const child of paramsNode.children) {
      if (
        child.type === 'identifier' ||
        child.type === 'typed_parameter' ||
        child.type === 'default_parameter'
      ) {
        let name = '';
        let type = '';
        let defaultValue = '';

        if (child.type === 'identifier') {
          name = child.text;
        } else if (child.type === 'typed_parameter') {
          const nameNode = child.childForFieldName('name');
          const typeNode = child.childForFieldName('type');
          name = nameNode?.text || '';
          type = typeNode?.text || '';
        } else if (child.type === 'default_parameter') {
          const nameNode = child.childForFieldName('name');
          const valueNode = child.childForFieldName('value');
          name = nameNode?.text || '';
          defaultValue = valueNode?.text || '';
        }

        if (name && name !== 'self' && name !== 'cls') {
          params.push({
            name,
            type: type || undefined,
            defaultValue: defaultValue || undefined,
          });
        }
      }
    }

    return params;
  }

  /**
   * Pythonクラス抽出
   */
  private extractPythonClass(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;

    // 継承クラスの抽出
    const superclassesNode = node.childForFieldName('superclasses');
    const extendsClasses: string[] = [];

    if (superclassesNode) {
      for (const child of superclassesNode.children) {
        if (child.type === 'identifier') {
          extendsClasses.push(child.text);
        }
      }
    }

    // メンバーの抽出
    const members: SymbolInfo[] = [];
    const bodyNode = node.childForFieldName('body');

    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === 'function_definition') {
          this.extractPythonFunction(child, _code, members, SymbolScope.Class);
        }
      }
    }

    symbols.push({
      name,
      type: SymbolType.Class,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      extends: extendsClasses.length > 0 ? extendsClasses : undefined,
      members: members.length > 0 ? members : undefined,
    });
  }

  /**
   * Python変数抽出
   */
  private extractPythonVariable(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const leftNode = node.childForFieldName('left');
    if (!leftNode || leftNode.type !== 'identifier') return;

    const name = leftNode.text;
    const rightNode = node.childForFieldName('right');

    // 大文字のみの変数名は定数として扱う
    const isConstant = name === name.toUpperCase();

    symbols.push({
      name,
      type: isConstant ? SymbolType.Constant : SymbolType.Variable,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      initialValue: rightNode?.text,
    });
  }

  /**
   * Goのシンボル抽出
   */
  private extractGoSymbols(
    rootNode: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    this.astEngine.traverseAST(rootNode, (node) => {
      try {
        // 定数宣言
        if (node.type === 'const_declaration') {
          this.extractGoConst(node, _code, symbols);
        }

        // 変数宣言
        if (node.type === 'var_declaration') {
          this.extractGoVar(node, _code, symbols);
        }

        // 関数宣言
        if (node.type === 'function_declaration') {
          this.extractGoFunction(node, _code, symbols);
        }

        // メソッド宣言
        if (node.type === 'method_declaration') {
          this.extractGoMethod(node, _code, symbols);
        }

        // 型宣言（struct, interface）
        if (node.type === 'type_declaration') {
          this.extractGoType(node, _code, symbols);
        }
      } catch (error) {
        // エラーがあっても処理を継続
      }

      return true;
    });
  }

  /**
   * Go定数抽出
   */
  private extractGoConst(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const specs = node.children.filter((c) => c.type === 'const_spec');

    for (const spec of specs) {
      const nameNode = spec.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const typeNode = spec.childForFieldName('type');
      const valueNode = spec.childForFieldName('value');

      symbols.push({
        name,
        type: SymbolType.Constant,
        scope: SymbolScope.Global,
        position: this.astEngine.getNodePosition(spec),
        valueType: typeNode?.text,
        initialValue: valueNode?.text,
      });
    }
  }

  /**
   * Go変数抽出
   */
  private extractGoVar(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const specs = node.children.filter((c) => c.type === 'var_spec');

    for (const spec of specs) {
      const nameNode = spec.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const typeNode = spec.childForFieldName('type');
      const valueNode = spec.childForFieldName('value');

      symbols.push({
        name,
        type: SymbolType.Variable,
        scope: SymbolScope.Global,
        position: this.astEngine.getNodePosition(spec),
        valueType: typeNode?.text,
        initialValue: valueNode?.text,
      });
    }
  }

  /**
   * Go関数抽出
   */
  private extractGoFunction(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const parameters = this.extractGoParameters(node);
    const resultNode = node.childForFieldName('result');

    symbols.push({
      name,
      type: SymbolType.Function,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: resultNode?.text,
    });
  }

  /**
   * Goメソッド抽出
   */
  private extractGoMethod(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const parameters = this.extractGoParameters(node);
    const resultNode = node.childForFieldName('result');

    symbols.push({
      name,
      type: SymbolType.Method,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: resultNode?.text,
    });
  }

  /**
   * Goパラメータ抽出
   */
  private extractGoParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (!paramsNode) return params;

    for (const child of paramsNode.children) {
      if (child.type === 'parameter_declaration') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');

        if (nameNode) {
          params.push({
            name: nameNode.text,
            type: typeNode?.text,
          });
        }
      }
    }

    return params;
  }

  /**
   * Go型定義抽出
   */
  private extractGoType(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const specs = node.children.filter((c) => c.type === 'type_spec');

    for (const spec of specs) {
      const nameNode = spec.childForFieldName('name');
      const typeNode = spec.childForFieldName('type');

      if (!nameNode || !typeNode) continue;

      const name = nameNode.text;
      let symbolType = SymbolType.Struct;

      // 型の種類を判定
      if (typeNode.type === 'struct_type') {
        symbolType = SymbolType.Struct;
      } else if (typeNode.type === 'interface_type') {
        symbolType = SymbolType.Interface;
      }

      symbols.push({
        name,
        type: symbolType,
        scope: SymbolScope.Global,
        position: this.astEngine.getNodePosition(spec),
      });
    }
  }

  /**
   * C/C++のシンボル抽出
   */
  private extractCppSymbols(
    rootNode: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[],
    _language: Language
  ): void {
    this.astEngine.traverseAST(rootNode, (node) => {
      try {
        // 関数定義
        if (node.type === 'function_definition') {
          this.extractCppFunction(node, _code, symbols);
        }

        // クラス定義
        if (node.type === 'class_specifier') {
          this.extractCppClass(node, _code, symbols);
        }

        // 変数宣言
        if (node.type === 'declaration') {
          this.extractCppDeclaration(node, _code, symbols);
        }
      } catch (error) {
        // エラーがあっても処理を継続
      }

      return true;
    });
  }

  /**
   * C++関数抽出
   */
  private extractCppFunction(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const declaratorNode = node.childForFieldName('declarator');
    if (!declaratorNode) return;

    let functionDeclarator = declaratorNode;

    // function_declaratorを探す
    while (
      functionDeclarator &&
      functionDeclarator.type !== 'function_declarator'
    ) {
      const nextDeclarator = functionDeclarator.childForFieldName('declarator') || functionDeclarator.children[0];
      if (!nextDeclarator) break;
      functionDeclarator = nextDeclarator;
    }

    if (!functionDeclarator || functionDeclarator.type !== 'function_declarator') return;

    const nameDeclarator = functionDeclarator.childForFieldName('declarator');
    if (!nameDeclarator) return;

    const name = nameDeclarator.text;

    // Arduino特別関数の確認
    const isArduinoSpecialFunction = name === 'setup' || name === 'loop';

    const parameters = this.extractCppParameters(functionDeclarator);
    const typeNode = node.childForFieldName('type');

    symbols.push({
      name,
      type: SymbolType.Function,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: typeNode?.text,
      isArduinoSpecialFunction,
    });
  }

  /**
   * C++パラメータ抽出
   */
  private extractCppParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (!paramsNode) return params;

    for (const child of paramsNode.children) {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.childForFieldName('type');
        const declaratorNode = child.childForFieldName('declarator');

        if (declaratorNode) {
          params.push({
            name: declaratorNode.text,
            type: typeNode?.text,
          });
        }
      }
    }

    return params;
  }

  /**
   * C++クラス抽出
   */
  private extractCppClass(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;

    // メンバーの抽出
    const members: SymbolInfo[] = [];
    const bodyNode = node.childForFieldName('body');

    if (bodyNode) {
      for (const child of bodyNode.children) {
        if (child.type === 'function_definition') {
          this.extractCppMethod(child, _code, members);
        } else if (child.type === 'field_declaration') {
          this.extractCppField(child, _code, members);
        }
      }
    }

    symbols.push({
      name,
      type: SymbolType.Class,
      scope: SymbolScope.Global,
      position: this.astEngine.getNodePosition(node),
      members: members.length > 0 ? members : undefined,
    });
  }

  /**
   * C++メソッド抽出
   */
  private extractCppMethod(
    node: Parser.SyntaxNode,
    _code: string,
    members: SymbolInfo[]
  ): void {
    const declaratorNode = node.childForFieldName('declarator');
    if (!declaratorNode) return;

    let functionDeclarator = declaratorNode;

    while (
      functionDeclarator &&
      functionDeclarator.type !== 'function_declarator'
    ) {
      const nextDeclarator = functionDeclarator.childForFieldName('declarator') || functionDeclarator.children[0];
      if (!nextDeclarator) break;
      functionDeclarator = nextDeclarator;
    }

    if (!functionDeclarator || functionDeclarator.type !== 'function_declarator') return;

    const nameDeclarator = functionDeclarator.childForFieldName('declarator');
    if (!nameDeclarator) return;

    const name = nameDeclarator.text;
    const parameters = this.extractCppParameters(functionDeclarator);
    const typeNode = node.childForFieldName('type');

    members.push({
      name,
      type: SymbolType.Method,
      scope: SymbolScope.Class,
      position: this.astEngine.getNodePosition(node),
      parameters,
      returnType: typeNode?.text,
    });
  }

  /**
   * C++フィールド抽出
   */
  private extractCppField(
    node: Parser.SyntaxNode,
    _code: string,
    members: SymbolInfo[]
  ): void {
    const declarators = node.children.filter(
      (c) => c.type === 'field_declaration' || c.type === 'init_declarator'
    );

    for (const declarator of declarators) {
      const nameDeclarator = declarator.childForFieldName('declarator');
      if (!nameDeclarator) continue;

      const name = nameDeclarator.text;
      const typeNode = node.childForFieldName('type');

      members.push({
        name,
        type: SymbolType.Variable,
        scope: SymbolScope.Class,
        position: this.astEngine.getNodePosition(declarator),
        valueType: typeNode?.text,
      });
    }
  }

  /**
   * C++変数宣言抽出
   */
  private extractCppDeclaration(
    node: Parser.SyntaxNode,
    _code: string,
    symbols: SymbolInfo[]
  ): void {
    const declarators = node.children.filter(
      (c) => c.type === 'init_declarator'
    );

    for (const declarator of declarators) {
      const nameDeclarator = declarator.childForFieldName('declarator');
      if (!nameDeclarator) continue;

      const name = nameDeclarator.text;
      const typeNode = node.childForFieldName('type');

      // constキーワードの確認
      const isConst = node.children.some(
        (c) => c.type === 'type_qualifier' && c.text === 'const'
      );

      symbols.push({
        name,
        type: isConst ? SymbolType.Constant : SymbolType.Variable,
        scope: SymbolScope.Global,
        position: this.astEngine.getNodePosition(declarator),
        valueType: typeNode?.text,
      });
    }
  }

  /**
   * Rustのシンボル抽出（基本実装）
   */
  private extractRustSymbols(
    _rootNode: Parser.SyntaxNode,
    _code: string,
    _symbols: SymbolInfo[]
  ): void {
    // Rustの実装は将来のタスクとして予約
    // 現時点では空の実装
  }

  /**
   * Javaのシンボル抽出（基本実装）
   */
  private extractJavaSymbols(
    _rootNode: Parser.SyntaxNode,
    _code: string,
    _symbols: SymbolInfo[]
  ): void {
    // Javaの実装は将来のタスクとして予約
    // 現時点では空の実装
  }
}
