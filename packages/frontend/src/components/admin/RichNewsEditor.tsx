import { useEffect, useMemo, useRef, useState } from 'react';
import { RichNewsContent } from '../news/RichNewsContent';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { normalizeNewsEditorValue } from '../../lib/newsRichText';

interface RichNewsEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const FONT_OPTIONS = [
  { value: '', label: 'Шрифт по умолчанию' },
  { value: 'Arial', label: 'Sans' },
  { value: 'Georgia', label: 'Serif' },
  { value: 'Courier New', label: 'Mono' },
];

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
  const [fontFamily, setFontFamily] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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

  const insertLink = () => {
    const href = window.prompt('Введите URL ссылки', 'https://');
    if (!href) return;
    runCommand('createLink', href);
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
          <Button type="button" size="sm" variant="ghost" onMouseDown={toolbarMouseDown} onClick={() => runCommand('removeFormat')}>Очистить</Button>
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
