import { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Button } from '../ui/Button';

function parseContent(value: string | null | undefined) {
  if (!value) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function TiptapArticleEditor({
  value,
  onChange,
  placeholder = 'Опишите кейс, что собрали, как это работает и как читателю попробовать ваш агент...',
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
}) {
  const parsedContent = useMemo(() => parseContent(value), [value]);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'mx-auto h-auto max-w-full rounded-2xl border border-slate-200 shadow-sm',
        },
      }),
    ],
    content: parsedContent,
    editorProps: {
      attributes: {
        class: 'article-editor-content min-h-[24rem] focus:outline-none',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(JSON.stringify(currentEditor.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = JSON.stringify(parsedContent);
    const currentContent = JSON.stringify(editor.getJSON());
    if (nextContent !== currentContent) {
      editor.commands.setContent(parsedContent, { emitUpdate: false });
    }
  }, [editor, parsedContent]);

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

  const insertImage = () => {
    const url = window.prompt('Введите URL изображения', 'https://');
    if (!editor || !url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  if (!editor) return null;

  const toolbarButtonClass = 'min-w-[2.5rem]';

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
        <Button type="button" size="sm" variant={editor.isActive('link') ? 'primary' : 'outline'} onClick={insertLink}>
          Ссылка
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={insertImage}>
          Картинка
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          Очистить
        </Button>
      </div>

      <div className="px-5 py-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
