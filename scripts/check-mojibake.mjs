#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.html',
  '.css',
  '.scss',
  '.sql',
  '.yml',
  '.yaml',
  '.sh',
  '.bat',
]);

const IGNORE_MARKER = 'mojibake-allow-line';

const SUSPICIOUS_PATTERNS = [
  { label: 'micro-sign', regex: /\u00B5/g }, // mojibake-allow-line
  { label: 'latin-mojibake', regex: /[\u00D0\u00D1\u00C2\u00C3\u00C4]/g }, // mojibake-allow-line
  { label: 'smart-quote-mojibake', regex: /\u0432\u0402/g }, // mojibake-allow-line
  { label: 'cyrillic-mojibake', regex: /(?:[\u0420\u0421][\u0400-\u04FF]){2,}/g },
  { label: 'question-garbage', regex: /\?{4,}/g },
];

function parseArgs(argv) {
  const args = {
    mode: 'paths',
    paths: [],
  };

  for (const arg of argv) {
    if (arg === '--staged') {
      args.mode = 'staged';
      continue;
    }
    if (arg === '--tracked') {
      args.mode = 'tracked';
      continue;
    }
    if (arg === '--stdin') {
      args.mode = 'stdin';
      continue;
    }
    args.paths.push(arg);
  }

  return args;
}

function gitLines(...gitArgs) {
  const output = execFileSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getPaths(args) {
  if (args.mode === 'staged') {
    return gitLines('diff', '--cached', '--name-only', '--diff-filter=ACMR');
  }

  if (args.mode === 'tracked') {
    return gitLines('ls-files');
  }

  if (args.mode === 'stdin') {
    const input = fs.readFileSync(0, 'utf8');
    return input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return args.paths;
}

function shouldCheckFile(filePath) {
  if (!filePath) return false;
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function collectMatches(content) {
  const matches = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let result;
    while ((result = pattern.regex.exec(content)) !== null) {
      matches.push({
        index: result.index,
        value: result[0],
        label: pattern.label,
      });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function lineInfo(content, index) {
  const before = content.slice(0, index);
  const line = before.split('\n').length;
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEndIndex = content.indexOf('\n', index);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const text = content.slice(lineStart, lineEnd);
  return { line, text };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidatePaths = [...new Set(getPaths(args))];
  const filePaths = candidatePaths.filter(shouldCheckFile);

  const findings = [];

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('\u0000')) continue;

    const matches = collectMatches(content);
    if (matches.length === 0) continue;

    const byLine = new Map();
    for (const match of matches) {
      const info = lineInfo(content, match.index);
      if (info.text.includes(IGNORE_MARKER)) continue;
      if (!byLine.has(info.line)) {
        byLine.set(info.line, {
          line: info.line,
          text: info.text,
          markers: new Set(),
        });
      }
      byLine.get(info.line).markers.add(match.label);
    }

    findings.push({
      filePath,
      lines: [...byLine.values()].slice(0, 20),
    });
  }

  if (findings.length === 0) {
    console.log(`Mojibake check passed: ${filePaths.length} file(s) checked.`);
    return;
  }

  console.error('Mojibake check failed. Suspicious text found:');
  for (const finding of findings) {
    console.error(`\n${finding.filePath}`);
    for (const item of finding.lines) {
      const markers = [...item.markers].join(', ');
      console.error(`  ${item.line}: [${markers}] ${item.text}`);
    }
  }

  console.error('\nFix these strings before commit/push.');
  process.exit(1);
}

main();
