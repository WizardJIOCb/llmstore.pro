import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { useEffect, useMemo } from 'react';

function parseContent(value: string | null | undefined) {
  if (!value) {
    return '<p></p>';
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function ArticleRichContent({ content }: { content: string | null | undefined }) {
  const parsedContent = useMemo(() => parseContent(content), [content]);
  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
          class: 'text-primary underline underline-offset-4',
        },
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
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(parsedContent, { emitUpdate: false });
  }, [editor, parsedContent]);

  if (!editor) return null;

  return (
    <div className="article-rich prose prose-slate max-w-none prose-headings:tracking-tight prose-p:leading-8 prose-li:leading-7 prose-img:rounded-2xl">
      <EditorContent editor={editor} />
    </div>
  );
}
