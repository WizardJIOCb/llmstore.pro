import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generateSlug } from '@llmstore/shared/utils';
import { useCategories, useTags, useUseCases } from '../../hooks/useTaxonomy';
import { useCreateArticle, useMyArticle, useUpdateArticle } from '../../hooks/useArticles';
import { TiptapArticleEditor } from '../../components/articles/TiptapArticleEditor';
import { Button, Input, Spinner, Textarea } from '../../components/ui';

function emptyDoc() {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
}

export function ArticleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { data: article, isLoading } = useMyArticle(id ?? '', isEdit);
  const createMutation = useCreateArticle();
  const updateMutation = useUpdateArticle();
  const { data: categories } = useCategories();
  const { data: tags } = useTags();
  const { data: useCases } = useUseCases();

  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState({
    title: '',
    slug: '',
    short_description: '',
    full_description: emptyDoc(),
    status: 'draft' as 'draft' | 'published',
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
    if (!article) return;

    setForm({
      title: article.title ?? '',
      slug: article.slug ?? '',
      short_description: article.short_description ?? '',
      full_description: article.full_description ?? emptyDoc(),
      status: article.status === 'published' ? 'published' : 'draft',
      hero_image_url: article.hero_image_url ?? '',
      seo_title: article.seo_title ?? '',
      seo_description: article.seo_description ?? '',
      category_ids: article.category_ids ?? [],
      tag_ids: article.tag_ids ?? [],
      use_case_ids: article.use_case_ids ?? [],
      primary_cta_label: article.meta?.primary_cta_label ?? '',
      primary_cta_url: article.meta?.primary_cta_url ?? '',
      secondary_cta_label: article.meta?.secondary_cta_label ?? '',
      secondary_cta_url: article.meta?.secondary_cta_url ?? '',
      reading_time_minutes: article.meta?.reading_time_minutes ? String(article.meta.reading_time_minutes) : '6',
    });
    setSlugTouched(true);
  }, [article]);

  useEffect(() => {
    if (slugTouched) return;
    setForm((current) => ({
      ...current,
      slug: generateSlug(current.title),
    }));
  }, [form.title, slugTouched]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const pageTitle = isEdit ? 'Редактирование статьи' : 'Новая статья';

  const handleToggle = (field: 'category_ids' | 'tag_ids' | 'use_case_ids', value: string) => {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  const payload = useMemo(() => ({
    title: form.title.trim(),
    slug: form.slug.trim(),
    short_description: form.short_description.trim(),
    full_description: form.full_description,
    status: form.status,
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

  const submit = async (status: 'draft' | 'published') => {
    if (!payload.title || !payload.slug || !payload.short_description || !payload.full_description) {
      return;
    }

    const nextPayload = { ...payload, status };

    if (isEdit && id) {
      const result = await updateMutation.mutateAsync({ id, payload: nextPayload });
      navigate(status === 'published' ? `/articles/${result.slug}` : '/articles');
      return;
    }

    const result = await createMutation.mutateAsync(nextPayload);
    navigate(status === 'published' ? `/articles/${result.slug}` : '/articles');
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Авторский кабинет</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{pageTitle}</h1>
        </div>
        <Link to="/articles" className="text-sm font-medium text-primary hover:underline">
          Вернуться к статьям
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Заголовок</label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Как я собрал Telegram-агента для публикации контента"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
                <Input
                  value={form.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setForm((current) => ({ ...current, slug: generateSlug(event.target.value) }));
                  }}
                  placeholder="telegram-agent-content-pipeline"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Краткое описание</label>
                <Textarea
                  value={form.short_description}
                  onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))}
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Обложка</label>
                <Input
                  value={form.hero_image_url}
                  onChange={(event) => setForm((current) => ({ ...current, hero_image_url: event.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Время чтения, минут</label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={form.reading_time_minutes}
                  onChange={(event) => setForm((current) => ({ ...current, reading_time_minutes: event.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-950">Текст статьи</h2>
              <p className="mt-1 text-sm text-slate-500">
                Лучше всего работают практические кейсы: задача, стек, скриншоты, что сработало, где запускать и как читателю попробовать самому.
              </p>
            </div>

            <TiptapArticleEditor
              value={form.full_description}
              onChange={(nextValue) => setForm((current) => ({ ...current, full_description: nextValue }))}
            />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">CTA и SEO</h2>
            <div className="mt-4 space-y-3">
              <Input
                value={form.primary_cta_label}
                onChange={(event) => setForm((current) => ({ ...current, primary_cta_label: event.target.value }))}
                placeholder="Основная кнопка, например: Открыть агента"
              />
              <Input
                value={form.primary_cta_url}
                onChange={(event) => setForm((current) => ({ ...current, primary_cta_url: event.target.value }))}
                placeholder="https://llmstore.pro/..."
              />
              <Input
                value={form.secondary_cta_label}
                onChange={(event) => setForm((current) => ({ ...current, secondary_cta_label: event.target.value }))}
                placeholder="Вторая кнопка, например: Посмотреть preview"
              />
              <Input
                value={form.secondary_cta_url}
                onChange={(event) => setForm((current) => ({ ...current, secondary_cta_url: event.target.value }))}
                placeholder="https://..."
              />
              <Input
                value={form.seo_title}
                onChange={(event) => setForm((current) => ({ ...current, seo_title: event.target.value }))}
                placeholder="SEO title"
              />
              <Textarea
                value={form.seo_description}
                onChange={(event) => setForm((current) => ({ ...current, seo_description: event.target.value }))}
                rows={3}
                placeholder="SEO description"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Категории и теги</h2>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Категории</p>
              <div className="flex flex-wrap gap-2">
                {(categories ?? []).map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleToggle('category_ids', category.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${form.category_ids.includes(category.id) ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'}`}
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
                    onClick={() => handleToggle('tag_ids', tag.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${form.tag_ids.includes(tag.id) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
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
                    onClick={() => handleToggle('use_case_ids', useCase.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${form.use_case_ids.includes(useCase.id) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                  >
                    {useCase.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Публикация</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              Черновик можно спокойно дополнять позже. Публикация сразу делает статью доступной на витрине и в рейтингах.
            </p>

            <div className="mt-5 space-y-3">
              <Button className="w-full" variant="outline" disabled={isSaving} onClick={() => void submit('draft')}>
                {isSaving && form.status === 'draft' ? 'Сохраняю...' : 'Сохранить как черновик'}
              </Button>
              <Button className="w-full" disabled={isSaving} onClick={() => void submit('published')}>
                {isSaving && form.status === 'published' ? 'Публикую...' : 'Опубликовать статью'}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
