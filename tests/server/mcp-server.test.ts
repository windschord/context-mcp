import { MCPServer } from '../../src/server/mcp-server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// MCPServerTransportのモック
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('MCPServer', () => {
  let mcpServer: MCPServer;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (mcpServer) {
      await mcpServer.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create an instance of MCPServer', () => {
      mcpServer = new MCPServer();
      expect(mcpServer).toBeInstanceOf(MCPServer);
    });

    it('should initialize with default name and version', () => {
      mcpServer = new MCPServer();
      expect(mcpServer).toBeDefined();
    });

    it('should allow custom name and version', () => {
      mcpServer = new MCPServer('custom-server', '1.0.0');
      expect(mcpServer).toBeDefined();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      mcpServer = new MCPServer();
    });

    it('should initialize the server without errors', async () => {
      await expect(mcpServer.initialize()).resolves.not.toThrow();
    });

    it('should return server info on initialization', async () => {
      const result = await mcpServer.initialize();
      expect(result).toHaveProperty('serverInfo');
      expect(result.serverInfo).toHaveProperty('name');
      expect(result.serverInfo).toHaveProperty('version');
    });

    it('should set capabilities on initialization', async () => {
      const result = await mcpServer.initialize();
      expect(result).toHaveProperty('capabilities');
    });

    it('should handle initialization errors gracefully', async () => {
      // シミュレート: 初期化中のエラー
      const brokenServer = new MCPServer();
      // 内部状態を破壊して初期化エラーを発生させる
      (brokenServer as any).server = null;

      await expect(brokenServer.initialize()).rejects.toThrow();
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      mcpServer = new MCPServer();
    });

    it('should shutdown the server gracefully', async () => {
      await mcpServer.initialize();
      await expect(mcpServer.shutdown()).resolves.not.toThrow();
    });

    it('should be safe to call shutdown multiple times', async () => {
      await mcpServer.initialize();
      await mcpServer.shutdown();
      await expect(mcpServer.shutdown()).resolves.not.toThrow();
    });

    it('should be safe to call shutdown before initialization', async () => {
      await expect(mcpServer.shutdown()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mcpServer = new MCPServer();
    });

    it('should handle MCP protocol errors', async () => {
      await mcpServer.initialize();

      // エラーハンドラーのテスト用に内部サーバーにアクセス
      const internalServer = (mcpServer as any).server as Server;
      expect(internalServer).toBeDefined();

      // エラーイベントがハンドルされることを確認
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      internalServer.onerror?.(new Error('Test error'));

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should handle transport errors', async () => {
      await mcpServer.initialize();

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      // トランスポートエラーをシミュレート
      const transport = (mcpServer as any).transport;
      if (transport && transport.onerror) {
        transport.onerror(new Error('Transport error'));
      }

      errorSpy.mockRestore();
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      mcpServer = new MCPServer();
    });

    it('should log initialization to stderr', async () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

      await mcpServer.initialize();

      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });

    it('should log shutdown to stderr', async () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

      await mcpServer.initialize();
      await mcpServer.shutdown();

      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });

    it('should log errors to stderr', async () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

      await mcpServer.initialize();

      // エラーをトリガー
      const internalServer = (mcpServer as any).server as Server;
      internalServer.onerror?.(new Error('Test error'));

      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });
  });

  describe('run', () => {
    beforeEach(() => {
      mcpServer = new MCPServer();
    });

    it('should start the server and connect transport', async () => {
      const mockConnect = jest.fn().mockResolvedValue(undefined);
      (StdioServerTransport as any).mockImplementation(() => ({
        connect: mockConnect,
        onerror: null,
        onclose: null,
      }));

      await mcpServer.run();

      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle run errors gracefully', async () => {
      const mockConnect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (StdioServerTransport as any).mockImplementation(() => ({
        connect: mockConnect,
        onerror: null,
        onclose: null,
      }));

      await expect(mcpServer.run()).rejects.toThrow('Connection failed');
    });
  });
});
