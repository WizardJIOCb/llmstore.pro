import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useMemo } from 'react';
import { createArticleTiptapExtensions, parseArticleContent } from './tiptapArticleConfig';

export function ArticleRichContent({ content }: { content: string | null | undefined }) {
  const parsedContent = useMemo(() => parseArticleContent(content), [content]);
  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: createArticleTiptapExtensions(),
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
