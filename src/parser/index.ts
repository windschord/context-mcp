export { LanguageParser } from './language-parser';
export { PlatformIOParser } from './platformio-parser';
export type { PlatformIOEnvironment, PlatformIOConfig } from './platformio-parser';
export { ASTEngine } from './ast-engine';
export { SymbolExtractor } from './symbol-extractor';
export { CommentExtractor } from './comment-extractor';
export { MarkdownParser } from './markdown-parser';
export { DocCodeLinker } from './doc-code-linker';
export { Language, SymbolType, SymbolScope, CommentType, CommentMarker } from './types';
export type {
  ParseResult,
  ExtensionMapping,
  ParserError,
  ASTParseResult,
  NodePosition,
  TraversalCallback,
  TraversalOptions,
  SymbolInfo,
  ParameterInfo,
  SymbolExtractionResult,
  CommentInfo,
  CommentTag,
  CommentExtractionResult,
} from './types';
export type {
  HeadingNode,
  CodeBlockNode,
  LinkNode,
  FilePathReference,
  ImageNode,
  MarkdownDocument,
} from './markdown-parser';
export type {
  ResolvedFilePathReference,
  SymbolReference,
  SimilarCodeMatch,
  RelatedScoreResult,
  CodeFileInfo,
} from './doc-code-linker';
