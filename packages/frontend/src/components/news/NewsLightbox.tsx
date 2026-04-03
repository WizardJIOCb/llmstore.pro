import { useCallback, useEffect } from 'react';
import type { NewsImage } from '../../lib/api/news';

interface NewsLightboxProps {
  images: NewsImage[];
  index: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6" aria-hidden="true">
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6" aria-hidden="true">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NewsLightbox({ images, index, onClose, onPrev, onNext }: NewsLightboxProps) {
  const activeImage = images[index];
  const hasMultiple = images.length > 1;

  const handlePrev = useCallback(() => {
    onPrev?.();
  }, [onPrev]);

  const handleNext = useCallback(() => {
    onNext?.();
  }, [onNext]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultiple) handlePrev();
      if (event.key === 'ArrowRight' && hasMultiple) handleNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, hasMultiple, handlePrev, handleNext]);

  if (!activeImage) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex animate-[fadeIn_180ms_ease-out] items-center justify-center bg-[rgba(48,36,24,0.86)] p-3 md:p-8"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-[rgba(255,248,239,0.16)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[rgba(255,248,239,0.26)] md:right-6 md:top-6"
        onClick={onClose}
      >
        <span aria-hidden="true" className="text-xl leading-none">&times;</span>
        <span>Закрыть</span>
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(255,248,239,0.14)] text-white transition hover:bg-[rgba(255,248,239,0.24)] md:left-6"
            onClick={(event) => {
              event.stopPropagation();
              handlePrev();
            }}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(255,248,239,0.14)] text-white transition hover:bg-[rgba(255,248,239,0.24)] md:right-6"
            onClick={(event) => {
              event.stopPropagation();
              handleNext();
            }}
          >
            <ChevronRightIcon />
          </button>
        </>
      )}

      <div
        className="flex max-h-full max-w-full animate-[zoomIn_220ms_ease-out] flex-col items-center justify-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={activeImage.url}
          alt={activeImage.original_name || ''}
          className="h-auto max-h-[92vh] w-auto max-w-[94vw] object-contain"
        />
        <div className="flex flex-wrap items-center justify-center gap-3 text-center text-xs text-white/80">
          {hasMultiple && <span>{index + 1} / {images.length}</span>}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes zoomIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
