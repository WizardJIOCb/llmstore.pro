import type { Content } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextStyle } from '@tiptap/extension-text-style';
import Image from '@tiptap/extension-image';
import { TiptapVideoEmbed } from './tiptapVideoEmbed';

export function createEmptyArticleDoc() {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };
}

export function parseArticleContent(value: string | null | undefined): Content {
  if (!value) {
    return createEmptyArticleDoc();
  }

  let current: unknown = value;

  for (let attempt = 0; attempt < 2 && typeof current === 'string'; attempt += 1) {
    try {
      current = JSON.parse(current);
      continue;
    } catch {
      break;
    }
  }

  return current as Content;
}

export function createArticleTiptapExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
    }),
    Link.configure({
      openOnClick: placeholder ? false : true,
      autolink: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
        ...(placeholder ? {} : { class: 'text-primary underline underline-offset-4' }),
      },
    }),
    ...(placeholder
      ? [Placeholder.configure({ placeholder })]
      : []),
    Underline,
    TextStyle,
    FontFamily.configure({
      types: ['textStyle'],
    }),
    Color.configure({
      types: ['textStyle'],
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Image.configure({
      HTMLAttributes: {
        class: 'mx-auto h-auto max-w-full rounded-2xl border border-slate-200 shadow-sm',
      },
    }),
    TiptapVideoEmbed,
  ];
}
