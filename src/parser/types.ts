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
