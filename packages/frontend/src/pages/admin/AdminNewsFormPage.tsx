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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploadError(null);
    try {
      const result = await uploadMutation.mutateAsync(Array.from(files));
      setImages((prev) => [
        ...prev,
        ...result.map((r, i) => ({
          filename: r.filename,
          original_name: r.original_name,
          url: r.url,
          sort_order: prev.length + i,
        })),
      ]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setUploadError(err?.response?.data?.error?.message || 'Не удалось загрузить изображение');
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
      return next.map((img, i) => ({ ...img, sort_order: i }));
    });
  };

  const handleSubmit = async () => {
    const data = {
      title,
      content,
      excerpt: excerpt || null,
      status,
      images: images.map((img, i) => ({
        filename: img.filename,
        original_name: img.original_name,
        sort_order: i,
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

  if (isEdit && loadingExisting) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-12"><Spinner /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{isEdit ? 'Редактировать новость' : 'Новая новость'}</h2>
          <Button variant="outline" onClick={() => navigate('/admin/news')}>Назад</Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Заголовок *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок новости" />
          </div>

          <div>
            <label className="text-sm font-medium">Краткое описание</label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Короткое описание для карточки (необязательно)"
              rows={2}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Содержание *</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Текст новости..."
              rows={12}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Статус</label>
            <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} className="w-48" />
          </div>

          <div>
            <label className="text-sm font-medium">Изображения</label>
            <div className="mt-2 space-y-3">
              {images.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {images.map((img, idx) => (
                    <div key={img.filename} className="group relative overflow-hidden rounded-lg border">
                      <img src={img.url} alt={img.original_name || ''} className="aspect-square w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {idx > 0 && (
                          <button
                            type="button"
                            className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-black hover:bg-white"
                            onClick={() => handleMoveImage(idx, -1)}
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
                        {idx < images.length - 1 && (
                          <button
                            type="button"
                            className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-black hover:bg-white"
                            onClick={() => handleMoveImage(idx, 1)}
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
                {uploadError && <p className="mt-2 text-sm text-destructive">{uploadError}</p>}
              </div>
            </div>
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-destructive">
            {(submitError as any)?.response?.data?.error?.message || 'Ошибка сохранения'}
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <Button onClick={handleSubmit} disabled={isPending || !title || !content}>
            {isPending ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/admin/news')}>
            Отмена
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
