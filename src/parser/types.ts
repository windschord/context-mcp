/**
 * Supported programming languages
 */
export enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
  Go = 'go',
  Rust = 'rust',
  Java = 'java',
  C = 'c',
  CPP = 'cpp',
  Unknown = 'unknown',
}

/**
 * Parsed tree result from Tree-sitter
 */
export interface ParseResult {
  tree: any; // Tree-sitter Tree object
  hasError: boolean;
  language: Language;
}

/**
 * File extension to language mapping
 */
export interface ExtensionMapping {
  [extension: string]: Language;
}

/**
 * Parser error information
 */
export interface ParserError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
}

/**
 * AST parse result with root node
 */
export interface ASTParseResult {
  tree: any; // Tree-sitter Tree object
  rootNode: any; // Tree-sitter Node object
  hasError: boolean;
  language: Language;
}

/**
 * Node position information
 */
export interface NodePosition {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Traversal callback function
 * Returns true to continue traversal, false to stop
 */
export type TraversalCallback = (node: any) => boolean | void;

/**
 * Traversal options
 */
export interface TraversalOptions {
  skipErrors?: boolean;
  maxDepth?: number;
}

/**
 * Symbol types
 */
export enum SymbolType {
  Function = 'function',
  Method = 'method',
  Class = 'class',
  Interface = 'interface',
  Struct = 'struct',
  Variable = 'variable',
  Constant = 'constant',
  Parameter = 'parameter',
  Trait = 'trait',
  Enum = 'enum',
}

/**
 * Symbol scope
 */
export enum SymbolScope {
  Global = 'global',
  Class = 'class',
  Function = 'function',
  Block = 'block',
  Module = 'module',
}

/**
 * Parameter information
 */
export interface ParameterInfo {
  name: string;
  type?: string;
  defaultValue?: string;
  isOptional?: boolean;
}

/**
 * Symbol information extracted from AST
 */
export interface SymbolInfo {
  name: string;
  type: SymbolType;
  scope: SymbolScope;
  position: NodePosition;

  // Function/Method specific
  parameters?: ParameterInfo[];
  returnType?: string;

  // Class/Interface/Struct specific
  extends?: string[];
  implements?: string[];
  members?: SymbolInfo[];

  // Variable/Constant specific
  valueType?: string;
  initialValue?: string;

  // Common
  docstring?: string;
  isExported?: boolean;
  isAsync?: boolean;
  isStatic?: boolean;
  isPrivate?: boolean;
  isAbstract?: boolean;

  // Arduino specific
  isArduinoSpecialFunction?: boolean; // setup or loop
}

/**
 * Symbol extraction result
 */
export interface SymbolExtractionResult {
  symbols: SymbolInfo[];
  language: Language;
  hasError: boolean;
  errors?: ParserError[];
}
