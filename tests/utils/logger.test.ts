import { Logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create a logger with default log level (INFO)', () => {
      logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should create a logger with custom log level', () => {
      logger = new Logger(LogLevel.DEBUG);
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('debug', () => {
    it('should log debug messages when level is DEBUG', () => {
      logger = new Logger(LogLevel.DEBUG);
      logger.debug('Debug message');

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('DEBUG');
      expect(output).toContain('Debug message');
    });

    it('should not log debug messages when level is INFO', () => {
      logger = new Logger(LogLevel.INFO);
      logger.debug('Debug message');

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages with data object', () => {
      logger = new Logger(LogLevel.DEBUG);
      logger.debug('Debug message', { key: 'value' });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('Debug message');
      expect(output).toContain('"key":"value"');
    });
  });

  describe('info', () => {
    it('should log info messages when level is INFO', () => {
      logger = new Logger(LogLevel.INFO);
      logger.info('Info message');

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('INFO');
      expect(output).toContain('Info message');
    });

    it('should not log info messages when level is WARN', () => {
      logger = new Logger(LogLevel.WARN);
      logger.info('Info message');

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should log info messages with data object', () => {
      logger = new Logger(LogLevel.INFO);
      logger.info('Info message', { count: 42 });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('Info message');
      expect(output).toContain('"count":42');
    });
  });

  describe('warn', () => {
    it('should log warning messages when level is WARN', () => {
      logger = new Logger(LogLevel.WARN);
      logger.warn('Warning message');

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('WARN');
      expect(output).toContain('Warning message');
    });

    it('should not log warning messages when level is ERROR', () => {
      logger = new Logger(LogLevel.ERROR);
      logger.warn('Warning message');

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should log warning messages with data object', () => {
      logger = new Logger(LogLevel.WARN);
      logger.warn('Warning message', { status: 'degraded' });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('Warning message');
      expect(output).toContain('"status":"degraded"');
    });
  });

  describe('error', () => {
    it('should always log error messages', () => {
      logger = new Logger(LogLevel.ERROR);
      logger.error('Error message');

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('ERROR');
      expect(output).toContain('Error message');
    });

    it('should log error messages with Error object', () => {
      logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('Error occurred');
      expect(output).toContain('Test error');
    });

    it('should log error messages with stack trace', () => {
      logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('stack');
    });

    it('should log error messages with data object', () => {
      logger = new Logger(LogLevel.ERROR);
      logger.error('Error message', { code: 'ERR_UNKNOWN' });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('Error message');
      expect(output).toContain('"code":"ERR_UNKNOWN"');
    });
  });

  describe('setLevel', () => {
    it('should change log level dynamically', () => {
      logger = new Logger(LogLevel.ERROR);
      logger.info('This should not log');
      expect(stderrSpy).not.toHaveBeenCalled();

      logger.setLevel(LogLevel.INFO);
      logger.info('This should log');
      expect(stderrSpy).toHaveBeenCalled();
    });
  });

  describe('timestamp formatting', () => {
    it('should include ISO timestamp in log output', () => {
      logger = new Logger(LogLevel.INFO);
      logger.info('Test message');

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      // ISO 8601形式のタイムスタンプを含むことを確認
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('JSON formatting', () => {
    it('should output logs in JSON format', () => {
      logger = new Logger(LogLevel.INFO);
      logger.info('Test message', { data: 'value' });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;

      // JSONとしてパース可能であることを確認
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('timestamp');
    });
  });

  describe('data sanitization', () => {
    it('should not log sensitive data (API keys)', () => {
      logger = new Logger(LogLevel.INFO);
      logger.info('Config loaded', {
        apiKey: 'sk-1234567890',
        token: 'secret-token',
      });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;

      // センシティブなデータは隠されているべき
      expect(output).not.toContain('sk-1234567890');
      expect(output).not.toContain('secret-token');
      expect(output).toContain('***');
    });

    it('should not log sensitive data (passwords)', () => {
      logger = new Logger(LogLevel.INFO);
      logger.info('Auth attempt', {
        username: 'user',
        password: 'mypassword',
      });

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;

      expect(output).not.toContain('mypassword');
      expect(output).toContain('***');
    });
  });
});
