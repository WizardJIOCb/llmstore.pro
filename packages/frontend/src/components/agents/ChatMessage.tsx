import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { CodingReport, ToolTrace } from '../../lib/api/agents';
import { cn } from '../../lib/utils';
import { ToolTracePanel } from './ToolTracePanel';
import { Button } from '../ui/Button';

interface Attachment {
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  url: string;
  text_preview?: string;
}

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  attachments?: Attachment[];
  toolTraces?: ToolTrace[];
  codingReport?: CodingReport | null;
  previewPageUrl?: string | null;
  canEditPreview?: boolean;
  onSavePreview?: (payload: { title?: string | null; html: string }) => Promise<void>;
  canDeleteMessage?: boolean;
  onDeleteMessage?: () => Promise<void>;
}

function stripDevReportEnvelope(content: string): string {
  return content.replace(/<dev-report>\s*[\s\S]*?(?:\s*<\/dev-report>|$)/gi, '').trim();
}

function resolveBrowserUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function withPreviewId(url: string, previewId: string): string {
  try {
    const nextUrl = new URL(url, window.location.origin);
    nextUrl.searchParams.set('previewId', previewId);
    return nextUrl.toString();
  } catch {
    return url;
  }
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function normalizeBlockText(value: string, indent: string): string {
  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return '';
  return lines.map((line) => `${indent}${line}`).join('\n');
}

function beautifyHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const root = doc.documentElement;
    const indentUnit = '  ';

    const formatNode = (node: Node, depth: number): string => {
      const indent = indentUnit.repeat(depth);
      const childIndent = indentUnit.repeat(depth + 1);

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return text ? `${indent}${text}` : '';
      }

      if (node.nodeType === Node.COMMENT_NODE) {
        const text = node.textContent?.trim() ?? '';
        return `${indent}<!--${text}-->`;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      const attrs = Array.from(element.attributes)
        .map((attr) => ` ${attr.name}="${attr.value}"`)
        .join('');
      const openTag = `${indent}<${tag}${attrs}>`;

      if (VOID_TAGS.has(tag)) {
        return openTag;
      }

      if (tag === 'script' || tag === 'style') {
        const raw = normalizeBlockText(element.textContent ?? '', childIndent);
        return raw
          ? `${openTag}\n${raw}\n${indent}</${tag}>`
          : `${openTag}</${tag}>`;
      }

      if (tag === 'pre' || tag === 'textarea') {
        const raw = (element.textContent ?? '').replace(/\r\n/g, '\n');
        return `${openTag}${raw}</${tag}>`;
      }

      const childLines = Array.from(element.childNodes)
        .map((child) => formatNode(child, depth + 1))
        .filter(Boolean);

      if (childLines.length === 0) {
        return `${openTag}</${tag}>`;
      }

      if (
        childLines.length === 1
        && element.childNodes.length === 1
        && element.firstChild?.nodeType === Node.TEXT_NODE
      ) {
        return `${openTag}${element.textContent?.replace(/\s+/g, ' ').trim() ?? ''}</${tag}>`;
      }

      return `${openTag}\n${childLines.join('\n')}\n${indent}</${tag}>`;
    };

    return `<!DOCTYPE html>\n${formatNode(root, 0)}`.trim();
  } catch {
    return html;
  }
}

function getStringHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function highlightHtmlAttributes(attrs: string): string {
  return attrs.replace(
    /(\s+)([^\s=/>]+)(\s*=\s*(?:&quot;.*?&quot;|&#39;.*?&#39;|[^\s"'=<>`]+))?/g,
    (_match, spacing: string, name: string, valueChunk?: string) => {
      if (!valueChunk) {
        return `${spacing}<span class="text-amber-600">${name}</span>`;
      }

      const eqMatch = valueChunk.match(/^(\s*=\s*)([\s\S]+)$/);
      if (!eqMatch) {
        return `${spacing}<span class="text-amber-600">${name}</span>${valueChunk}`;
      }

      return `${spacing}<span class="text-amber-600">${name}</span><span class="text-slate-500">${eqMatch[1]}</span><span class="text-emerald-700">${eqMatch[2]}</span>`;
    },
  );
}

function highlightHtmlCode(value: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => `___LLMSTORE_HTML_TOKEN_${placeholders.push(html) - 1}___`;
  const escapeHtml = (source: string) => source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let escaped = escapeHtml(value);

  escaped = escaped.replace(
    /&lt;!--[\s\S]*?--&gt;/g,
    (match) => stash(`<span class="text-slate-400">${match}</span>`),
  );

  escaped = escaped.replace(
    /&lt;!DOCTYPE[\s\S]*?&gt;/gi,
    (match) => stash(`<span class="text-fuchsia-600">${match}</span>`),
  );

  escaped = escaped.replace(
    /(&lt;\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
    (_match, open: string, tagName: string, attrs: string, close: string) => (
      `<span class="text-slate-500">${open}</span>`
      + `<span class="text-sky-700">${tagName}</span>`
      + highlightHtmlAttributes(attrs)
      + `<span class="text-slate-500">${close}</span>`
    ),
  );

  return escaped.replace(
    /___LLMSTORE_HTML_TOKEN_(\d+)___/g,
    (_match, index: string) => placeholders[Number(index)] ?? '',
  );
}

function injectPreviewBridge(html: string, previewId: string): string {
  const emojiAssetVersion = '20260401b';
  const bridge = `
<style id="llmstore-preview-emoji-bridge">
.llmstore-emoji-fallback {
  display: inline-block !important;
  width: 1em !important;
  height: 1em !important;
  vertical-align: -0.12em !important;
  object-fit: contain !important;
}
</style>
<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  const emojiRegex = /\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?/gu;
  const previewOrigin = typeof window.__LLMSTORE_PREVIEW_ORIGIN__ === 'string' && window.__LLMSTORE_PREVIEW_ORIGIN__
    ? window.__LLMSTORE_PREVIEW_ORIGIN__
    : window.location.origin;
  const emojiAssetBase = new URL('/api/emoji/', previewOrigin).toString();

  const shouldSkipEmojiWrap = (node) => {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script, style, textarea, input, option');
  };

  const toEmojiCodePoint = (value) => Array.from(value)
    .map((symbol) => symbol.codePointAt(0)?.toString(16))
    .filter((code) => code && code !== 'fe0f')
    .join('-');

  const wrapEmojiTextNode = (node) => {
    if (!node.nodeValue) return;
    emojiRegex.lastIndex = 0;
    if (!emojiRegex.test(node.nodeValue)) return;
    emojiRegex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    const matches = node.nodeValue.matchAll(emojiRegex);

    for (const match of matches) {
      const value = match[0];
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, index)));
      }

      const img = document.createElement('img');
      img.className = 'llmstore-emoji-fallback';
      img.alt = value;
      img.src = emojiAssetBase + toEmojiCodePoint(value) + '.svg?v=${emojiAssetVersion}';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        const span = document.createElement('span');
        span.textContent = value;
        img.replaceWith(span);
      };
      fragment.appendChild(img);

      lastIndex = index + value.length;
    }

    if (lastIndex < node.nodeValue.length) {
      fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  };

  const applyEmojiFallback = (root = document.body) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      if (!shouldSkipEmojiWrap(current)) textNodes.push(current);
    }
    for (const textNode of textNodes) {
      wrapEmojiTextNode(textNode);
    }
  };

  const sendState = () => {
    try {
      window.parent.postMessage({
        type: 'llmstore-preview-state',
        previewId,
        href: window.location.href,
        title: document.title || ''
      }, '*');
    } catch {}
  };

  const wrapHistory = (method) => {
    const original = history[method];
    if (typeof original !== 'function') return;
    history[method] = function(...args) {
      const result = original.apply(this, args);
      setTimeout(sendState, 0);
      return result;
    };
  };

  wrapHistory('pushState');
  wrapHistory('replaceState');
  window.addEventListener('load', () => {
    applyEmojiFallback();
    sendState();
  });
  window.addEventListener('DOMContentLoaded', () => applyEmojiFallback());
  window.addEventListener('hashchange', sendState);
  window.addEventListener('popstate', sendState);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) applyEmojiFallback(node);
        if (node instanceof Text && !shouldSkipEmojiWrap(node)) wrapEmojiTextNode(node);
      }
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'llmstore-preview-command' || data.previewId !== previewId) return;
    if (data.command === 'reload') window.location.reload();
    if (data.command === 'back') history.back();
    if (data.command === 'forward') history.forward();
  });
  applyEmojiFallback();
  sendState();
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridge}</body>`);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${bridge}`);
  }

  return `${bridge}${html}`;
}

function HtmlPreviewBrowser({
  html,
  title,
  previewPageUrl,
  revisionKey,
  className,
}: {
  html: string;
  title: string;
  previewPageUrl?: string | null;
  revisionKey?: string;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewId] = useState(() => `preview-${Math.random().toString(36).slice(2, 10)}`);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const resolvedPreviewPageUrl = resolveBrowserUrl(previewPageUrl);
  const embeddedPreviewUrl = resolvedPreviewPageUrl
    ? `${resolvedPreviewPageUrl}${resolvedPreviewPageUrl.includes('?') ? '&' : '?'}previewId=${encodeURIComponent(previewId)}${revisionKey ? `&rev=${encodeURIComponent(revisionKey)}` : ''}`
    : null;
  const [currentHref, setCurrentHref] = useState(resolvedPreviewPageUrl || 'about:blank');
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (resolvedPreviewPageUrl) {
      setObjectUrl(null);
      setCurrentHref(resolvedPreviewPageUrl);
      setHistoryEntries([resolvedPreviewPageUrl]);
      setHistoryIndex(0);
      return;
    }

    const blob = new Blob([injectPreviewBridge(html, previewId)], { type: 'text/html' });
    const nextUrl = URL.createObjectURL(blob);
    setObjectUrl(nextUrl);
    setCurrentHref(nextUrl);
    setHistoryEntries([nextUrl]);
    setHistoryIndex(0);

    return () => URL.revokeObjectURL(nextUrl);
  }, [html, previewId, resolvedPreviewPageUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        previewId?: string;
        href?: string;
        title?: string;
      };
      if (!data || data.type !== 'llmstore-preview-state' || data.previewId !== previewId) return;

      const nextHref = typeof data.href === 'string' && data.href.length > 0
        ? data.href
        : (resolvedPreviewPageUrl ?? objectUrl ?? 'about:blank');

      setCurrentHref(nextHref);
      setHistoryEntries((prev) => {
        if (prev.length === 0) {
          setHistoryIndex(0);
          return [nextHref];
        }

        if (prev[historyIndex] === nextHref) return prev;

        const existingIndex = prev.lastIndexOf(nextHref);
        if (existingIndex >= 0) {
          setHistoryIndex(existingIndex);
          return prev;
        }

        const nextHistory = [...prev.slice(0, historyIndex + 1), nextHref];
        setHistoryIndex(nextHistory.length - 1);
        return nextHistory.slice(-24);
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [historyIndex, objectUrl, previewId, resolvedPreviewPageUrl]);

  const sendCommand = (command: 'reload' | 'back' | 'forward') => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'llmstore-preview-command',
      previewId,
      command,
    }, '*');
  };

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < historyEntries.length - 1;
  const shareableHref = currentHref
    && !currentHref.startsWith('about:')
    && !currentHref.startsWith('blob:')
    ? currentHref
    : (resolvedPreviewPageUrl ?? currentHref);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-background/80 p-2">
        <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => sendCommand('back')} disabled={!canGoBack}>
          Back
        </Button>
        <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => sendCommand('forward')} disabled={!canGoForward}>
          Forward
        </Button>
        <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => sendCommand('reload')} disabled={!(embeddedPreviewUrl || objectUrl)}>
          Reload
        </Button>
        <div className="min-w-0 flex-1 rounded-md border border-border/70 bg-muted/50 px-3 py-1.5">
          <p className="truncate font-mono text-xs text-foreground" title={shareableHref || 'about:blank'}>
            {shareableHref || 'about:blank'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={async () => {
            await navigator.clipboard.writeText(shareableHref || 'about:blank');
          }}
          disabled={!shareableHref}
        >
          Copy Link
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-white">
        {objectUrl && (
          <iframe
            ref={iframeRef}
            title={title}
            src={embeddedPreviewUrl ?? objectUrl}
            sandbox="allow-scripts"
            className="h-full w-full bg-white"
          />
        )}

        {!objectUrl && embeddedPreviewUrl && (
          <iframe
            ref={iframeRef}
            title={title}
            src={embeddedPreviewUrl}
            sandbox="allow-scripts"
            className="h-full w-full bg-white"
          />
        )}
      </div>
    </div>
  );
}

export function ChatMessage({
  role,
  content,
  attachments = [],
  toolTraces = [],
  codingReport = null,
  previewPageUrl = null,
  canEditPreview = false,
  onSavePreview,
  canDeleteMessage = false,
  onDeleteMessage,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState('');
  const [htmlPreview, setHtmlPreview] = useState<{ title: string; html: string } | null>(null);
  const [previewEditor, setPreviewEditor] = useState<{ title: string; html: string } | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorHighlightRef = useRef<HTMLPreElement | null>(null);
  const editorHistoryRef = useRef<string[]>([]);
  const editorHistoryIndexRef = useRef(-1);
  const editorStatusTimeoutRef = useRef<number | null>(null);
  const isEditorOpen = Boolean(previewEditor);
  const absolutePreviewPageUrl = resolveBrowserUrl(previewPageUrl);
  const renderedContent = !isUser ? stripDevReportEnvelope(content) : content;
  const propHtmlPreview = codingReport?.preview?.type === 'html' && codingReport.preview.html
    ? {
      title: codingReport.preview.title || 'Agent preview',
      html: codingReport.preview.html,
    }
    : null;
  const [previewOverride, setPreviewOverride] = useState<{ title: string; html: string } | null>(propHtmlPreview);
  const resolvedHtmlPreview = previewOverride ?? propHtmlPreview;
  const highlightedEditorHtml = useMemo(
    () => (previewEditor ? highlightHtmlCode(previewEditor.html) : ''),
    [previewEditor],
  );
  const resolvedPreviewRevision = resolvedHtmlPreview ? getStringHash(resolvedHtmlPreview.html) : undefined;

  useEffect(() => {
    if (!isEditorOpen || !previewEditor) return;
    editorHistoryRef.current = [previewEditor.html];
    editorHistoryIndexRef.current = 0;
    setEditorStatus(null);
    editorTextareaRef.current?.focus();
  }, [isEditorOpen]);

  useEffect(() => () => {
    if (editorStatusTimeoutRef.current) {
      window.clearTimeout(editorStatusTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    setPreviewOverride(propHtmlPreview);
  }, [propHtmlPreview?.title, propHtmlPreview?.html]);

  const setEditorTransientStatus = (message: string | null) => {
    if (editorStatusTimeoutRef.current) {
      window.clearTimeout(editorStatusTimeoutRef.current);
      editorStatusTimeoutRef.current = null;
    }

    setEditorStatus(message);

    if (message) {
      editorStatusTimeoutRef.current = window.setTimeout(() => {
        setEditorStatus(null);
        editorStatusTimeoutRef.current = null;
      }, 2200);
    }
  };

  const pushEditorHistory = (nextHtml: string) => {
    const currentHistory = editorHistoryRef.current;
    const currentIndex = editorHistoryIndexRef.current;

    if (currentHistory[currentIndex] === nextHtml) return;

    const nextHistory = [...currentHistory.slice(0, currentIndex + 1), nextHtml].slice(-200);
    editorHistoryRef.current = nextHistory;
    editorHistoryIndexRef.current = nextHistory.length - 1;
  };

  const updatePreviewEditorHtml = (
    nextHtml: string,
    options?: {
      selectionStart?: number;
      selectionEnd?: number;
      pushHistory?: boolean;
    },
  ) => {
    setPreviewEditor((prev) => (prev ? { ...prev, html: nextHtml } : prev));
    setEditorError(null);
    setEditorStatus(null);

    if (options?.pushHistory !== false) {
      pushEditorHistory(nextHtml);
    }

    if (typeof options?.selectionStart === 'number' && typeof options.selectionEnd === 'number') {
      requestAnimationFrame(() => {
        if (!editorTextareaRef.current) return;
        editorTextareaRef.current.selectionStart = options.selectionStart!;
        editorTextareaRef.current.selectionEnd = options.selectionEnd!;
      });
    }
  };

  const stepEditorHistory = (direction: 'undo' | 'redo') => {
    if (!previewEditor) return;

    const history = editorHistoryRef.current;
    const delta = direction === 'undo' ? -1 : 1;
    const nextIndex = Math.min(Math.max(editorHistoryIndexRef.current + delta, 0), history.length - 1);

    if (nextIndex === editorHistoryIndexRef.current) return;

    editorHistoryIndexRef.current = nextIndex;
    const nextHtml = history[nextIndex] ?? previewEditor.html;
    setPreviewEditor((prev) => (prev ? { ...prev, html: nextHtml } : prev));
    setEditorError(null);
    setEditorTransientStatus(direction === 'undo' ? 'Последнее изменение отменено' : 'Изменение возвращено');

    requestAnimationFrame(() => {
      if (!editorTextareaRef.current) return;
      const caret = nextHtml.length;
      editorTextareaRef.current.selectionStart = caret;
      editorTextareaRef.current.selectionEnd = caret;
    });
  };

  const syncEditorScroll = () => {
    if (!editorTextareaRef.current || !editorHighlightRef.current) return;
    editorHighlightRef.current.scrollTop = editorTextareaRef.current.scrollTop;
    editorHighlightRef.current.scrollLeft = editorTextareaRef.current.scrollLeft;
  };

  const savePreviewEditor = async () => {
    if (!onSavePreview || !previewEditor) return;
    const nextPreview = {
      title: previewEditor.title || 'Agent preview',
      html: previewEditor.html,
    };
    setEditorSaving(true);
    setEditorError(null);
    try {
      await onSavePreview(nextPreview);
      setPreviewOverride(nextPreview);
      setHtmlPreview((prev) => (prev ? nextPreview : prev));
      setEditorTransientStatus('Preview сохранён');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить preview';
      setEditorError(message);
    } finally {
      setEditorSaving(false);
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault();
      void savePreviewEditor();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      stepEditorHistory(event.shiftKey ? 'redo' : 'undo');
      return;
    }

    if (!previewEditor) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = previewEditor.html;

      if (!event.shiftKey && start === end) {
        const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
        updatePreviewEditorHtml(nextValue, {
          selectionStart: start + 2,
          selectionEnd: start + 2,
        });
        return;
      }

      const blockStart = value.lastIndexOf('\n', Math.max(start - 1, 0)) + 1;
      const nextLineBreak = value.indexOf('\n', end);
      const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
      const block = value.slice(blockStart, blockEnd);
      const lines = block.split('\n');

      if (event.shiftKey) {
        let firstLineRemoved = 0;
        let totalRemoved = 0;

        const nextBlock = lines.map((line, index) => {
          let removed = 0;
          if (line.startsWith('  ')) {
            removed = 2;
          } else if (line.startsWith('\t')) {
            removed = 1;
          } else if (line.startsWith(' ')) {
            removed = 1;
          }

          if (index === 0) {
            firstLineRemoved = removed;
          }
          totalRemoved += removed;

          return removed > 0 ? line.slice(removed) : line;
        }).join('\n');

        const nextValue = `${value.slice(0, blockStart)}${nextBlock}${value.slice(blockEnd)}`;
        updatePreviewEditorHtml(nextValue, {
          selectionStart: Math.max(blockStart, start - firstLineRemoved),
          selectionEnd: Math.max(blockStart, end - totalRemoved),
        });
        return;
      }

      const nextBlock = lines.map((line) => `  ${line}`).join('\n');
      const nextValue = `${value.slice(0, blockStart)}${nextBlock}${value.slice(blockEnd)}`;
      updatePreviewEditorHtml(nextValue, {
        selectionStart: start + 2,
        selectionEnd: end + (2 * lines.length),
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentLineStart = previewEditor.html.lastIndexOf('\n', start - 1) + 1;
      const currentLine = previewEditor.html.slice(currentLineStart, start);
      const indent = currentLine.match(/^\s*/)?.[0] ?? '';
      const insertion = `\n${indent}`;
      const nextValue = `${previewEditor.html.slice(0, start)}${insertion}${previewEditor.html.slice(end)}`;
      const nextCaret = start + insertion.length;
      updatePreviewEditorHtml(nextValue, {
        selectionStart: nextCaret,
        selectionEnd: nextCaret,
      });
    }
  };

  const deleteMessage = async () => {
    if (!onDeleteMessage || deletingMessage) return;
    const confirmed = window.confirm('Удалить это сообщение из чата?');
    if (!confirmed) return;

    setDeletingMessage(true);
    setMessageActionError(null);
    try {
      await onDeleteMessage();
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Не удалось удалить сообщение');
    } finally {
      setDeletingMessage(false);
    }
  };

  return (
    <>
      <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            isUser ? 'max-w-[80%]' : 'w-full',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            isUser ? 'whitespace-pre-wrap' : '',
          )}
        >
          {canDeleteMessage && onDeleteMessage && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => void deleteMessage()}
                disabled={deletingMessage}
              >
                {deletingMessage ? 'Удаляю...' : 'Удалить'}
              </button>
            </div>
          )}
          {messageActionError && (
            <p className="mb-2 text-xs text-destructive">{messageActionError}</p>
          )}
          {isUser ? (
            content
          ) : (
            <Markdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
                    {children}
                  </a>
                ),
                ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-1">{children}</ol>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-1">{children}</ul>,
                p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children }) => <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs">{children}</code>,
                pre: ({ children }) => <pre className="bg-black/10 dark:bg-white/10 rounded p-3 my-2 overflow-x-auto text-xs">{children}</pre>,
              }}
            >
              {renderedContent}
            </Markdown>
          )}

          {!isUser && codingReport && (
            <div className="mt-3 space-y-3">
              {codingReport.summary && (
                <SectionCard title="Итог">
                  <p className="whitespace-pre-wrap text-sm">{codingReport.summary}</p>
                </SectionCard>
              )}

              {codingReport.worklog && codingReport.worklog.length > 0 && (
                <SectionCard title="Ход разработки">
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    {codingReport.worklog.map((item, index) => (
                      <li key={`${item}-${index}`} className="whitespace-pre-wrap">
                        {item}
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              )}

              {codingReport.changed_files && codingReport.changed_files.length > 0 && (
                <SectionCard title="Измененные файлы">
                  <div className="space-y-2">
                    {codingReport.changed_files.map((file) => (
                      <div key={`${file.path}-${file.summary ?? ''}`} className="rounded-md border border-border/60 bg-muted/30 px-2 py-2">
                        <p className="font-mono text-xs">{file.path}</p>
                        {file.summary && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                            {file.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {codingReport.how_to_run && codingReport.how_to_run.length > 0 && (
                <SectionCard title="Как запустить">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {codingReport.how_to_run.map((item, index) => (
                      <li key={`${item}-${index}`} className="whitespace-pre-wrap">
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {codingReport.notes && codingReport.notes.length > 0 && (
                <SectionCard title="Заметки">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {codingReport.notes.map((item, index) => (
                      <li key={`${item}-${index}`} className="whitespace-pre-wrap">
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              {codingReport.preview?.type === 'url' && codingReport.preview.url && (
                <SectionCard title="Preview">
                  <a
                    href={codingReport.preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    {codingReport.preview.title || codingReport.preview.url}
                  </a>
                </SectionCard>
              )}

              {resolvedHtmlPreview && (
                <SectionCard title="Preview">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {resolvedHtmlPreview.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => {
                          if (absolutePreviewPageUrl) {
                            window.open(
                              withPreviewId(
                                absolutePreviewPageUrl,
                                `open-window-${Math.random().toString(36).slice(2, 10)}`,
                              ),
                              '_blank',
                              'noopener,noreferrer',
                            );
                            return;
                          }

                          const blob = new Blob([resolvedHtmlPreview.html || ''], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank', 'noopener,noreferrer');
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                      >
                        В новом окне
                      </Button>
                      {canEditPreview && onSavePreview && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap"
                          onClick={() => {
                            setEditorError(null);
                            setPreviewEditor({
                              title: resolvedHtmlPreview.title,
                              html: resolvedHtmlPreview.html,
                            });
                          }}
                        >
                          Редактор
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => setHtmlPreview({
                          title: resolvedHtmlPreview.title,
                          html: resolvedHtmlPreview.html,
                        })}
                      >
                        На весь экран
                      </Button>
                    </div>
                  </div>
                  <HtmlPreviewBrowser
                    title={resolvedHtmlPreview.title}
                    html={resolvedHtmlPreview.html}
                    previewPageUrl={absolutePreviewPageUrl}
                    revisionKey={resolvedPreviewRevision}
                    className="h-80 w-full"
                  />
                </SectionCard>
              )}
            </div>
          )}

          {!isUser && toolTraces.length > 0 && (
            <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-3">
              <ToolTracePanel traces={toolTraces} />
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {attachments.map((file) => (
                <div
                  key={file.filename}
                  className={cn('rounded border px-2 py-1.5 text-xs', isUser ? 'border-primary-foreground/30' : 'border-border')}
                >
                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {file.original_name || file.filename}
                  </a>
                  {file.kind === 'image' && (
                    <button
                      type="button"
                      className="mt-2 block w-full"
                      onClick={() => {
                        setPreviewUrl(file.url);
                        setPreviewAlt(file.original_name || file.filename);
                      }}
                    >
                      <img
                        src={file.url}
                        alt={file.original_name || file.filename}
                        className="max-h-48 w-full cursor-zoom-in rounded object-contain"
                      />
                    </button>
                  )}
                  {file.kind === 'text' && file.text_preview && (
                    <p className="mt-2 whitespace-pre-wrap opacity-90">{file.text_preview}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-h-[95vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -right-3 -top-3 z-10 h-8 w-8 rounded-full bg-white text-black shadow hover:bg-neutral-200"
              onClick={() => setPreviewUrl(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
            <img src={previewUrl} alt={previewAlt} className="max-h-[95vh] max-w-[95vw] rounded object-contain" />
          </div>
        </div>
      )}

      {htmlPreview && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-3"
          onClick={() => setHtmlPreview(null)}
        >
          <div
            className="flex h-[94vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{htmlPreview.title}</p>
                <p className="text-xs text-slate-500">Standalone preview</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setHtmlPreview(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <HtmlPreviewBrowser
              title={htmlPreview.title}
              html={htmlPreview.html}
              previewPageUrl={absolutePreviewPageUrl}
              revisionKey={getStringHash(htmlPreview.html)}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}

      {previewEditor && (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/85 p-3"
          onClick={() => !editorSaving && setPreviewEditor(null)}
        >
          <div
            className="flex h-[94vh] w-[98vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">Редактор preview</p>
                <p className="text-xs text-slate-500">Файл: index.html</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewEditor(null)} disabled={editorSaving}>
                  Закрыть
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={editorSaving}
                  onClick={() => {
                    if (!previewEditor) return;
                    updatePreviewEditorHtml(beautifyHtml(previewEditor.html));
                    setEditorTransientStatus('HTML аккуратно отформатирован');
                  }}
                >
                  Beautify
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={editorSaving || !onSavePreview}
                  onClick={() => { void savePreviewEditor(); }}
                >
                  {editorSaving ? 'Сохраняю...' : 'Сохранить'}
                </Button>
              </div>
            </div>

            {editorError && (
              <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {editorError}
              </div>
            )}

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-h-0 border-b lg:border-b-0 lg:border-r">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b px-4 py-3">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Заголовок preview
                    </label>
                    <input
                      value={previewEditor.title}
                      onChange={(e) => {
                        setPreviewEditor((prev) => (prev ? { ...prev, title: e.target.value } : prev));
                        setEditorStatus(null);
                      }}
                      className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      placeholder="Название preview"
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium">
                        index.html
                      </div>
                      <p className="text-xs text-muted-foreground">HTML редактор</p>
                    </div>
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-background">
                      <pre
                        ref={editorHighlightRef}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 overflow-auto px-3 py-2 font-mono text-xs leading-5 text-slate-900"
                      >
                        <code
                          className="block min-h-full whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: `${highlightedEditorHtml || '<br />'}\n` }}
                        />
                      </pre>
                      <textarea
                        ref={editorTextareaRef}
                        value={previewEditor.html}
                        onChange={(e) => updatePreviewEditorHtml(e.target.value)}
                        onKeyDown={handleEditorKeyDown}
                        onScroll={syncEditorScroll}
                        className={cn(
                          'absolute inset-0 min-h-0 h-full w-full resize-none bg-transparent px-3 py-2',
                          'font-mono text-xs leading-5 text-transparent caret-slate-900',
                          'selection:bg-primary/20 outline-none ring-0 focus:outline-none focus:ring-0',
                        )}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 bg-slate-50">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b bg-white px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Предпросмотр
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 p-4">
                    <HtmlPreviewBrowser
                      title={previewEditor.title || 'Agent preview'}
                      html={previewEditor.html}
                      revisionKey={getStringHash(previewEditor.html)}
                      className="h-full w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-4 py-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <span><span className="font-medium text-foreground">Tab</span> отступ</span>
                <span><span className="font-medium text-foreground">Shift+Tab</span> убрать отступ</span>
                <span><span className="font-medium text-foreground">Ctrl+Z</span> отмена</span>
                <span><span className="font-medium text-foreground">Ctrl+S</span> сохранить</span>
                <span><span className="font-medium text-foreground">Beautify</span> форматировать код</span>
              </div>
              <span className={cn('min-h-[1rem]', editorStatus ? 'text-foreground' : 'text-transparent')}>
                {editorStatus || 'status'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
