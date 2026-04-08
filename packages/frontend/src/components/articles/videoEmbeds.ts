export interface ResolvedArticleVideoEmbed {
  provider: 'youtube' | 'rutube' | 'vkvideo';
  embedUrl: string;
  canonicalUrl: string;
  label: string;
}

function resolveYouTubeEmbed(url: URL): ResolvedArticleVideoEmbed | null {
  const host = url.hostname.replace(/^www\./, '');
  let videoId = '';

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') ?? '';
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] ?? '';
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] ?? '';
    }
  }

  if (!videoId) {
    return null;
  }

  return {
    provider: 'youtube',
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    label: 'YouTube',
  };
}

function resolveRutubeEmbed(url: URL): ResolvedArticleVideoEmbed | null {
  const host = url.hostname.replace(/^www\./, '');
  if (!host.endsWith('rutube.ru')) {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const videoIndex = segments.findIndex((segment) => segment === 'video');
  const embedIndex = segments.findIndex((segment) => segment === 'embed');
  const videoId = videoIndex >= 0
    ? segments[videoIndex + 1] ?? ''
    : embedIndex >= 0
      ? segments[embedIndex + 1] ?? ''
      : '';

  if (!videoId) {
    return null;
  }

  return {
    provider: 'rutube',
    embedUrl: `https://rutube.ru/play/embed/${videoId}`,
    canonicalUrl: `https://rutube.ru/video/${videoId}/`,
    label: 'Rutube',
  };
}

function resolveVkVideoEmbed(url: URL): ResolvedArticleVideoEmbed | null {
  const host = url.hostname.replace(/^www\./, '');
  if (!['vkvideo.ru', 'vk.com', 'm.vk.com'].includes(host)) {
    return null;
  }

  const match = url.pathname.match(/video(-?\d+)_([0-9]+)/);
  if (!match) {
    return null;
  }

  const oid = match[1];
  const id = match[2];
  const canonicalHost = host === 'vkvideo.ru' ? 'vkvideo.ru' : 'vk.com';

  return {
    provider: 'vkvideo',
    embedUrl: `https://${canonicalHost}/video_ext.php?oid=${oid}&id=${id}&hd=2`,
    canonicalUrl: `https://${canonicalHost}/video${oid}_${id}`,
    label: 'VK Video',
  };
}

export function resolveArticleVideoEmbed(rawUrl: string): ResolvedArticleVideoEmbed | null {
  try {
    const url = new URL(rawUrl);
    return resolveYouTubeEmbed(url) ?? resolveRutubeEmbed(url) ?? resolveVkVideoEmbed(url);
  } catch {
    return null;
  }
}
