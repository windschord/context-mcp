import { version } from '../src/index';

describe('LSP-MCP Entry Point', () => {
  describe('version', () => {
    it('should export version string', () => {
      expect(version).toBe('0.1.0');
    });
  });
});
