import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generateSlug } from '@llmstore/shared/utils';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { TiptapArticleEditor } from '../../components/articles/TiptapArticleEditor';
import { createEmptyArticleDoc } from '../../components/articles/tiptapArticleConfig';
import {
  buildArticleMetadataJsonWithPoll,
  createEditablePollOption,
  extractEditableArticlePoll,
} from '../../components/articles/articlePoll';
import { Button, Input, Select, Spinner, Textarea } from '../../components/ui';
import { useAdminItem, useCreateItem, useUpdateItem } from '../../hooks/useAdmin';
import { useUploadArticleHeroImage } from '../../hooks/useArticles';
import { useCategories, useTags, useUseCases } from '../../hooks/useTaxonomy';
import {
  deploymentTypeLabels,
  difficultyLabels,
  itemStatusLabels,
  languageSupportLabels,
  pricingTypeLabels,
  privacyTypeLabels,
  readinessLabels,
} from '../../lib/label-maps';

const visibilityOptions = [
  { value: 'public', label: 'Публичная' },
  { value: 'unlisted', label: 'По ссылке' },
  { value: 'private', label: 'Приватная' },
];

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
    full_description: JSON.stringify(createEmptyArticleDoc()),
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
    pricing_type: '',
    deployment_type: '',
    privacy_type: '',
    language_support: '',
    difficulty: '',
    readiness: '',
    vendor_name: '',
    source_url: '',
    docs_url: '',
    github_url: '',
    website_url: '',
    primary_cta_label: '',
    primary_cta_url: '',
    secondary_cta_label: '',
    secondary_cta_url: '',
    reading_time_minutes: '6',
    metadata_json: null as Record<string, unknown> | null,
    poll_question: '',
    poll_options: [createEditablePollOption(), createEditablePollOption()],
  });

  useEffect(() => {
    if (!existingItem) return;
    const existingPoll = extractEditableArticlePoll(existingItem.meta?.metadata_json);

    setForm({
      type: 'article',
      title: existingItem.title ?? '',
      slug: existingItem.slug ?? '',
      short_description: existingItem.short_description ?? '',
      full_description: existingItem.full_description ?? JSON.stringify(createEmptyArticleDoc()),
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
      pricing_type: existingItem.meta?.pricing_type ?? '',
      deployment_type: existingItem.meta?.deployment_type ?? '',
      privacy_type: existingItem.meta?.privacy_type ?? '',
      language_support: existingItem.meta?.language_support ?? '',
      difficulty: existingItem.meta?.difficulty ?? '',
      readiness: existingItem.meta?.readiness ?? '',
      vendor_name: existingItem.meta?.vendor_name ?? '',
      source_url: existingItem.meta?.source_url ?? '',
      docs_url: existingItem.meta?.docs_url ?? '',
      github_url: existingItem.meta?.github_url ?? '',
      website_url: existingItem.meta?.website_url ?? '',
      primary_cta_label: existingItem.meta?.primary_cta_label ?? '',
      primary_cta_url: existingItem.meta?.primary_cta_url ?? '',
      secondary_cta_label: existingItem.meta?.secondary_cta_label ?? '',
      secondary_cta_url: existingItem.meta?.secondary_cta_url ?? '',
      reading_time_minutes: existingItem.meta?.reading_time_minutes ? String(existingItem.meta.reading_time_minutes) : '6',
      metadata_json: existingItem.meta?.metadata_json ?? null,
      poll_question: existingPoll?.question ?? '',
      poll_options: existingPoll?.options ?? [createEditablePollOption(), createEditablePollOption()],
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
      pricing_type: form.pricing_type || null,
      deployment_type: form.deployment_type || null,
      privacy_type: form.privacy_type || null,
      language_support: form.language_support || null,
      difficulty: form.difficulty || null,
      readiness: form.readiness || null,
      vendor_name: form.vendor_name.trim() || null,
      source_url: form.source_url.trim() || null,
      docs_url: form.docs_url.trim() || null,
      github_url: form.github_url.trim() || null,
      website_url: form.website_url.trim() || null,
      primary_cta_label: form.primary_cta_label.trim() || null,
      primary_cta_url: form.primary_cta_url.trim() || null,
      secondary_cta_label: form.secondary_cta_label.trim() || null,
      secondary_cta_url: form.secondary_cta_url.trim() || null,
      reading_time_minutes: Number(form.reading_time_minutes) || null,
      metadata_json: buildArticleMetadataJsonWithPoll(form.metadata_json, {
        question: form.poll_question,
        options: form.poll_options,
      }),
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

  const updatePollOption = (optionId: string, text: string) => {
    setForm((current) => ({
      ...current,
      poll_options: current.poll_options.map((option) => (
        option.id === optionId ? { ...option, text } : option
      )),
    }));
  };

  const addPollOption = () => {
    setForm((current) => ({
      ...current,
      poll_options: [...current.poll_options, createEditablePollOption()],
    }));
  };

  const removePollOption = (optionId: string) => {
    setForm((current) => ({
      ...current,
      poll_options: current.poll_options.filter((option) => option.id !== optionId),
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
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-slate-950">Голосование внизу статьи</h3>
              <p className="mt-1 text-sm text-slate-500">
                Опрос показывается внизу статьи перед комментариями и помогает собрать быстрый отклик от читателей.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Вопрос</label>
                <Input
                  value={form.poll_question}
                  onChange={(event) => updateField('poll_question', event.target.value)}
                  placeholder="Например: какой формат агента вам сейчас интереснее всего?"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-700">Варианты ответа</label>
                  <Button type="button" variant="outline" size="sm" onClick={addPollOption}>
                    Добавить вариант
                  </Button>
                </div>

                {form.poll_options.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-3">
                    <div className="w-full">
                      <Input
                        value={option.text}
                        onChange={(event) => updatePollOption(option.id, event.target.value)}
                        placeholder={`Вариант ${index + 1}`}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={form.poll_options.length <= 2}
                      onClick={() => removePollOption(option.id)}
                    >
                      Убрать
                    </Button>
                  </div>
                ))}
              </div>
            </div>
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

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Характеристики</h3>
            <div className="mt-4 grid gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Цена</label>
                <Select
                  options={toOptions(pricingTypeLabels)}
                  placeholder="—"
                  value={form.pricing_type}
                  onChange={(event) => updateField('pricing_type', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Deploy</label>
                <Select
                  options={toOptions(deploymentTypeLabels)}
                  placeholder="—"
                  value={form.deployment_type}
                  onChange={(event) => updateField('deployment_type', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Приватность</label>
                <Select
                  options={toOptions(privacyTypeLabels)}
                  placeholder="—"
                  value={form.privacy_type}
                  onChange={(event) => updateField('privacy_type', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Язык</label>
                <Select
                  options={toOptions(languageSupportLabels)}
                  placeholder="—"
                  value={form.language_support}
                  onChange={(event) => updateField('language_support', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Уровень</label>
                <Select
                  options={toOptions(difficultyLabels)}
                  placeholder="—"
                  value={form.difficulty}
                  onChange={(event) => updateField('difficulty', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Готовность</label>
                <Select
                  options={toOptions(readinessLabels)}
                  placeholder="—"
                  value={form.readiness}
                  onChange={(event) => updateField('readiness', event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Источник</label>
                <Input
                  value={form.vendor_name}
                  onChange={(event) => updateField('vendor_name', event.target.value)}
                  placeholder="LLMStore.pro"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Ссылка на источник</label>
                <Input
                  value={form.source_url}
                  onChange={(event) => updateField('source_url', event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Сайт</label>
                <Input
                  value={form.website_url}
                  onChange={(event) => updateField('website_url', event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Документация</label>
                <Input
                  value={form.docs_url}
                  onChange={(event) => updateField('docs_url', event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">GitHub</label>
                <Input
                  value={form.github_url}
                  onChange={(event) => updateField('github_url', event.target.value)}
                  placeholder="https://github.com/..."
                />
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
