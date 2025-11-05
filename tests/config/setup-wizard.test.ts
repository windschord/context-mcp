/**
 * Setup Wizard Tests
 *
 * 初回セットアップウィザードのテスト
 */

import { SetupWizard } from '../../src/config/setup-wizard';
import * as fs from 'fs';
import * as path from 'path';

// fsモジュールをモック
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('SetupWizard', () => {
  let wizard: SetupWizard;
  const testConfigPath = '/tmp/test-project/.lsp-mcp.json';

  beforeEach(() => {
    wizard = new SetupWizard(testConfigPath);
    jest.clearAllMocks();
  });

  describe('ローカルモードのセットアップ', () => {
    it('Milvusを使用したローカルモード設定を生成できる', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
      });

      expect(config.mode).toBe('local');
      expect(config.vectorStore.backend).toBe('milvus');
      expect(config.vectorStore.config.address).toBe('localhost:19530');
      expect(config.vectorStore.config.standalone).toBe(true);
      expect(config.embedding.provider).toBe('transformers');
      expect(config.embedding.local).toBe(true);
      expect(config.privacy?.blockExternalCalls).toBe(true);
    });

    it('Chromaを使用したローカルモード設定を生成できる', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'chroma',
        embeddingProvider: 'transformers',
      });

      expect(config.mode).toBe('local');
      expect(config.vectorStore.backend).toBe('chroma');
      expect(config.vectorStore.config.path).toBe('./.lsp-mcp/chroma');
      expect(config.embedding.provider).toBe('transformers');
      expect(config.embedding.model).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('ローカルモードでカスタムモデルを指定できる', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
        embeddingModel: 'Xenova/bge-small-en-v1.5',
      });

      expect(config.embedding.model).toBe('Xenova/bge-small-en-v1.5');
    });
  });

  describe('クラウドモードのセットアップ', () => {
    it('OpenAI + Zillizのクラウドモード設定を生成できる', async () => {
      const config = await wizard.generateConfig({
        mode: 'cloud',
        vectorBackend: 'zilliz',
        embeddingProvider: 'openai',
        vectorAddress: 'my-instance.zilliz.com:19530',
        vectorToken: 'zilliz-token',
        embeddingApiKey: 'openai-api-key',
      });

      expect(config.mode).toBe('cloud');
      expect(config.vectorStore.backend).toBe('zilliz');
      expect(config.vectorStore.config.address).toBe('my-instance.zilliz.com:19530');
      expect(config.vectorStore.config.token).toBe('zilliz-token');
      expect(config.embedding.provider).toBe('openai');
      expect(config.embedding.apiKey).toBe('openai-api-key');
      expect(config.embedding.local).toBe(false);
      expect(config.privacy?.blockExternalCalls).toBe(false);
    });

    it('VoyageAI + Qdrantのクラウドモード設定を生成できる', async () => {
      const config = await wizard.generateConfig({
        mode: 'cloud',
        vectorBackend: 'qdrant',
        embeddingProvider: 'voyageai',
        vectorAddress: 'my-cluster.qdrant.io:6333',
        vectorToken: 'qdrant-token',
        embeddingApiKey: 'voyageai-api-key',
        embeddingModel: 'voyage-2',
      });

      expect(config.mode).toBe('cloud');
      expect(config.vectorStore.backend).toBe('qdrant');
      expect(config.embedding.provider).toBe('voyageai');
      expect(config.embedding.model).toBe('voyage-2');
    });

    it('クラウドモードでAPIキーがない場合にエラーを投げる', async () => {
      await expect(
        wizard.generateConfig({
          mode: 'cloud',
          vectorBackend: 'zilliz',
          embeddingProvider: 'openai',
          // embeddingApiKey が欠落
        })
      ).rejects.toThrow('クラウドモードではAPIキーが必要です');
    });
  });

  describe('設定ファイルの保存', () => {
    it('生成した設定をファイルに保存できる', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
      });

      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined as any);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      await wizard.saveConfig(config);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        testConfigPath,
        expect.stringContaining('"mode": "local"'),
        'utf-8'
      );
    });

    it('設定ファイルが既に存在する場合に確認を求める', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
      });

      mockFs.existsSync.mockReturnValue(true);

      await expect(wizard.saveConfig(config, { overwrite: false })).rejects.toThrow(
        '設定ファイルが既に存在します'
      );
    });

    it('上書きフラグがtrueの場合に既存ファイルを上書きできる', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      await wizard.saveConfig(config, { overwrite: true });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('ディレクトリが存在しない場合に作成する', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
      });

      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined as any);
      mockFs.writeFileSync.mockImplementation(() => undefined);

      await wizard.saveConfig(config);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(testConfigPath),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('インタラクティブセットアップ', () => {
    it('ユーザー入力から設定を生成できる', async () => {
      const userInput = {
        mode: 'local' as const,
        vectorBackend: 'chroma' as const,
        embeddingProvider: 'transformers' as const,
      };

      const config = await wizard.runInteractive(userInput);

      expect(config.mode).toBe('local');
      expect(config.vectorStore.backend).toBe('chroma');
      expect(config.embedding.provider).toBe('transformers');
    });

    it('クイックスタートプリセットを使用できる', async () => {
      const config = await wizard.usePreset('quickstart');

      expect(config.mode).toBe('local');
      expect(config.vectorStore.backend).toBe('chroma');
      expect(config.embedding.provider).toBe('transformers');
      expect(config.privacy?.blockExternalCalls).toBe(true);
    });

    it('パフォーマンスプリセットを使用できる', async () => {
      const config = await wizard.usePreset('performance');

      expect(config.mode).toBe('local');
      expect(config.vectorStore.backend).toBe('milvus');
      expect(config.embedding.provider).toBe('transformers');
    });

    it('クラウドプリセットを使用できる', async () => {
      const config = await wizard.usePreset('cloud', {
        vectorAddress: 'test.zilliz.com:19530',
        vectorToken: 'token',
        embeddingApiKey: 'api-key',
      });

      expect(config.mode).toBe('cloud');
      expect(config.vectorStore.backend).toBe('zilliz');
      expect(config.embedding.provider).toBe('openai');
    });

    it('無効なプリセット名の場合にエラーを投げる', async () => {
      await expect(wizard.usePreset('invalid' as any)).rejects.toThrow('無効なプリセット名です');
    });
  });

  describe('バリデーション', () => {
    it('無効なモードでエラーを投げる', async () => {
      await expect(
        wizard.generateConfig({
          mode: 'invalid' as any,
          vectorBackend: 'milvus',
          embeddingProvider: 'transformers',
        })
      ).rejects.toThrow('無効なモードです');
    });

    it('無効なベクターDBバックエンドでエラーを投げる', async () => {
      await expect(
        wizard.generateConfig({
          mode: 'local',
          vectorBackend: 'invalid' as any,
          embeddingProvider: 'transformers',
        })
      ).rejects.toThrow('無効なベクターDBバックエンドです');
    });

    it('無効な埋め込みプロバイダーでエラーを投げる', async () => {
      await expect(
        wizard.generateConfig({
          mode: 'local',
          vectorBackend: 'milvus',
          embeddingProvider: 'invalid' as any,
        })
      ).rejects.toThrow('無効な埋め込みプロバイダーです');
    });

    it('モードとプロバイダーの不一致で警告を発する', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'openai',
        embeddingApiKey: 'test-key',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ローカルモードですが、クラウド埋め込みプロバイダー')
      );

      warnSpy.mockRestore();
    });
  });

  describe('設定のエクスポート/インポート', () => {
    it('設定をJSON文字列としてエクスポートできる', async () => {
      const config = await wizard.generateConfig({
        mode: 'local',
        vectorBackend: 'milvus',
        embeddingProvider: 'transformers',
      });

      const exported = wizard.exportConfig(config);
      const parsed = JSON.parse(exported);

      expect(parsed.mode).toBe('local');
      expect(parsed.vectorStore.backend).toBe('milvus');
    });

    it('JSON文字列から設定をインポートできる', async () => {
      const jsonConfig = JSON.stringify({
        mode: 'local',
        vectorStore: {
          backend: 'chroma',
          config: { path: './.lsp-mcp/chroma' },
        },
        embedding: {
          provider: 'transformers',
          model: 'Xenova/all-MiniLM-L6-v2',
          local: true,
        },
      });

      const config = await wizard.importConfig(jsonConfig);

      expect(config.mode).toBe('local');
      expect(config.vectorStore.backend).toBe('chroma');
    });

    it('無効なJSONでインポートエラーを投げる', async () => {
      await expect(wizard.importConfig('invalid json')).rejects.toThrow('無効なJSON形式です');
    });
  });
});
