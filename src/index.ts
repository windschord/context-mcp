/**
 * LSP-MCP: Model Context Protocol plugin for Claude Code
 * with Tree-sitter AST parsing and vector database
 */

import { MCPServer } from './server/mcp-server.js';
import { logger, LogLevel } from './utils/logger.js';
import { ConfigManager } from './config/config-manager.js';
import { LocalEmbeddingEngine } from './embedding/local-embedding-engine.js';
import { CloudEmbeddingEngine } from './embedding/cloud-embedding-engine.js';
import { MilvusPlugin } from './storage/milvus-plugin.js';
import { BM25Engine } from './storage/bm25-engine.js';
import { FileScanner } from './scanner/file-scanner.js';
import { SymbolExtractor } from './parser/symbol-extractor.js';
import { CommentExtractor } from './parser/comment-extractor.js';
import { MarkdownParser } from './parser/markdown-parser.js';
import { DocCodeLinker } from './parser/doc-code-linker.js';
import { LanguageParser } from './parser/language-parser.js';
import { IndexingService } from './services/indexing-service.js';
import { HybridSearchEngine } from './services/hybrid-search-engine.js';
import type { EmbeddingEngine } from './embedding/types.js';
import type { VectorStorePlugin } from './storage/types.js';

export const version = '0.1.0';

/**
 * メインエントリーポイント
 */
export async function main(): Promise<void> {
  // 環境変数からログレベルを取得
  const logLevelEnv = process.env['LOG_LEVEL']?.toUpperCase() || 'INFO';
  const logLevel = LogLevel[logLevelEnv as keyof typeof LogLevel] || LogLevel.INFO;
  logger.setLevel(logLevel);

  logger.info('LSP-MCP server starting...', { version });

  let embeddingEngine: EmbeddingEngine | undefined;
  let vectorStore: VectorStorePlugin | undefined;
  let bm25Engine: BM25Engine | undefined;
  let indexingService: IndexingService | undefined;
  let hybridSearchEngine: HybridSearchEngine | undefined;

  try {
    // 1. 設定ファイルを読み込み
    logger.info('Loading configuration...');
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    logger.info(`Configuration loaded: mode=${config.mode}`);

    // 2. 埋め込みエンジンを初期化
    logger.info(`Initializing embedding engine: ${config.embedding.provider}`);
    if (config.embedding.provider === 'transformers') {
      embeddingEngine = new LocalEmbeddingEngine({
        modelName: config.embedding.model,
        cacheDir: './.lsp-mcp/models',
      });
    } else if (config.embedding.provider === 'openai' || config.embedding.provider === 'voyageai') {
      if (!config.embedding.apiKey) {
        throw new Error(`API key is required for ${config.embedding.provider}`);
      }
      embeddingEngine = new CloudEmbeddingEngine({
        provider: config.embedding.provider,
        apiKey: config.embedding.apiKey,
        modelName: config.embedding.model,
      });
    } else {
      throw new Error(`Unknown embedding provider: ${config.embedding.provider}`);
    }
    await embeddingEngine.initialize();
    logger.info('Embedding engine initialized');

    // 3. ベクターストアを初期化
    logger.info(`Initializing vector store: ${config.vectorStore.backend}`);
    if (config.vectorStore.backend === 'milvus' || config.vectorStore.backend === 'zilliz') {
      vectorStore = new MilvusPlugin();
      await vectorStore.connect(config.vectorStore);
      logger.info('Vector store connected');
    } else {
      throw new Error(`Unknown vector store backend: ${config.vectorStore.backend}`);
    }

    // 4. BM25エンジンを初期化
    logger.info('Initializing BM25 engine...');
    const bm25DbPath = './tmp/bm25.db';
    bm25Engine = new BM25Engine(bm25DbPath);
    await bm25Engine.initialize();
    logger.info('BM25 engine initialized');

    // 5. パーサーコンポーネントを初期化
    logger.info('Initializing parser components...');
    const fileScanner = new FileScanner(process.cwd());
    const languageParser = new LanguageParser();
    const symbolExtractor = new SymbolExtractor(languageParser);
    const commentExtractor = new CommentExtractor(languageParser);
    const markdownParser = new MarkdownParser();
    const docCodeLinker = new DocCodeLinker(symbolExtractor, markdownParser);
    logger.info('Parser components initialized');

    // 6. Indexing Serviceを作成
    logger.info('Creating indexing service...');
    indexingService = new IndexingService(
      fileScanner,
      symbolExtractor,
      commentExtractor,
      markdownParser,
      docCodeLinker,
      embeddingEngine,
      vectorStore,
      bm25Engine
    );
    logger.info('Indexing service created');

    // 7. Hybrid Search Engineを作成
    logger.info('Creating hybrid search engine...');
    hybridSearchEngine = new HybridSearchEngine(
      bm25Engine,
      vectorStore,
      0.3
    );
    logger.info('Hybrid search engine created');

    // 8. MCPサーバーを起動
    logger.info('Starting MCP server...');
    const server = new MCPServer(
      'lsp-mcp',
      version,
      indexingService,
      hybridSearchEngine,
      embeddingEngine,
      vectorStore
    );
    await server.run();
    logger.info('MCP server started successfully');

    // シグナルハンドラーを設定
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await server.shutdown();
      if (vectorStore) await vectorStore.disconnect();
      if (bm25Engine) await bm25Engine.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await server.shutdown();
      if (vectorStore) await vectorStore.disconnect();
      if (bm25Engine) await bm25Engine.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', error);

    // クリーンアップ
    if (vectorStore) {
      try {
        await vectorStore.disconnect();
      } catch (e) {
        logger.error('Error disconnecting vector store', e);
      }
    }
    if (bm25Engine) {
      try {
        await bm25Engine.close();
      } catch (e) {
        logger.error('Error closing BM25 engine', e);
      }
    }

    process.exit(1);
  }
}

// スクリプトとして直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in main', error);
    process.exit(1);
  });
}

// エクスポート
export { MCPServer } from './server/mcp-server.js';
export { Logger, LogLevel } from './utils/logger.js';
export * from './utils/errors.js';
