process.env.NODE_ENV = 'test';

if (process.env.QUEUE_ENABLED === undefined) {
  process.env.QUEUE_ENABLED = 'false';
}
