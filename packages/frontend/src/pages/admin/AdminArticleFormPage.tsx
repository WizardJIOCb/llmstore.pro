import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generateSlug } from '@llmstore/shared/utils';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { TiptapArticleEditor } from '../../components/articles/TiptapArticleEditor';
import { Button, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useAdminItem, useCreateItem, useUpdateItem } from '../../hooks/useAdmin';
import { useUploadArticleHeroImage } from '../../hooks/useArticles';
import { useCategories, useTags, useUseCases } from '../../hooks/useTaxonomy';
import { itemStatusLabels } from '../../lib/label-maps';

const visibilityOptions = [
  { value: 'public', label: 'Публичная' },
  { value: 'unlisted', label: 'По ссылке' },
  { value: 'private', label: 'Приватная' },
];

function emptyDoc() {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
}

function toOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

function normalizeSlugDraft(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

export function AdminArticleFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const { data: existingItem, isLoading } = useAdminItem(id ?? '');
  const { data: categories } = useCategories();
  const { data: tags } = useTags();
  const { data: useCases } = useUseCases();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const uploadHeroMutation = useUploadArticleHeroImage();
  const heroFileInputRef = useRef<HTMLInputElement | null>(null);

  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  const [heroUploadError, setHeroUploadError] = useState('');
  const [form, setForm] = useState({
    type: 'article',
    title: '',
    slug: '',
    short_description: '',
    full_description: emptyDoc(),
    status: 'draft',
    visibility: 'public',
    featured: false,
    curated_score: 0,
    hero_image_url: '',
    seo_title: '',
    seo_description: '',
    category_ids: [] as string[],
    tag_ids: [] as string[],
    use_case_ids: [] as string[],
    primary_cta_label: '',
    primary_cta_url: '',
    secondary_cta_label: '',
    secondary_cta_url: '',
    reading_time_minutes: '6',
  });

  useEffect(() => {
    if (!existingItem) return;

    setForm({
      type: 'article',
      title: existingItem.title ?? '',
      slug: existingItem.slug ?? '',
      short_description: existingItem.short_description ?? '',
      full_description: existingItem.full_description ?? emptyDoc(),
      status: existingItem.status ?? 'draft',
      visibility: existingItem.visibility ?? 'public',
      featured: existingItem.featured ?? false,
      curated_score: existingItem.curated_score ?? 0,
      hero_image_url: existingItem.hero_image_url ?? '',
      seo_title: existingItem.seo_title ?? '',
      seo_description: existingItem.seo_description ?? '',
      category_ids: existingItem.category_ids ?? [],
      tag_ids: existingItem.tag_ids ?? [],
      use_case_ids: existingItem.use_case_ids ?? [],
      primary_cta_label: existingItem.meta?.primary_cta_label ?? '',
      primary_cta_url: existingItem.meta?.primary_cta_url ?? '',
      secondary_cta_label: existingItem.meta?.secondary_cta_label ?? '',
      secondary_cta_url: existingItem.meta?.secondary_cta_url ?? '',
      reading_time_minutes: existingItem.meta?.reading_time_minutes ? String(existingItem.meta.reading_time_minutes) : '6',
    });
    setSlugTouched(true);
  }, [existingItem]);

  useEffect(() => {
    if (slugTouched) return;
    setForm((current) => ({
      ...current,
      slug: generateSlug(current.title),
    }));
  }, [form.title, slugTouched]);

  const isWrongType = isEdit && existingItem && existingItem.type !== 'article';
  const isUploadingHero = uploadHeroMutation.isPending;

  const payload = useMemo(() => ({
    type: 'article',
    title: form.title.trim(),
    slug: form.slug.trim(),
    short_description: form.short_description.trim() || null,
    full_description: form.full_description,
    status: form.status,
    visibility: form.visibility,
    featured: form.featured,
    curated_score: Number(form.curated_score) || 0,
    hero_image_url: form.hero_image_url.trim() || null,
    seo_title: form.seo_title.trim() || null,
    seo_description: form.seo_description.trim() || null,
    category_ids: form.category_ids,
    tag_ids: form.tag_ids,
    use_case_ids: form.use_case_ids,
    meta: {
      primary_cta_label: form.primary_cta_label.trim() || null,
      primary_cta_url: form.primary_cta_url.trim() || null,
      secondary_cta_label: form.secondary_cta_label.trim() || null,
      secondary_cta_url: form.secondary_cta_url.trim() || null,
      reading_time_minutes: Number(form.reading_time_minutes) || null,
    },
  }), [form]);

  const updateField = <T extends keyof typeof form>(field: T, value: (typeof form)[T]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleArrayValue = (field: 'category_ids' | 'tag_ids' | 'use_case_ids', value: string) => {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      if (isEdit && id) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/admin/articles');
    } catch (submissionError: any) {
      setError(submissionError?.response?.data?.error?.message || 'Не удалось сохранить статью');
    }
  };

  const handleHeroUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setHeroUploadError('');

    try {
      const uploaded = await uploadHeroMutation.mutateAsync(file);
      updateField('hero_image_url', uploaded.url);
    } catch (uploadError: any) {
      setHeroUploadError(uploadError?.response?.data?.error?.message || 'Не удалось загрузить новую обложку');
    }
  };

  if (isEdit && isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </AdminLayout>
    );
  }

  if (isWrongType) {
    return (
      <AdminLayout>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-xl font-semibold">Это не статья</h2>
          <p className="mt-2 text-sm text-amber-800">
            Запись существует в каталоге, но её тип отличается от формата article.
          </p>
          <div className="mt-4">
            <Link to="/admin/articles">
              <Button variant="outline">Вернуться к статьям</Button>
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const pageTitle = isEdit ? 'Редактирование статьи' : 'Новая статья';

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Админка статей</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{pageTitle}</h2>
        </div>
        <Link to="/admin/articles" className="text-sm font-medium text-primary hover:underline">
          Вернуться к списку
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Заголовок</label>
                <Input
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  placeholder="Как собрали Telegram-агента и упаковали его в продукт"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
                <Input
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    updateField('slug', normalizeSlugDraft(event.target.value));
                  }}
                  placeholder="telegram-agent-product-case"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Краткое описание</label>
                <Textarea
                  value={form.short_description}
                  onChange={(event) => updateField('short_description', event.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Обложка</label>
                <div className="space-y-3">
                  <Input
                    value={form.hero_image_url}
                    onChange={(event) => updateField('hero_image_url', event.target.value)}
                    placeholder="https://..."
                  />
                  <input
                    ref={heroFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void handleHeroUpload(event)}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploadingHero}
                      onClick={() => heroFileInputRef.current?.click()}
                    >
                      {isUploadingHero ? 'Загружаю новую обложку...' : 'Загрузить новую обложку'}
                    </Button>
                    {form.hero_image_url && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setHeroUploadError('');
                          updateField('hero_image_url', '');
                        }}
                      >
                        Убрать
                      </Button>
                    )}
                  </div>
                  {heroUploadError && (
                    <p className="text-sm text-rose-600">{heroUploadError}</p>
                  )}
                  {form.hero_image_url && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <img src={form.hero_image_url} alt="Обложка статьи" className="h-48 w-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Время чтения, минут</label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={form.reading_time_minutes}
                  onChange={(event) => updateField('reading_time_minutes', event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-slate-950">Текст статьи</h3>
              <p className="mt-1 text-sm text-slate-500">
                Здесь используется тот же новый формат статьи, что и на пользовательской стороне.
              </p>
            </div>

            <TiptapArticleEditor
              value={form.full_description}
              onChange={(nextValue) => updateField('full_description', nextValue)}
              placeholder="Опишите кейс, стек, ссылку на агента, результат, метрики и как читателю попробовать решение."
            />
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Категории и теги</h3>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Категории</p>
              <div className="flex flex-wrap gap-2">
                {(categories ?? []).map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggleArrayValue('category_ids', category.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      form.category_ids.includes(category.id)
                        ? 'border-sky-300 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-slate-700">Теги</p>
              <div className="flex flex-wrap gap-2">
                {(tags ?? []).map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleArrayValue('tag_ids', tag.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      form.tag_ids.includes(tag.id)
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-slate-700">Use cases</p>
              <div className="flex flex-wrap gap-2">
                {(useCases ?? []).map((useCase) => (
                  <button
                    key={useCase.id}
                    type="button"
                    onClick={() => toggleArrayValue('use_case_ids', useCase.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      form.use_case_ids.includes(useCase.id)
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {useCase.name}
                  </button>
                ))}
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
                  options={toOptions(itemStatusLabels)}
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Видимость</label>
                <Select
                  options={visibilityOptions}
                  value={form.visibility}
                  onChange={(event) => updateField('visibility', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Рейтинг для фичеринга</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.curated_score}
                  onChange={(event) => updateField('curated_score', Number(event.target.value) || 0)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) => updateField('featured', event.target.checked)}
                  className="rounded"
                />
                Показать как featured
              </label>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">CTA и SEO</h3>
            <div className="mt-4 space-y-3">
              <Input
                value={form.primary_cta_label}
                onChange={(event) => updateField('primary_cta_label', event.target.value)}
                placeholder="Основная кнопка, например: Открыть агента"
              />
              <Input
                value={form.primary_cta_url}
                onChange={(event) => updateField('primary_cta_url', event.target.value)}
                placeholder="https://llmstore.pro/..."
              />
              <Input
                value={form.secondary_cta_label}
                onChange={(event) => updateField('secondary_cta_label', event.target.value)}
                placeholder="Вторая кнопка, например: Посмотреть demo"
              />
              <Input
                value={form.secondary_cta_url}
                onChange={(event) => updateField('secondary_cta_url', event.target.value)}
                placeholder="https://..."
              />
              <Input
                value={form.seo_title}
                onChange={(event) => updateField('seo_title', event.target.value)}
                placeholder="SEO title"
              />
              <Textarea
                value={form.seo_description}
                onChange={(event) => updateField('seo_description', event.target.value)}
                rows={3}
                placeholder="SEO description"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Действия</h3>
            <div className="mt-4 space-y-3">
              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? 'Сохраняю...' : isEdit ? 'Сохранить изменения' : 'Создать статью'}
              </Button>
              <Button
                type="button"
                className="w-full"
                variant="outline"
                onClick={() => navigate('/admin/articles')}
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
