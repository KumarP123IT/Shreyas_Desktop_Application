/**
 * Pino logger with rolling file transport + pretty console in dev.
 */

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('./index');

// Ensure log dir exists
if (!fs.existsSync(config.log.dir)) {
  fs.mkdirSync(config.log.dir, { recursive: true });
}

const logFile = path.join(config.log.dir, 'app.log');

const targets = [
  {
    target: 'pino/file',
    level: config.log.level,
    options: { destination: logFile, mkdir: true },
  },
];

if (config.isDev) {
  targets.push({
    target: 'pino-pretty',
    level: config.log.level,
    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
  });
}

const logger = pino(
  { level: config.log.level },
  pino.transport({ targets })
);

module.exports = logger;
