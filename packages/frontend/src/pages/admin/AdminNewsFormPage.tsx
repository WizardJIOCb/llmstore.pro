import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { useAdminNews, useCreateNews, useUpdateNews, useUploadNewsImages } from '../../hooks/useNews';
import { newsApi, type NewsImage } from '../../lib/api/news';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { Textarea } from '../../components/ui/Textarea';
import { RichNewsEditor } from '../../components/admin/RichNewsEditor';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Черновик' },
  { value: 'published', label: 'Опубликовать' },
];

interface ImageEntry {
  filename: string;
  original_name?: string;
  url: string;
  sort_order: number;
}

export function AdminNewsFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const { data: existing, isLoading: loadingExisting } = useAdminNews(id || '');
  const createMutation = useCreateNews();
  const updateMutation = useUpdateNews();
  const uploadMutation = useUploadNewsImages();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [status, setStatus] = useState('draft');
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && existing && !loaded) {
      setTitle(existing.title);
      setContent(existing.content);
      setExcerpt(existing.excerpt || '');
      setStatus(existing.status);
      setImages(
        existing.images.map((img: NewsImage) => ({
          filename: img.filename,
          original_name: img.original_name || undefined,
          url: img.url,
          sort_order: img.sort_order,
        })),
      );
      setLoaded(true);
    }
  }, [isEdit, existing, loaded]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    setUploadError(null);

    try {
      const result = await uploadMutation.mutateAsync(Array.from(files));
      setImages((prev) => [
        ...prev,
        ...result.map((item, index) => ({
          filename: item.filename,
          original_name: item.original_name,
          url: item.url,
          sort_order: prev.length + index,
        })),
      ]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      setUploadError(error?.response?.data?.error?.message || 'Не удалось загрузить изображения');
    }
  };

  const handleRemoveImage = (filename: string) => {
    setImages((prev) => prev.filter((img) => img.filename !== filename));
    newsApi.deleteImage(filename).catch(() => {});
  };

  const handleMoveImage = (index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((img, currentIndex) => ({ ...img, sort_order: currentIndex }));
    });
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const data = {
      title,
      content,
      excerpt: excerpt || null,
      status,
      images: images.map((img, index) => ({
        filename: img.filename,
        original_name: img.original_name,
        sort_order: index,
      })),
    };

    if (isEdit && id) {
      await updateMutation.mutateAsync({ id, data });
    } else {
      await createMutation.mutateAsync(data);
    }

    navigate('/admin/news');
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submitError = createMutation.error || updateMutation.error;
  const submitErrorMessage = (submitError as any)?.response?.data?.error?.message || 'Ошибка сохранения';
  const pageTitle = isEdit ? 'Редактирование новости' : 'Новая новость';

  if (isEdit && loadingExisting) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Админка новостей</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{pageTitle}</h2>
        </div>
        <Button variant="outline" onClick={() => navigate('/admin/news')}>
          Назад к списку
        </Button>
      </div>

      {submitError && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitErrorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Заголовок</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Заголовок новости"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Краткое описание</label>
                <Textarea
                  value={excerpt}
                  onChange={(event) => setExcerpt(event.target.value)}
                  placeholder="Короткое описание для карточки новости"
                  rows={3}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-slate-950">Текст новости</h3>
              <p className="mt-1 text-sm text-slate-500">
                Редактор поддерживает форматирование текста, цвет, шрифты, изображения и видео-вставки.
              </p>
            </div>

            <RichNewsEditor
              value={content}
              onChange={setContent}
              placeholder="Текст новости..."
            />
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-slate-950">Изображения галереи</h3>
              <p className="mt-1 text-sm text-slate-500">
                Эти изображения прикрепляются к новости отдельно от inline-картинок внутри текста.
              </p>
            </div>

            <div className="space-y-4">
              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {images.map((img, index) => (
                    <div
                      key={img.filename}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                    >
                      <img src={img.url} alt={img.original_name || ''} className="aspect-square w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {index > 0 && (
                          <button
                            type="button"
                            className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-black hover:bg-white"
                            onClick={() => handleMoveImage(index, -1)}
                          >
                            &larr;
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                          onClick={() => handleRemoveImage(img.filename)}
                        >
                          X
                        </button>
                        {index < images.length - 1 && (
                          <button
                            type="button"
                            className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-black hover:bg-white"
                            onClick={() => handleMoveImage(index, 1)}
                          >
                            &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                />

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить изображения'}
                </Button>

                {uploadError && <p className="mt-3 text-sm text-destructive">{uploadError}</p>}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Публикация</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Статус</label>
                <Select
                  options={STATUS_OPTIONS}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Действия</h3>
            <div className="mt-4 space-y-3">
              <Button type="submit" className="w-full" disabled={isPending || !title || !content}>
                {isPending ? 'Сохранение...' : isEdit ? 'Сохранить новость' : 'Создать новость'}
              </Button>
              <Button
                type="button"
                className="w-full"
                variant="outline"
                onClick={() => navigate('/admin/news')}
              >
                Отмена
              </Button>
            </div>
          </section>
        </div>
      </form>
    </AdminLayout>
  );
}
