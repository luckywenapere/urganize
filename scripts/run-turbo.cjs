#!/usr/bin/env node

const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const shimDir = path.join(rootDir, '.turbo', 'package-manager-shims');
const isWindows = process.platform === 'win32';

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function writeFileIfChanged(filePath, content) {
  let currentContent = '';

  try {
    currentContent = readFileSync(filePath, 'utf8');
  } catch {}

  if (currentContent !== content) {
    writeFileSync(filePath, content, 'utf8');
  }
}

function ensurePnpmShim() {
  ensureDir(shimDir);

  if (isWindows) {
    const shimPath = path.join(shimDir, 'pnpm.cmd');
    writeFileIfChanged(shimPath, '@echo off\r\ncorepack pnpm %*\r\n');
    return;
  }

  const shimPath = path.join(shimDir, 'pnpm');
  writeFileIfChanged(shimPath, '#!/usr/bin/env sh\nexec corepack pnpm "$@"\n');
  chmodSync(shimPath, 0o755);
}

function resolveTurboEntryPoint() {
  return path.join(rootDir, 'node_modules', 'turbo', 'bin', 'turbo');
}

function isAlreadyRunningWebDevFailure(output) {
  return (
    output.includes('Another next dev server is already running.') &&
    output.includes('Failed:    @urganize/web#dev') &&
    output.includes('@urganize/web:dev:')
  );
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function shouldSuppressTurboFailureLine(line, sawAlreadyRunningMessage) {
  if (!sawAlreadyRunningMessage) {
    return false;
  }

  const normalizedLine = stripAnsi(line);

  return (
    normalizedLine.includes('ELIFECYCLE') ||
    normalizedLine.startsWith(' Tasks:') ||
    normalizedLine.startsWith('Cached:') ||
    normalizedLine.startsWith('  Time:') ||
    normalizedLine.includes('Failed:    @urganize/web#dev') ||
    normalizedLine.startsWith('• turbo ') ||
    normalizedLine.includes('ERROR  @urganize/web#dev:') ||
    normalizedLine.includes('ERROR  run failed:')
  );
}

ensurePnpmShim();

const turboEntryPoint = resolveTurboEntryPoint();
const env = {
  ...process.env,
  PATH: [shimDir, path.join(rootDir, 'node_modules', '.bin'), process.env.PATH || ''].join(path.delimiter),
};

const child = spawn(process.execPath, [turboEntryPoint, ...process.argv.slice(2)], {
  cwd: rootDir,
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let combinedOutput = '';
let sawAlreadyRunningMessage = false;

function createForwarder(write) {
  let buffer = '';

  return {
    onData(chunk) {
      const text = chunk.toString();
      buffer += text;
      combinedOutput += text;

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex + 1);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.includes('Another next dev server is already running.')) {
          sawAlreadyRunningMessage = true;
        }

        if (!shouldSuppressTurboFailureLine(line, sawAlreadyRunningMessage)) {
          write(line);
        }

        newlineIndex = buffer.indexOf('\n');
      }
    },
    flush() {
      if (!buffer) {
        return;
      }

      if (buffer.includes('Another next dev server is already running.')) {
        sawAlreadyRunningMessage = true;
      }

      if (!shouldSuppressTurboFailureLine(buffer, sawAlreadyRunningMessage)) {
        write(buffer);
      }

      buffer = '';
    },
  };
}

const stdoutForwarder = createForwarder((value) => process.stdout.write(value));
const stderrForwarder = createForwarder((value) => process.stderr.write(value));

if (child.stdout) {
  child.stdout.on('data', (chunk) => {
    stdoutForwarder.onData(chunk);
  });
}

if (child.stderr) {
  child.stderr.on('data', (chunk) => {
    stderrForwarder.onData(chunk);
  });
}

child.on('close', (code) => {
  stdoutForwarder.flush();
  stderrForwarder.flush();

  process.off('SIGINT', forwardSignal);
  process.off('SIGTERM', forwardSignal);

  if ((code || 0) !== 0 && isAlreadyRunningWebDevFailure(combinedOutput)) {
    console.log();
    console.log('apps/web already has a live Next.js dev server. Keeping that server and exiting cleanly.');
    process.exit(0);
  }

  process.exit(code || 0);
});

child.on('error', (error) => {
  stdoutForwarder.flush();
  stderrForwarder.flush();
  console.error(error.message || 'Could not start Turborepo.');
  process.exit(1);
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);
