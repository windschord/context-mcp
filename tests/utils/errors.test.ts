import {
  MCPError,
  InvalidParamsError,
  InternalError,
  NotFoundError,
  MethodNotFoundError,
  ConfigValidationError,
  toMCPError,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('MCPError', () => {
    it('should create an MCPError with code and message', () => {
      const error = new MCPError(-32600, 'Invalid Request');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(-32600);
      expect(error.message).toBe('Invalid Request');
    });

    it('should create an MCPError with additional data', () => {
      const error = new MCPError(-32600, 'Invalid Request', { field: 'name' });
      expect(error.code).toBe(-32600);
      expect(error.message).toBe('Invalid Request');
      expect(error.data).toEqual({ field: 'name' });
    });

    it('should serialize to JSON correctly', () => {
      const error = new MCPError(-32600, 'Invalid Request');
      const json = error.toJSON();

      expect(json).toHaveProperty('code', -32600);
      expect(json).toHaveProperty('message', 'Invalid Request');
    });

    it('should include data in JSON when present', () => {
      const error = new MCPError(-32600, 'Invalid Request', { field: 'name' });
      const json = error.toJSON();

      expect(json).toHaveProperty('data');
      expect(json.data).toEqual({ field: 'name' });
    });
  });

  describe('InvalidParamsError', () => {
    it('should create an InvalidParamsError', () => {
      const error = new InvalidParamsError('Missing required parameter');
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(-32602);
      expect(error.message).toBe('Missing required parameter');
    });

    it('should support additional data', () => {
      const error = new InvalidParamsError('Missing required parameter', {
        param: 'rootPath',
      });
      expect(error.data).toEqual({ param: 'rootPath' });
    });
  });

  describe('InternalError', () => {
    it('should create an InternalError', () => {
      const error = new InternalError('Internal server error');
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(-32603);
      expect(error.message).toBe('Internal server error');
    });

    it('should support additional data', () => {
      const error = new InternalError('Internal server error', {
        originalError: 'Database connection failed',
      });
      expect(error.data).toEqual({
        originalError: 'Database connection failed',
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create a NotFoundError', () => {
      const error = new NotFoundError('Resource not found');
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(-32001);
      expect(error.message).toBe('Resource not found');
    });

    it('should support additional data', () => {
      const error = new NotFoundError('Resource not found', {
        resource: 'project',
        id: '123',
      });
      expect(error.data).toEqual({ resource: 'project', id: '123' });
    });
  });

  describe('MethodNotFoundError', () => {
    it('should create a MethodNotFoundError', () => {
      const error = new MethodNotFoundError('unknown_method');
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(-32601);
      expect(error.message).toContain('unknown_method');
    });

    it('should format message correctly', () => {
      const error = new MethodNotFoundError('test_method');
      expect(error.message).toBe('Method not found: test_method');
    });
  });

  describe('ConfigValidationError', () => {
    it('should create a ConfigValidationError', () => {
      const error = new ConfigValidationError('Invalid configuration');
      expect(error).toBeInstanceOf(MCPError);
      expect(error.code).toBe(-32002);
      expect(error.message).toBe('Invalid configuration');
    });

    it('should support additional data', () => {
      const error = new ConfigValidationError('Invalid configuration', {
        field: 'mode',
        value: 'invalid',
      });
      expect(error.data).toEqual({ field: 'mode', value: 'invalid' });
    });
  });

  describe('toMCPError', () => {
    it('should return MCPError as is', () => {
      const originalError = new InvalidParamsError('Test error');
      const result = toMCPError(originalError);

      expect(result).toBe(originalError);
    });

    it('should convert Error to InternalError', () => {
      const originalError = new Error('Something went wrong');
      const result = toMCPError(originalError);

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toContain('Something went wrong');
    });

    it('should convert string to InternalError', () => {
      const result = toMCPError('Error string');

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toContain('Error string');
    });

    it('should convert unknown type to InternalError', () => {
      const result = toMCPError({ unknown: 'object' });

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toContain('Unknown error');
    });

    it('should include stack trace in data', () => {
      const originalError = new Error('Test error');
      const result = toMCPError(originalError);

      expect(result.data).toHaveProperty('stack');
    });

    it('should handle errors without message', () => {
      const originalError = new Error();
      const result = toMCPError(originalError);

      expect(result).toBeInstanceOf(InternalError);
      expect(result.message).toBeDefined();
    });
  });

  describe('error response format', () => {
    it('should format error response for MCP protocol', () => {
      const error = new InvalidParamsError('Missing parameter', {
        param: 'query',
      });
      const response = error.toJSON();

      expect(response).toEqual({
        code: -32602,
        message: 'Missing parameter',
        data: { param: 'query' },
      });
    });

    it('should omit data field when not present', () => {
      const error = new NotFoundError('Not found');
      const response = error.toJSON();

      expect(response).toEqual({
        code: -32001,
        message: 'Not found',
      });
    });
  });

  describe('error codes', () => {
    it('should use correct JSON-RPC error codes', () => {
      expect(new InvalidParamsError('test').code).toBe(-32602);
      expect(new InternalError('test').code).toBe(-32603);
      expect(new MethodNotFoundError('test').code).toBe(-32601);
    });

    it('should use custom error codes for application errors', () => {
      expect(new NotFoundError('test').code).toBe(-32001);
      expect(new ConfigValidationError('test').code).toBe(-32002);
    });
  });
});
