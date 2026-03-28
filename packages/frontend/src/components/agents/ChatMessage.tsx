import { useState } from 'react';
import Markdown from 'react-markdown';
import { cn } from '../../lib/utils';

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
}

export function ChatMessage({ role, content, attachments = [] }: ChatMessageProps) {
  const isUser = role === 'user';
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState('');

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
              {content}
            </Markdown>
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
    </>
  );
}
