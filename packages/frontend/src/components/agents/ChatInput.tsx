import { useState, useRef } from 'react';
import { Button } from '../ui/Button';

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void | Promise<unknown>;
  disabled?: boolean;
  placeholder?: string;
  allowAttachments?: boolean;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Введите сообщение...',
  allowAttachments = false,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || disabled) return;
    await onSend(trimmed, files);
    setValue('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSubmit();
    }
  };


  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, idx) => (
            <span key={`${file.name}-${idx}`} className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
              {file.name}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Удалить файл"
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-center">
        {allowAttachments && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".txt,.md,.csv,.json,.xml,image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const next = Array.from(e.target.files ?? []);
                if (next.length === 0) return;
                setFiles((prev) => [...prev, ...next].slice(0, 8));
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              size="md"
              aria-label="Прикрепить файл"
              title="Прикрепить файл"
              className="px-3 text-base font-semibold leading-none"
            >
              +
            </Button>
          </>
        )}

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="h-10 min-h-10 max-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(222.2deg_53.33%_74.69%_/_85%)] focus-visible:border-[hsl(222.2deg_53.33%_74.69%_/_85%)] disabled:opacity-50"
        />

        <Button onClick={handleSubmit} disabled={disabled || (!value.trim() && files.length === 0)} size="md">
          Отправить
        </Button>
      </div>
    </div>
  );
}



