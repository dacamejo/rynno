#!/usr/bin/env node

const { spawn } = require('node:child_process');

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--runInBand');

const child = spawn(process.execPath, ['--test', ...forwardedArgs], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
