import { useState, useCallback } from 'react';
import type { NewsImage } from '../../lib/api/news';
import { NewsLightbox } from './NewsLightbox';

interface ImageGalleryProps {
  images: NewsImage[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIndex(null), []);
  const prev = useCallback(
    () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : images.length - 1)),
    [images.length],
  );
  const next = useCallback(
    () => setLightboxIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : 0)),
    [images.length],
  );

  if (!images.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {images.map((img, idx) => (
          <button
            key={img.filename}
            type="button"
            className="aspect-square overflow-hidden rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setLightboxIndex(idx)}
          >
            <img
              src={img.url}
              alt={img.original_name || ''}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <NewsLightbox
          images={images}
          index={lightboxIndex}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      )}
    </>
  );
}
