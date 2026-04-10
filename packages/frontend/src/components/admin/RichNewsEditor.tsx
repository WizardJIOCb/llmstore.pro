import { useEffect, useMemo, useRef, useState } from 'react';
import { RichNewsContent } from '../news/RichNewsContent';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { normalizeNewsEditorValue } from '../../lib/newsRichText';
import { useUploadNewsImages } from '../../hooks/useNews';
import { resolveArticleVideoEmbed } from '../articles/videoEmbeds';

interface RichNewsEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

type MediaDialogMode = 'image' | 'video' | null;

const FONT_OPTIONS = [
  { value: '', label: 'Шрифт по умолчанию' },
  { value: 'Arial', label: 'Sans' },
  { value: 'Georgia', label: 'Serif' },
  { value: 'Courier New', label: 'Mono' },
];

const DEFAULT_TEXT_COLOR = '#0f172a';

function isEditorVisuallyEmpty(html: string): boolean {
  return html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<div>\s*<\/div>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim().length === 0;
}

export function RichNewsEditor({ value, onChange, placeholder = 'Текст новости...' }: RichNewsEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<Range | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [fontFamily, setFontFamily] = useState('');
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<MediaDialogMode>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [mediaError, setMediaError] = useState('');
  const uploadImageMutation = useUploadNewsImages();

  const editorHtml = useMemo(() => normalizeNewsEditorValue(value), [value]);
  const isEmpty = isEditorVisuallyEmpty(editorHtml);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== editorHtml) {
      editorRef.current.innerHTML = editorHtml;
    }
  }, [editorHtml]);

  const syncContent = () => {
    onChange(editorRef.current?.innerHTML ?? '');
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) return;
    selectionRef.current = range.cloneRange();
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range) return;

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, commandValue);
    saveSelection();
    syncContent();
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    saveSelection();
    syncContent();
  };

  const applyBlock = (tag: 'P' | 'H2' | 'H3' | 'BLOCKQUOTE') => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('formatBlock', false, tag);
    saveSelection();
    syncContent();
  };

  const applyFontFamily = (nextValue: string) => {
    setFontFamily(nextValue);
    if (!nextValue) return;
    runCommand('fontName', nextValue);
  };

  const applyTextColor = (nextValue: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, nextValue);
    setTextColor(nextValue);
    saveSelection();
    syncContent();
  };

  const insertLink = () => {
    const href = window.prompt('Введите URL ссылки', 'https://');
    if (!href) return;
    runCommand('createLink', href);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setImageUrl('');
    setVideoUrl('');
    setMediaError('');
  };

  const insertImageByUrl = () => {
    const normalizedUrl = imageUrl.trim();
    if (!normalizedUrl) {
      setMediaError('Укажите ссылку на изображение.');
      return;
    }

    insertHtml(`<img src="${normalizedUrl.replace(/"/g, '&quot;')}" alt="">`);
    closeDialog();
  };

  const handleInlineImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setMediaError('');

    try {
      const [uploaded] = await uploadImageMutation.mutateAsync([file]);
      if (!uploaded) {
        setMediaError('Не удалось загрузить изображение.');
        return;
      }
      insertHtml(`<img src="${uploaded.url.replace(/"/g, '&quot;')}" alt="${(uploaded.original_name ?? '').replace(/"/g, '&quot;')}">`);
      closeDialog();
    } catch (error: any) {
      setMediaError(error?.response?.data?.error?.message || 'Не удалось загрузить картинку на сервер.');
    }
  };

  const insertVideo = () => {
    const resolved = resolveArticleVideoEmbed(videoUrl.trim());
    if (!resolved) {
      setMediaError('Поддерживаются только YouTube, Rutube и VK Video.');
      return;
    }

    insertHtml(
      `<div class="article-video-embed" data-article-video="true"><iframe src="${resolved.embedUrl.replace(/"/g, '&quot;')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="true" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`,
    );
    closeDialog();
  };

  const toolbarMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 p-3">
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => applyBlock('P')}>Текст</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => applyBlock('H2')}>H2</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => applyBlock('H3')}>H3</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('bold')}>Жирный</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('italic')}>Курсив</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('underline')}>Подчеркнуть</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => insertLink()}>Ссылка</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('justifyLeft')}>Слева</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('justifyCenter')}>По центру</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('justifyRight')}>Справа</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => applyBlock('BLOCKQUOTE')}>Цитата</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('insertUnorderedList')}>Список</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('insertOrderedList')}>1. Список</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => runCommand('insertHorizontalRule')}>Разделитель</Button>
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs text-slate-700">
            <span>Цвет</span>
            <input
              type="color"
              value={textColor}
              className="h-5 w-7 cursor-pointer rounded border border-slate-200 bg-transparent p-0"
              onMouseDown={toolbarMouseDown}
              onChange={(event) => applyTextColor(event.target.value)}
            />
          </label>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => applyTextColor(DEFAULT_TEXT_COLOR)}>Сброс цвета</Button>
          <Button type="button" size="sm" variant="ghost" onMouseDown={toolbarMouseDown} onClick={() => runCommand('removeFormat')}>Очистить</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => setDialogMode('image')}>Картинка</Button>
          <Button type="button" size="sm" variant="outline" onMouseDown={toolbarMouseDown} onClick={() => setDialogMode('video')}>Видео</Button>
          <div className="min-w-[12rem] flex-1 sm:max-w-[14rem]">
            <Select
              options={FONT_OPTIONS}
              value={fontFamily}
              onChange={(event) => applyFontFamily(event.target.value)}
            />
          </div>
        </div>

        <div className="relative">
          {isEmpty && (
            <div className="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground">
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="article-rich-content min-h-[20rem] rounded-b-xl px-4 py-3 outline-none"
            onInput={syncContent}
            onBlur={syncContent}
            onMouseUp={saveSelection}
            onKeyUp={saveSelection}
            onFocus={saveSelection}
          />
        </div>
      </div>

      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={closeDialog}>
          <div
            className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {dialogMode === 'image' ? 'Добавить картинку' : 'Добавить видео'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {dialogMode === 'image'
                    ? 'Можно вставить ссылку или загрузить файл на сервер.'
                    : 'Поддерживаются ссылки на YouTube, Rutube и VK Video.'}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={closeDialog}>
                Закрыть
              </Button>
            </div>

            {dialogMode === 'image' ? (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Ссылка на картинку</label>
                  <Input
                    value={imageUrl}
                    onChange={(event) => {
                      setImageUrl(event.target.value);
                      if (mediaError) setMediaError('');
                    }}
                    placeholder="https://..."
                  />
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">Или загрузите файл с компьютера.</p>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void handleInlineImageUpload(event)}
                  />
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadImageMutation.isPending}
                      onClick={() => imageFileInputRef.current?.click()}
                    >
                      {uploadImageMutation.isPending ? 'Загружаю...' : 'Загрузить файл'}
                    </Button>
                    <Button type="button" onClick={insertImageByUrl}>
                      Вставить по ссылке
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Ссылка на видео</label>
                  <Input
                    value={videoUrl}
                    onChange={(event) => {
                      setVideoUrl(event.target.value);
                      if (mediaError) setMediaError('');
                    }}
                    placeholder="https://youtube.com/... или https://rutube.ru/... или https://vkvideo.ru/..."
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={insertVideo}>
                    Вставить видео
                  </Button>
                </div>
              </div>
            )}

            {mediaError && (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {mediaError}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50/70">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-900"
          onClick={() => setIsPreviewOpen((current) => !current)}
        >
          <span>Предпросмотр новости</span>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {isPreviewOpen ? 'Скрыть' : 'Показать'}
          </span>
        </button>
        {isPreviewOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-5">
            <RichNewsContent content={value} />
          </div>
        )}
      </div>
    </div>
  );
}
