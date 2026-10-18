const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const subject = execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();

const notes = subject
    .replace(/^\w+(\([^)]*\))?!?:\s*/, '')
    .replace(/\s*\(\d+\.\d+\.\d+\)$/, '');

fs.writeFileSync('build/release-notes.md', notes.charAt(0).toUpperCase() + notes.slice(1) + '\n');