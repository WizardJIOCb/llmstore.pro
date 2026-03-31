import { useState } from 'react';
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
}

function stripDevReportEnvelope(content: string): string {
  return content.replace(/<dev-report>\s*[\s\S]*?(?:\s*<\/dev-report>|$)/gi, '').trim();
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

export function ChatMessage({
  role,
  content,
  attachments = [],
  toolTraces = [],
  codingReport = null,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState('');
  const [htmlPreview, setHtmlPreview] = useState<{ title: string; html: string } | null>(null);
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
                        onClick={() => setHtmlPreview({
                          title: codingReport.preview?.title || 'Agent preview',
                          html: codingReport.preview?.html || '',
                        })}
                      >
                        На весь экран
                      </Button>
                    </div>
                  </div>
                  <iframe
                    title={codingReport.preview.title || 'Agent preview'}
                    srcDoc={codingReport.preview.html}
                    sandbox="allow-scripts"
                    className="h-80 w-full rounded-md border bg-white"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([htmlPreview.html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank', 'noopener,noreferrer');
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}
                >
                  Открыть в новой вкладке
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setHtmlPreview(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <iframe
              title={htmlPreview.title}
              srcDoc={htmlPreview.html}
              sandbox="allow-scripts"
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
}
