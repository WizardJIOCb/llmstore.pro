import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Button, Input } from '../ui';
import { useUploadArticleImage } from '../../hooks/useArticles';
import { createArticleTiptapExtensions, parseArticleContent } from './tiptapArticleConfig';
import { resolveArticleVideoEmbed } from './videoEmbeds';

type MediaDialogMode = 'image' | 'video' | null;

export function TiptapArticleEditor({
  value,
  onChange,
  placeholder = 'Опишите кейс, что собрали, как это работает и как читателю попробовать ваш агент...',
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
}) {
  const parsedContent = useMemo(() => parseArticleContent(value), [value]);
  const lastSyncedValueRef = useRef<string>('');
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadImageMutation = useUploadArticleImage();
  const [dialogMode, setDialogMode] = useState<MediaDialogMode>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [mediaError, setMediaError] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: createArticleTiptapExtensions(placeholder),
    content: parsedContent,
    editorProps: {
      attributes: {
        class: 'article-editor-content min-h-[24rem] focus:outline-none',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = JSON.stringify(currentEditor.getJSON());
      lastSyncedValueRef.current = nextValue;
      onChange(nextValue);
    },
  });

  useEffect(() => {
    if (!editor) return;

    if (value === lastSyncedValueRef.current) {
      return;
    }

    editor.commands.setContent(parsedContent, { emitUpdate: false });
    const normalizedValue = JSON.stringify(editor.getJSON());
    lastSyncedValueRef.current = normalizedValue;

    if (typeof parsedContent === 'string' && normalizedValue !== value) {
      onChange(normalizedValue);
    }
  }, [editor, onChange, parsedContent, value]);

  const closeDialog = () => {
    setDialogMode(null);
    setImageUrl('');
    setVideoUrl('');
    setMediaError('');
  };

  const insertLink = () => {
    const previousUrl = editor?.getAttributes('link').href as string | undefined;
    const url = window.prompt('Введите URL ссылки', previousUrl || 'https://');
    if (!editor || url === null) return;

    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertImageByUrl = () => {
    if (!editor) return;
    const normalizedUrl = imageUrl.trim();

    if (!normalizedUrl) {
      setMediaError('Укажите ссылку на изображение.');
      return;
    }

    editor.chain().focus().setImage({ src: normalizedUrl }).run();
    closeDialog();
  };

  const handleInlineImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;

    setMediaError('');

    try {
      const uploaded = await uploadImageMutation.mutateAsync(file);
      editor.chain().focus().setImage({ src: uploaded.url }).run();
      closeDialog();
    } catch (error: any) {
      setMediaError(error?.response?.data?.error?.message || 'Не удалось загрузить картинку на сервер.');
    }
  };

  const insertVideo = () => {
    if (!editor) return;
    const resolved = resolveArticleVideoEmbed(videoUrl.trim());

    if (!resolved) {
      setMediaError('Поддерживаются только YouTube, Rutube и VK Video.');
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'embeddedVideo',
        attrs: {
          src: resolved.embedUrl,
          provider: resolved.provider,
          originalUrl: resolved.canonicalUrl,
        },
      })
      .run();

    closeDialog();
  };

  if (!editor) return null;

  const toolbarButtonClass = 'min-w-[2.5rem]';
  const isUploadingImage = uploadImageMutation.isPending;

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <Button type="button" size="sm" variant={editor.isActive('bold') ? 'primary' : 'outline'} className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('italic') ? 'primary' : 'outline'} className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleItalic().run()}>
          I
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('underline') ? 'primary' : 'outline'} className={toolbarButtonClass} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          U
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('heading', { level: 2 }) ? 'primary' : 'outline'} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('heading', { level: 3 }) ? 'primary' : 'outline'} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('bulletList') ? 'primary' : 'outline'} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Список
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('orderedList') ? 'primary' : 'outline'} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1.
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('blockquote') ? 'primary' : 'outline'} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          Цитата
        </Button>
        <Button type="button" size="sm" variant={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'outline'} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          Лево
        </Button>
        <Button type="button" size="sm" variant={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'outline'} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          Центр
        </Button>
        <Button type="button" size="sm" variant={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'outline'} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          Право
        </Button>
        <Button type="button" size="sm" variant={editor.isActive('link') ? 'primary' : 'outline'} onClick={insertLink}>
          Ссылка
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialogMode('image')}>
          Картинка
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialogMode('video')}>
          Видео
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          Очистить
        </Button>
      </div>

      <div className="article-rich prose prose-slate max-w-none px-5 py-5 prose-headings:tracking-tight prose-p:leading-8 prose-li:leading-7 prose-img:rounded-2xl">
        <EditorContent editor={editor} />
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
                    ? 'Можно вставить ссылку или загрузить файл к нам на сервер.'
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
                      disabled={isUploadingImage}
                      onClick={() => imageFileInputRef.current?.click()}
                    >
                      {isUploadingImage ? 'Загружаю...' : 'Загрузить файл'}
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
    </div>
  );
}
