import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '../ui/Button';

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void | Promise<unknown>;
  disabled?: boolean;
  placeholder?: string;
  allowAttachments?: boolean;
  prefill?: { text: string; token: number } | null;
}

const MAX_TEXTAREA_HEIGHT = 220;
const MIN_TEXTAREA_HEIGHT = 88;

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Введите сообщение...',
  allowAttachments = false,
  prefill = null,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${Math.max(nextHeight, MIN_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    if (!prefill) return;

    setValue(prefill.text);
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const caret = prefill.text.length;
      textarea.selectionStart = caret;
      textarea.selectionEnd = caret;
    });
  }, [prefill?.text, prefill?.token]);

  const resetComposer = () => {
    setValue('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || disabled) return;

    await onSend(trimmed, files);
    resetComposer();
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await handleSubmit();
    }
  };

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs text-foreground"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Удалить файл"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {allowAttachments && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".txt,.log,.md,.csv,.json,.xml,.html,.htm,.css,.scss,.sass,.less,.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.java,.kt,.go,.rs,.php,.rb,.sh,.bash,.zsh,.sql,.yml,.yaml,.toml,.ini,.conf,.env,.gitignore,.svg,image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files ?? []);
            if (nextFiles.length === 0) return;
            setFiles((prev) => [...prev, ...nextFiles].slice(0, 8));
          }}
        />
      )}

      <div className="rounded-2xl border border-border/80 bg-background shadow-sm transition-colors focus-within:border-[hsl(222.2deg_53.33%_74.69%_/_85%)]">
        <div className="px-4 pt-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            className="block min-h-[88px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-2">
          <div className="flex items-center gap-2">
            {allowAttachments && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                size="icon"
                aria-label="Прикрепить файл"
                title="Прикрепить файл"
                className="h-9 w-9 rounded-full border border-border/70 text-base font-semibold"
              >
                +
              </Button>
            )}
            <p className="hidden text-xs text-muted-foreground sm:block">
              `Enter` отправить, `Shift+Enter` новая строка
            </p>
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || (!value.trim() && files.length === 0)}
            size="md"
            className="rounded-full px-5"
          >
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
