import { version } from '../src/index';

describe('Context-MCP Entry Point', () => {
  describe('version', () => {
    it('should export version string', () => {
      expect(version).toBe('0.1.0');
    });
  });
});
