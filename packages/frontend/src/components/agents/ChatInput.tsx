import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { CircleHelp } from 'lucide-react';
import { Button } from '../ui/Button';

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void | Promise<unknown>;
  disabled?: boolean;
  placeholder?: string;
  allowAttachments?: boolean;
  prefill?: { text: string; token: number } | null;
  historyKey?: string | null;
  messageHistory?: string[];
  quickAction?: {
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
  } | null;
}

const DESKTOP_MAX_TEXTAREA_HEIGHT = 220;
const DESKTOP_MIN_TEXTAREA_HEIGHT = 88;
const MOBILE_MAX_TEXTAREA_HEIGHT = 72;
const MOBILE_MIN_TEXTAREA_HEIGHT = 24;
const MAX_ATTACHMENTS = 8;

function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    case 'image/png':
    default:
      return 'png';
  }
}

function normalizePastedImageFile(file: File, index: number): File {
  const safeName = file.name?.trim();
  if (safeName && safeName !== 'image.png' && safeName !== 'image.jpeg') return file;

  const extension = getExtensionFromMimeType(file.type || 'image/png');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([file], `pasted-image-${timestamp}-${index + 1}.${extension}`, {
    type: file.type || `image/${extension}`,
    lastModified: file.lastModified || Date.now(),
  });
}

function extractClipboardImageFiles(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const items = Array.from(event.clipboardData?.items ?? []);
  const itemFiles = items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (itemFiles.length > 0) {
    return itemFiles.map(normalizePastedImageFile);
  }

  return Array.from(event.clipboardData?.files ?? [])
    .filter((file) => file.type.startsWith('image/'))
    .map(normalizePastedImageFile);
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Введите сообщение...',
  allowAttachments = false,
  prefill = null,
  historyKey = null,
  messageHistory = [],
  quickAction = null,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftBeforeHistoryRef = useRef('');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const minHeight = isMobile ? MOBILE_MIN_TEXTAREA_HEIGHT : DESKTOP_MIN_TEXTAREA_HEIGHT;
    const maxHeight = isMobile ? MOBILE_MAX_TEXTAREA_HEIGHT : DESKTOP_MAX_TEXTAREA_HEIGHT;

    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${Math.max(nextHeight, minHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [isMobile, value]);

  useEffect(() => {
    if (!prefill) return;

    setValue(prefill.text);
    setHistoryCursor(null);
    draftBeforeHistoryRef.current = '';
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

  useEffect(() => {
    setHistoryCursor(null);
    draftBeforeHistoryRef.current = '';
  }, [historyKey]);

  const resetComposer = () => {
    setValue('');
    setHistoryCursor(null);
    draftBeforeHistoryRef.current = '';
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const focusComposer = () => {
    const focus = () => textareaRef.current?.focus();
    requestAnimationFrame(focus);
    window.setTimeout(focus, 0);
  };

  const placeCaretAtEnd = () => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const caret = textarea.value.length;
      textarea.selectionStart = caret;
      textarea.selectionEnd = caret;
    });
  };

  const navigateMessageHistory = (direction: 'previous' | 'next') => {
    const entries = messageHistory.map((item) => item.trim()).filter(Boolean);
    if (entries.length === 0) return;

    if (direction === 'previous') {
      const nextCursor = historyCursor === null ? entries.length - 1 : Math.max(0, historyCursor - 1);
      if (historyCursor === null) {
        draftBeforeHistoryRef.current = value;
      }
      setHistoryCursor(nextCursor);
      setValue(entries[nextCursor] ?? '');
      placeCaretAtEnd();
      return;
    }

    if (historyCursor === null) return;
    const nextCursor = historyCursor + 1;
    if (nextCursor >= entries.length) {
      setHistoryCursor(null);
      setValue(draftBeforeHistoryRef.current);
      draftBeforeHistoryRef.current = '';
      placeCaretAtEnd();
      return;
    }

    setHistoryCursor(nextCursor);
    setValue(entries[nextCursor] ?? '');
    placeCaretAtEnd();
  };

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || disabled) return;

    await onSend(trimmed, files);
    resetComposer();
    focusComposer();
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      navigateMessageHistory(event.key === 'ArrowUp' ? 'previous' : 'next');
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await handleSubmit();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowAttachments || disabled) return;

    const pastedImages = extractClipboardImageFiles(event);
    if (pastedImages.length === 0) return;

    event.preventDefault();
    setFiles((prev) => [...prev, ...pastedImages].slice(0, MAX_ATTACHMENTS));
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
            setFiles((prev) => [...prev, ...nextFiles].slice(0, MAX_ATTACHMENTS));
          }}
        />
      )}

      <div className="rounded-2xl border border-border/80 bg-background shadow-sm transition-colors focus-within:border-[hsl(222.2deg_53.33%_74.69%_/_85%)]">
        <div className="px-4 pt-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setHistoryCursor(null);
              draftBeforeHistoryRef.current = '';
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={isMobile ? 1 : 3}
            className="block min-h-6 w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-50 md:min-h-[88px]"
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
            {quickAction && (
              <Button
                type="button"
                variant="ghost"
                onClick={quickAction.onClick}
                disabled={disabled || quickAction.disabled}
                size="icon"
                aria-label={quickAction.label}
                title={quickAction.label}
                className="h-9 w-9 rounded-full border border-border/70 text-base font-semibold"
              >
                <CircleHelp className={`h-4 w-4 ${quickAction.active ? 'text-primary' : ''}`} />
              </Button>
            )}
            <p className="hidden text-xs text-muted-foreground sm:block">
              `Enter` отправить, `Shift+Enter` новая строка, `Ctrl+↑/↓` история
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
