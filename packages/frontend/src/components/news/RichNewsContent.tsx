import { useMemo } from 'react';
import { renderNewsContentHtml } from '../../lib/newsRichText';

interface RichNewsContentProps {
  content: string;
  className?: string;
}

export function RichNewsContent({ content, className = 'article-rich-content' }: RichNewsContentProps) {
  const html = useMemo(() => renderNewsContentHtml(content), [content]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html || '<p></p>' }}
    />
  );
}
