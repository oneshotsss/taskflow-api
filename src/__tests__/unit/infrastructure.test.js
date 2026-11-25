// Unit tests for the small infrastructure modules: config, logger, context.
const { loadConfig, VALID_REPO_TYPES } = require('../../config');
const logger = require('../../utils/logger');
const {
  runWithContext,
  getContext,
  getProcessId,
  getUserId,
} = require('../../context/asyncContext');

describe('loadConfig', () => {
  it('defaults to postgres on port 3000 with a URL built from POSTGRES_PORT', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      repoType: 'postgres',
      databaseUrl: 'postgres://taskflow_user:taskflow_password@localhost:5432/taskflow_db',
    });
    expect(loadConfig({ POSTGRES_PORT: '6543' }).databaseUrl).toContain('localhost:6543/');
  });

  it('DATABASE_URL and PORT override the defaults', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://x/y', PORT: '8080', REPO_TYPE: 'memory' });
    expect(cfg).toEqual({ port: 8080, repoType: 'memory', databaseUrl: 'postgres://x/y' });
  });

  it('rejects an unknown REPO_TYPE instead of silently falling back', () => {
    expect(() => loadConfig({ REPO_TYPE: 'mongo' })).toThrow(
      'Invalid REPO_TYPE "mongo". Allowed values: postgres, memory'
    );
    expect(VALID_REPO_TYPES).toEqual(['postgres', 'memory']);
  });
});

describe('logger', () => {
  let log;
  const saved = { LOG_LEVEL: process.env.LOG_LEVEL, NODE_ENV: process.env.NODE_ENV };
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    Object.assign(process.env, saved);
    jest.restoreAllMocks();
  });

  it('prefixes every line with processId and userId from the request context', () => {
    process.env.LOG_LEVEL = 'debug';
    runWithContext({ processId: 'p-1', userId: 'u-9' }, () => logger.info('hello'));
    expect(log.mock.calls[0][0]).toMatch(/^\[.+Z\] \[Process: p-1\] \[User: u-9\] INFO: hello$/);
  });

  it('appends meta: Error stack, string as is, object as JSON, skips empty', () => {
    process.env.LOG_LEVEL = 'debug';
    const err = new Error('boom');
    logger.info('a', err);
    logger.info('b', 'text');
    logger.info('c', { n: 1 });
    logger.info('d', '');
    const lines = log.mock.calls.map((c) => c[0]);
    expect(lines[0]).toContain(`a ${err.stack}`);
    expect(lines[1]).toMatch(/ b text$/);
    expect(lines[2]).toMatch(/ c \{"n":1\}$/);
    expect(lines[3]).toMatch(/ d$/);
  });

  it('drops lines below LOG_LEVEL; defaults to info in production, debug otherwise', () => {
    process.env.LOG_LEVEL = 'warn';
    logger.info('hidden');
    expect(log).not.toHaveBeenCalled();

    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'production';
    logger.debug('hidden in prod');
    logger.info('shown in prod');
    expect(log).toHaveBeenCalledTimes(1);

    process.env.NODE_ENV = 'development';
    logger.debug('shown in dev');
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe('asyncContext', () => {
  it('returns defaults outside a request', () => {
    expect(getContext()).toEqual({});
    expect(getProcessId()).toBe('system-process');
    expect(getUserId()).toBeNull();
  });

  it('keeps the context across awaits inside the request', async () => {
    await runWithContext({ processId: 'p-2', userId: null }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(getContext()).toEqual({ processId: 'p-2', userId: null });
      expect(getProcessId()).toBe('p-2');
      expect(getUserId()).toBeNull();
    });
  });
});
