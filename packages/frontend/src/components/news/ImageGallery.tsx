import { useState, useCallback, useEffect } from 'react';
import type { NewsImage } from '../../lib/api/news';

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

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, close, prev, next]);

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

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-10"
            onClick={close}
          >
            &times;
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10"
                onClick={(e) => { e.stopPropagation(); prev(); }}
              >
                &#8249;
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10"
                onClick={(e) => { e.stopPropagation(); next(); }}
              >
                &#8250;
              </button>
            </>
          )}

          <img
            src={images[lightboxIndex].url}
            alt={images[lightboxIndex].original_name || ''}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="absolute bottom-4 text-white text-sm">
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}
