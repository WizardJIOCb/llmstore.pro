import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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

function injectPreviewBridge(html: string, previewId: string): string {
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
  const emojiAssetBase = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/';

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
    if (!node.nodeValue || !emojiRegex.test(node.nodeValue)) return;
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
      img.src = emojiAssetBase + toEmojiCodePoint(value) + '.svg';
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
  className,
}: {
  html: string;
  title: string;
  previewPageUrl?: string | null;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewId] = useState(() => `preview-${Math.random().toString(36).slice(2, 10)}`);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const resolvedPreviewPageUrl = resolveBrowserUrl(previewPageUrl);
  const embeddedPreviewUrl = resolvedPreviewPageUrl
    ? `${resolvedPreviewPageUrl}${resolvedPreviewPageUrl.includes('?') ? '&' : '?'}previewId=${encodeURIComponent(previewId)}`
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
        <Button type="button" variant="outline" size="sm" onClick={() => sendCommand('back')} disabled={!canGoBack}>
          Back
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => sendCommand('forward')} disabled={!canGoForward}>
          Forward
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => sendCommand('reload')} disabled={!(embeddedPreviewUrl || objectUrl)}>
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
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState('');
  const [htmlPreview, setHtmlPreview] = useState<{ title: string; html: string } | null>(null);
  const absolutePreviewPageUrl = resolveBrowserUrl(previewPageUrl);
  const renderedContent = !isUser ? stripDevReportEnvelope(content) : content;

  return (
    <>
      <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[80%] rounded-lg px-4 py-3 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            isUser ? 'whitespace-pre-wrap' : '',
          )}
        >
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

              {codingReport.preview?.type === 'html' && codingReport.preview.html && (
                <SectionCard title="Preview">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {codingReport.preview.title || 'Agent preview'}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (absolutePreviewPageUrl) {
                            window.open(absolutePreviewPageUrl, '_blank', 'noopener,noreferrer');
                            return;
                          }

                          const blob = new Blob([codingReport.preview?.html || ''], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank', 'noopener,noreferrer');
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                      >
                        В новом окне
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHtmlPreview({
                          title: codingReport.preview?.title || 'Agent preview',
                          html: codingReport.preview?.html || '',
                        })}
                      >
                        На весь экран
                      </Button>
                    </div>
                  </div>
                  <HtmlPreviewBrowser
                    title={codingReport.preview.title || 'Agent preview'}
                    html={codingReport.preview.html}
                    previewPageUrl={absolutePreviewPageUrl}
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
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}
    </>
  );
}
