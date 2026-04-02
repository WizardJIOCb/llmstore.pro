import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';

type SupportedCodeLanguage =
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'bash'
  | 'python'
  | 'php'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'swift'
  | 'ruby'
  | 'sql'
  | 'markdown'
  | 'text';

const CODE_FONT_FAMILY = [
  'JetBrains Mono',
  'Fira Code',
  'SFMono-Regular',
  'Consolas',
  'Liberation Mono',
  'Menlo',
  'monospace',
].join(', ');

const LANGUAGE_ALIASES: Record<string, SupportedCodeLanguage> = {
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  'c++': 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  typescript: 'typescript',
  json: 'json',
  html: 'html',
  htm: 'html',
  xml: 'html',
  svg: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  python: 'python',
  php: 'php',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  kotlin: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  ruby: 'ruby',
  sql: 'sql',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  plaintext: 'text',
};

const LANGUAGE_LABELS: Record<SupportedCodeLanguage, string> = {
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  bash: 'Bash',
  python: 'Python',
  php: 'PHP',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  ruby: 'Ruby',
  sql: 'SQL',
  markdown: 'Markdown',
  text: 'Text',
};

const KEYWORDS_BY_LANGUAGE: Partial<Record<SupportedCodeLanguage, string[]>> = {
  c: [
    'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern',
    'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return', 'short', 'signed',
    'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  ],
  cpp: [
    'alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr', 'continue',
    'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for',
    'friend', 'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr', 'operator',
    'private', 'protected', 'public', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'template',
    'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'while',
  ],
  csharp: [
    'abstract', 'as', 'async', 'await', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class',
    'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit',
    'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'if', 'implicit', 'in', 'int', 'interface',
    'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params',
    'private', 'protected', 'public', 'readonly', 'record', 'ref', 'return', 'sealed', 'short', 'static', 'string',
    'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'using', 'var', 'virtual', 'void',
    'while',
  ],
  javascript: [
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'else', 'export',
    'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return',
    'switch', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'yield',
  ],
  typescript: [
    'abstract', 'as', 'asserts', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'declare',
    'default', 'delete', 'else', 'enum', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'implements',
    'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'namespace', 'new', 'of', 'private',
    'protected', 'public', 'readonly', 'return', 'satisfies', 'switch', 'throw', 'try', 'type', 'typeof', 'using',
    'var', 'void', 'while',
  ],
  bash: [
    'case', 'coproc', 'do', 'done', 'elif', 'else', 'esac', 'export', 'fi', 'for', 'function', 'if', 'in', 'local',
    'readonly', 'return', 'select', 'then', 'time', 'until', 'while',
  ],
  python: [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
    'raise', 'return', 'try', 'while', 'with', 'yield',
  ],
  php: [
    'abstract', 'array', 'as', 'break', 'case', 'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default',
    'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile',
    'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for', 'foreach', 'function', 'global', 'if', 'implements',
    'include', 'include_once', 'instanceof', 'interface', 'isset', 'match', 'namespace', 'new', 'print', 'private',
    'protected', 'public', 'readonly', 'require', 'require_once', 'return', 'static', 'switch', 'throw', 'trait',
    'try', 'use', 'var', 'while', 'yield',
  ],
  go: [
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go',
    'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
    'var',
  ],
  rust: [
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn',
    'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
    'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
  ],
  java: [
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default',
    'do', 'double', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'float', 'for', 'if', 'implements',
    'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'null', 'package', 'private', 'protected',
    'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
    'transient', 'true', 'try', 'void', 'volatile', 'while',
  ],
  kotlin: [
    'abstract', 'annotation', 'as', 'break', 'by', 'catch', 'class', 'companion', 'const', 'constructor', 'continue',
    'data', 'do', 'else', 'enum', 'false', 'for', 'fun', 'if', 'import', 'in', 'interface', 'internal', 'is', 'lateinit',
    'null', 'object', 'open', 'operator', 'override', 'package', 'private', 'protected', 'public', 'return', 'sealed',
    'super', 'suspend', 'this', 'throw', 'true', 'try', 'typealias', 'val', 'var', 'when', 'while',
  ],
  swift: [
    'associatedtype', 'break', 'case', 'class', 'continue', 'default', 'defer', 'deinit', 'do', 'else', 'enum',
    'extension', 'false', 'fallthrough', 'for', 'func', 'guard', 'if', 'import', 'in', 'init', 'inout', 'internal',
    'let', 'nil', 'private', 'protocol', 'public', 'repeat', 'return', 'self', 'static', 'struct', 'subscript',
    'super', 'switch', 'throw', 'throws', 'true', 'try', 'var', 'where', 'while',
  ],
  ruby: [
    'BEGIN', 'END', 'alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end',
    'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry', 'return',
    'self', 'super', 'then', 'true', 'undef', 'unless', 'until', 'when', 'while', 'yield',
  ],
  sql: [
    'all', 'and', 'as', 'asc', 'between', 'by', 'case', 'create', 'delete', 'desc', 'distinct', 'drop', 'else', 'end',
    'from', 'group', 'having', 'in', 'inner', 'insert', 'into', 'join', 'left', 'limit', 'not', 'null', 'offset',
    'on', 'or', 'order', 'outer', 'right', 'select', 'set', 'table', 'then', 'union', 'update', 'values', 'when',
    'where',
  ],
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceOutsidePlaceholders(
  value: string,
  tokenPrefix: string,
  pattern: RegExp,
  replacer: string | ((substring: string, ...args: unknown[]) => string),
): string {
  const placeholderPattern = new RegExp(`(${tokenPrefix}\\d+___)`, 'g');
  return value
    .split(placeholderPattern)
    .map((part) => (part.startsWith(tokenPrefix) ? part : part.replace(pattern, replacer as never)))
    .join('');
}

function decorateOutsidePlaceholders(
  value: string,
  tokenPrefix: string,
  stash: (html: string) => string,
  pattern: RegExp,
  replacer: string | ((substring: string, ...args: unknown[]) => string),
): string {
  const placeholderPattern = new RegExp(`(${tokenPrefix}\\d+___)`, 'g');
  return value
    .split(placeholderPattern)
    .map((part) => {
      if (part.startsWith(tokenPrefix)) return part;
      return part.replace(
        pattern,
        (...args) => stash(typeof replacer === 'function' ? replacer(...args) : args[0].replace(pattern, replacer as string)),
      );
    })
    .join('');
}

function highlightHtmlAttributes(attrs: string): string {
  return attrs.replace(
    /(\s+)([^\s=/>]+)(\s*=\s*(?:&quot;.*?&quot;|&#39;.*?&#39;|[^\s"'=<>`]+))?/g,
    (_match, spacing: string, name: string, valueChunk?: string) => {
      if (!valueChunk) {
        return `${spacing}<span class="text-sky-200">${name}</span>`;
      }

      const eqMatch = valueChunk.match(/^(\s*=\s*)([\s\S]+)$/);
      if (!eqMatch) {
        return `${spacing}<span class="text-sky-200">${name}</span>${valueChunk}`;
      }

      return `${spacing}<span class="text-sky-200">${name}</span><span class="text-slate-500">${eqMatch[1]}</span><span class="text-emerald-300">${eqMatch[2]}</span>`;
    },
  );
}

function highlightHtmlLine(value: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => `___LLMSTORE_CODE_HTML_${placeholders.push(html) - 1}___`;

  let escaped = escapeHtml(value);

  escaped = escaped.replace(
    /&lt;!--.*?--&gt;/g,
    (match) => stash(`<span class="text-slate-500">${match}</span>`),
  );

  escaped = escaped.replace(
    /&lt;!DOCTYPE.*?&gt;/gi,
    (match) => stash(`<span class="text-fuchsia-300">${match}</span>`),
  );

  escaped = escaped.replace(
    /(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
    (_match, open: string, tagName: string, attrs: string, close: string) => (
      `<span class="text-slate-500">${open}</span>`
      + `<span class="text-cyan-200">${tagName}</span>`
      + highlightHtmlAttributes(attrs)
      + `<span class="text-slate-500">${close}</span>`
    ),
  );

  return escaped.replace(
    /___LLMSTORE_CODE_HTML_(\d+)___/g,
    (_match, index: string) => placeholders[Number(index)] ?? '',
  );
}

function highlightMarkdownLine(value: string): string {
  let escaped = escapeHtml(value);

  escaped = escaped.replace(
    /^(\s{0,3}(?:#{1,6}))/,
    '<span class="text-fuchsia-300">$1</span>',
  );

  escaped = escaped.replace(
    /^(\s*(?:[-+*]|\d+\.))(\s+)/,
    '<span class="text-sky-300">$1</span>$2',
  );

  escaped = escaped.replace(
    /^(\s*&gt;)/,
    '<span class="text-emerald-300">$1</span>',
  );

  escaped = escaped.replace(
    /(`[^`]+`)/g,
    '<span class="rounded bg-white/10 px-1 text-amber-200">$1</span>',
  );

  return escaped;
}

function highlightCssLine(value: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => `___LLMSTORE_CODE_CSS_${placeholders.push(html) - 1}___`;
  let escaped = escapeHtml(value);

  escaped = escaped.replace(
    /\/\*.*?\*\//g,
    (match) => stash(`<span class="text-slate-500">${match}</span>`),
  );

  escaped = escaped.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g,
    (match) => stash(`<span class="text-emerald-300">${match}</span>`),
  );

  escaped = escaped.replace(
    /(^\s*)([.#@]?[A-Za-z_-][\w-]*)(\s*:\s*)/g,
    '$1<span class="text-cyan-200">$2</span><span class="text-slate-500">$3</span>',
  );

  escaped = escaped.replace(
    /([A-Za-z-]+)(?=\s*:)/g,
    '<span class="text-sky-300">$1</span>',
  );

  escaped = escaped.replace(
    /#[\da-fA-F]{3,8}\b/g,
    '<span class="text-rose-300">$&</span>',
  );

  escaped = escaped.replace(
    /\b(\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|ms|s|deg)?)\b/g,
    '<span class="text-amber-200">$1</span>',
  );

  return escaped.replace(
    /___LLMSTORE_CODE_CSS_(\d+)___/g,
    (_match, index: string) => placeholders[Number(index)] ?? '',
  );
}

function highlightJsonLine(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(
      /^(\s*)("(?:\\.|[^"\\])*")(\s*:)/,
      '$1<span class="text-sky-300">$2</span><span class="text-slate-500">$3</span>',
    )
    .replace(
      /(:\s*)("(?:\\.|[^"\\])*")/g,
      '$1<span class="text-emerald-300">$2</span>',
    )
    .replace(/\b-?\d+(?:\.\d+)?\b/g, '<span class="text-amber-200">$&</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="text-fuchsia-300">$1</span>');
}

function highlightGenericLine(value: string, language: Exclude<SupportedCodeLanguage, 'html' | 'css' | 'json' | 'markdown' | 'text'>): string {
  const placeholders: string[] = [];
  const stash = (html: string) => `___LLMSTORE_CODE_TOKEN_${placeholders.push(html) - 1}___`;
  let escaped = escapeHtml(value);
  const tokenPrefix = '___LLMSTORE_CODE_TOKEN_';

  const stringPattern = language === 'bash'
    ? /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g
    : /(`(?:\\.|[^`\\\n])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g;

  escaped = escaped.replace(
    stringPattern,
    (match) => stash(`<span class="text-emerald-300">${match}</span>`),
  );

  const commentPattern = language === 'python'
    ? /(#.*)$/g
    : language === 'ruby'
      ? /(#.*)$/g
    : language === 'php'
      ? /(\/\/.*|#.*)$/g
    : language === 'sql'
      ? /(--.*)$/gi
      : /((?:\/\/|#).*)$/g;

  escaped = escaped.replace(
    commentPattern,
    (match) => stash(`<span class="text-slate-500">${match}</span>`),
  );

  if (language === 'sql') {
    escaped = decorateOutsidePlaceholders(
      escaped,
      tokenPrefix,
      stash,
      /\b([A-Z_][A-Z0-9_]*|select|from|where|join|left|right|inner|outer|group|order|by|limit|offset|insert|into|values|update|set|delete|create|table|drop|case|when|then|else|end|distinct|union|having|on|as|and|or|not|null)\b/gi,
      '<span class="text-sky-300">$1</span>',
    );
  } else {
    const keywords = KEYWORDS_BY_LANGUAGE[language] ?? [];
    if (keywords.length > 0) {
      const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
      escaped = decorateOutsidePlaceholders(
        escaped,
        tokenPrefix,
        stash,
        keywordPattern,
        '<span class="text-sky-300">$1</span>',
      );
    }
  }

  escaped = decorateOutsidePlaceholders(
    escaped,
    tokenPrefix,
    stash,
    /\b(true|false|null|undefined|None|True|False)\b/g,
    '<span class="text-fuchsia-300">$1</span>',
  );

  escaped = decorateOutsidePlaceholders(
    escaped,
    tokenPrefix,
    stash,
    /\b-?\d+(?:\.\d+)?\b/g,
    '<span class="text-amber-200">$&</span>',
  );

  escaped = decorateOutsidePlaceholders(
    escaped,
    tokenPrefix,
    stash,
    /\b([A-Za-z_][\w]*)(?=\()/g,
    '<span class="text-cyan-200">$1</span>',
  );

  escaped = decorateOutsidePlaceholders(
    escaped,
    tokenPrefix,
    stash,
    /\b([A-Za-z_][\w]*)(?=\s*=)/g,
    '<span class="text-orange-200">$1</span>',
  );

  if (language === 'php') {
    escaped = decorateOutsidePlaceholders(
      escaped,
      tokenPrefix,
      stash,
      /\$([A-Za-z_]\w*)/g,
      '<span class="text-orange-200">$$1</span>',
    );
  }

  if (language === 'ruby') {
    escaped = decorateOutsidePlaceholders(
      escaped,
      tokenPrefix,
      stash,
      /@{1,2}([A-Za-z_]\w*)/g,
      '<span class="text-orange-200">@$1</span>',
    );
  }

  return escaped.replace(
    /___LLMSTORE_CODE_TOKEN_(\d+)___/g,
    (_match, index: string) => placeholders[Number(index)] ?? '',
  );
}

function detectCodeLanguage(value: string): SupportedCodeLanguage {
  const trimmed = value.trim();

  if (!trimmed) return 'text';

  if ((trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // noop
    }
  }

  if (/(^|\n)\s*<!DOCTYPE html>|<html\b|<body\b|<div\b|<span\b|<script\b|<\/[A-Za-z]/i.test(trimmed)) {
    return 'html';
  }

  if (/(^|\n)\s*[@.#]?[A-Za-z_-][\w-]*\s*\{[\s\S]*:\s*[^;]+;?/m.test(trimmed)) {
    return 'css';
  }

  if (/^\s*SELECT\b|^\s*WITH\b|^\s*INSERT\b|^\s*UPDATE\b|^\s*DELETE\b|^\s*CREATE\b/im.test(trimmed)) {
    return 'sql';
  }

  if (/^\s*<\?php\b/m.test(trimmed) || /(^|\n)\s*\$[A-Za-z_]\w*\s*=/.test(trimmed) || /\becho\s+\$[A-Za-z_]\w*/.test(trimmed)) {
    return 'php';
  }

  if (/^\s*package\s+\w+/m.test(trimmed) || /^\s*func\s+\w+\s*\(/m.test(trimmed) || /\bfmt\.(?:Print|Println|Printf)\s*\(/.test(trimmed)) {
    return 'go';
  }

  if (/^\s*fn\s+\w+\s*\(/m.test(trimmed) || /\bprintln!\s*\(/.test(trimmed) || /\buse\s+std::/.test(trimmed) || /\blet\s+mut\b/.test(trimmed)) {
    return 'rust';
  }

  if (/^\s*using\s+[A-Z][\w.]*(?:\s*;|\s*=)/m.test(trimmed) || /\bConsole\.Write(?:Line)?\s*\(/.test(trimmed) || /\bnamespace\s+[A-Z][\w.]*/.test(trimmed)) {
    return 'csharp';
  }

  if (/^\s*import\s+java\./m.test(trimmed) || /\bSystem\.out\.println\s*\(/.test(trimmed) || /^\s*public\s+class\s+\w+/m.test(trimmed)) {
    return 'java';
  }

  if (/^\s*fun\s+\w+\s*\(/m.test(trimmed) || /^\s*(?:val|var)\s+[A-Za-z_]\w*\s*[:=]/m.test(trimmed) || /^\s*package\s+[\w.]+\s*$/m.test(trimmed)) {
    return 'kotlin';
  }

  if (/^\s*import\s+(?:SwiftUI|Foundation)\b/m.test(trimmed) || /^\s*func\s+\w+\s*\(/m.test(trimmed) || /\bguard\b[\s\S]*\belse\b/.test(trimmed)) {
    return 'swift';
  }

  if (/^\s*require\s+['"][^'"]+['"]/m.test(trimmed) || /^\s*puts\b/m.test(trimmed) || /^\s*def\s+[A-Za-z_]\w*[!?=]?\b/m.test(trimmed) || /^\s*class\s+[A-Z]\w+/m.test(trimmed) && /\bend\b/m.test(trimmed)) {
    return 'ruby';
  }

  if (/^\s*def\b|^\s*class\b|^\s*from\b.+\bimport\b|^\s*import\s+[A-Za-z_][\w.]*(?:\s+as\s+\w+)?\s*$/m.test(trimmed)) {
    return 'python';
  }

  if (/#include\s*<[^>]+>/.test(trimmed)) {
    if (/\bstd::\w+/.test(trimmed) || /\bcout\s*<</.test(trimmed) || /\bcin\s*>>/.test(trimmed) || /\btemplate\s*</.test(trimmed) || /\bclass\s+\w+/.test(trimmed)) {
      return 'cpp';
    }
    return 'c';
  }

  if (/\bprintf\s*\(/.test(trimmed) || /\bscanf\s*\(/.test(trimmed) || /\bint\s+main\s*\(/.test(trimmed)) {
    return 'c';
  }

  if (/^#!\/bin\/(?:bash|sh)|^\s*(?:npm|pnpm|yarn|bun|git|cd|ls|cat|curl|docker|kubectl)\b/m.test(trimmed)) {
    return 'bash';
  }

  if (/(?:\binterface\b|\btype\b|\bimplements\b|\benum\b|\breadonly\b|\bas const\b|:\s*[A-Z][A-Za-z0-9_<>\[\]\|&?, ]+)/.test(trimmed)) {
    return 'typescript';
  }

  if (/(?:\bconst\b|\blet\b|\bvar\b|\bfunction\b|=>|\bconsole\.\w+\b|\bexport\b|\bimport\b)/.test(trimmed)) {
    return 'javascript';
  }

  if (/^\s{0,3}(?:#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/m.test(trimmed)) {
    return 'markdown';
  }

  return 'text';
}

function resolveLanguage(className: string | undefined, value: string): SupportedCodeLanguage {
  const hint = className?.match(/language-([a-z0-9#+-]+)/i)?.[1]?.toLowerCase() ?? '';
  return LANGUAGE_ALIASES[hint] ?? detectCodeLanguage(value);
}

function highlightLine(value: string, language: SupportedCodeLanguage): string {
  if (!value) return '';

  switch (language) {
    case 'html':
      return highlightHtmlLine(value);
    case 'css':
      return highlightCssLine(value);
    case 'json':
      return highlightJsonLine(value);
    case 'markdown':
      return highlightMarkdownLine(value);
    case 'javascript':
    case 'typescript':
    case 'bash':
    case 'python':
    case 'php':
    case 'c':
    case 'cpp':
    case 'csharp':
    case 'go':
    case 'rust':
    case 'java':
    case 'kotlin':
    case 'swift':
    case 'ruby':
    case 'sql':
      return highlightGenericLine(value, language);
    case 'text':
    default:
      return escapeHtml(value);
  }
}

interface ChatCodeBlockProps {
  code: string;
  className?: string;
}

export function ChatCodeBlock({ code, className }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedCode = useMemo(
    () => code.replace(/\r\n/g, '\n').replace(/\n$/, ''),
    [code],
  );
  const language = useMemo(
    () => resolveLanguage(className, normalizedCode),
    [className, normalizedCode],
  );
  const highlightedLines = useMemo(
    () => normalizedCode.split('\n').map((line) => highlightLine(line, language)),
    [language, normalizedCode],
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(normalizedCode);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 text-slate-100 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.95)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100/90">
            {LANGUAGE_LABELS[language]}
          </span>
          <span className="truncate text-[11px] text-slate-400">
            {highlightedLines.length} lines
          </span>
        </div>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
            copied
              ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-100'
              : 'border-white/10 bg-white/5 text-slate-300 hover:border-sky-300/20 hover:bg-sky-400/10 hover:text-sky-100',
          )}
          onClick={() => void copyCode()}
          title={copied ? 'Скопировано' : 'Скопировать код'}
          aria-label={copied ? 'Код скопирован' : 'Скопировать код'}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <pre
          className="m-0 min-w-full bg-transparent py-3 text-[13px] leading-6"
          style={{ fontFamily: CODE_FONT_FAMILY }}
        >
          {highlightedLines.map((line, index) => (
            <div
              key={`${language}-${index}`}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start hover:bg-white/[0.03]"
            >
              <span className="select-none border-r border-white/8 px-3 text-right text-[11px] leading-6 text-slate-500">
                {index + 1}
              </span>
              <code
                className="block min-w-0 whitespace-pre px-4 text-slate-100"
                dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }}
              />
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

interface ChatInlineCodeProps {
  children: string;
}

export function ChatInlineCode({ children }: ChatInlineCodeProps) {
  return (
    <code
      className="rounded-md border border-slate-300/70 bg-slate-950/[0.045] px-1.5 py-0.5 text-[0.85em] font-medium text-slate-800"
      style={{ fontFamily: CODE_FONT_FAMILY }}
    >
      {children}
    </code>
  );
}
