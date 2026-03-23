import Markdown from 'react-markdown';
import { cn } from '../../lib/utils';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
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
      </div>
    </div>
  );
}
