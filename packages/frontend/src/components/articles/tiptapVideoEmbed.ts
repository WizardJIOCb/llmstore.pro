import { Node, mergeAttributes } from '@tiptap/core';

export const TiptapVideoEmbed = Node.create({
  name: 'embeddedVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      provider: {
        default: null,
      },
      originalUrl: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-article-video]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, provider, originalUrl, ...restAttributes } = HTMLAttributes;

    return [
      'div',
      mergeAttributes(restAttributes, {
        'data-article-video': 'true',
        'data-provider': provider,
        'data-original-url': originalUrl,
        class: 'article-video-embed',
      }),
      [
        'iframe',
        {
          src,
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
          allowfullscreen: 'true',
          loading: 'lazy',
          referrerpolicy: 'strict-origin-when-cross-origin',
        },
      ],
    ];
  },
});
