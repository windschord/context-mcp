import { version, main } from '../src/index';

describe('LSP-MCP Entry Point', () => {
  describe('version', () => {
    it('should export version string', () => {
      expect(version).toBe('0.1.0');
    });
  });

  describe('main', () => {
    it('should run without errors', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      expect(() => main()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('LSP-MCP server starting...');

      consoleSpy.mockRestore();
    });
  });
});
