import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminItem, useCreateItem, useUpdateItem } from '../../hooks/useAdmin';
import { useCategories, useTags, useUseCases } from '../../hooks/useTaxonomy';
import { Button, Input, Textarea, Select, Spinner } from '../../components/ui';
import {
  contentTypeLabels, pricingTypeLabels, deploymentTypeLabels,
  privacyTypeLabels, languageSupportLabels, difficultyLabels,
  readinessLabels, itemStatusLabels,
} from '../../lib/label-maps';

function toOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

export function AdminCatalogFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { data: existingItem, isLoading: loadingItem } = useAdminItem(id ?? '');
  const { data: allCategories } = useCategories();
  const { data: allTags } = useTags();
  const { data: allUseCases } = useUseCases();

  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();

  const [form, setForm] = useState({
    type: 'tool',
    title: '',
    slug: '',
    short_description: '',
    full_description: '',
    status: 'draft',
    visibility: 'public',
    featured: false,
    curated_score: 0,
    seo_title: '',
    seo_description: '',
    hero_image_url: '',
    meta: {
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
    },
    category_ids: [] as string[],
    tag_ids: [] as string[],
    use_case_ids: [] as string[],
  });

  const [error, setError] = useState('');

  // Populate form when editing
  useEffect(() => {
    if (isEdit && existingItem) {
      setForm({
        type: existingItem.type ?? 'tool',
        title: existingItem.title ?? '',
        slug: existingItem.slug ?? '',
        short_description: existingItem.short_description ?? '',
        full_description: existingItem.full_description ?? '',
        status: existingItem.status ?? 'draft',
        visibility: existingItem.visibility ?? 'public',
        featured: existingItem.featured ?? false,
        curated_score: existingItem.curated_score ?? 0,
        seo_title: existingItem.seo_title ?? '',
        seo_description: existingItem.seo_description ?? '',
        hero_image_url: existingItem.hero_image_url ?? '',
        meta: {
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
        },
        category_ids: existingItem.category_ids ?? [],
        tag_ids: existingItem.tag_ids ?? [],
        use_case_ids: existingItem.use_case_ids ?? [],
      });
    }
  }, [isEdit, existingItem]);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateMeta = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      meta: { ...prev.meta, [field]: value },
    }));
  };

  const toggleArrayItem = (field: 'category_ids' | 'tag_ids' | 'use_case_ids', id: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(id)
        ? prev[field].filter((v) => v !== id)
        : [...prev[field], id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Clean meta — remove empty strings
    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form.meta)) {
      if (v) meta[k] = v;
    }

    const payload: Record<string, unknown> = {
      ...form,
      hero_image_url: form.hero_image_url || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      short_description: form.short_description || null,
      full_description: form.full_description || null,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Ошибка сохранения');
    }
  };

  if (isEdit && loadingItem) {
    return (
      <div className="flex justify-center py-16"><Spinner size="lg" /></div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">
        {isEdit ? 'Редактирование' : 'Новый элемент каталога'}
      </h1>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic fields */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Тип *</label>
            <Select
              options={toOptions(contentTypeLabels)}
              value={form.type}
              onChange={(e) => updateField('type', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Статус</label>
            <Select
              options={toOptions(itemStatusLabels)}
              value={form.status}
              onChange={(e) => updateField('status', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Название *</label>
          <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Slug *</label>
          <Input
            value={form.slug}
            onChange={(e) => updateField('slug', e.target.value)}
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="my-tool-name"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Краткое описание</label>
          <Input value={form.short_description} onChange={(e) => updateField('short_description', e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Полное описание</label>
          <Textarea
            value={form.full_description}
            onChange={(e) => updateField('full_description', e.target.value)}
            rows={6}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Рейтинг (0-100)</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.curated_score}
              onChange={(e) => updateField('curated_score', parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => updateField('featured', e.target.checked)}
                className="rounded"
              />
              Featured
            </label>
          </div>
        </div>

        {/* Meta section */}
        <fieldset className="rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Характеристики</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Цена</label>
              <Select options={toOptions(pricingTypeLabels)} placeholder="—" value={form.meta.pricing_type} onChange={(e) => updateMeta('pricing_type', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Deploy</label>
              <Select options={toOptions(deploymentTypeLabels)} placeholder="—" value={form.meta.deployment_type} onChange={(e) => updateMeta('deployment_type', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Приватность</label>
              <Select options={toOptions(privacyTypeLabels)} placeholder="—" value={form.meta.privacy_type} onChange={(e) => updateMeta('privacy_type', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Язык</label>
              <Select options={toOptions(languageSupportLabels)} placeholder="—" value={form.meta.language_support} onChange={(e) => updateMeta('language_support', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Уровень</label>
              <Select options={toOptions(difficultyLabels)} placeholder="—" value={form.meta.difficulty} onChange={(e) => updateMeta('difficulty', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Готовность</label>
              <Select options={toOptions(readinessLabels)} placeholder="—" value={form.meta.readiness} onChange={(e) => updateMeta('readiness', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Вендор</label>
              <Input value={form.meta.vendor_name} onChange={(e) => updateMeta('vendor_name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Сайт</label>
              <Input value={form.meta.website_url} onChange={(e) => updateMeta('website_url', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Документация</label>
              <Input value={form.meta.docs_url} onChange={(e) => updateMeta('docs_url', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">GitHub</label>
              <Input value={form.meta.github_url} onChange={(e) => updateMeta('github_url', e.target.value)} />
            </div>
          </div>
        </fieldset>

        {/* Taxonomy selectors */}
        <fieldset className="rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Категории</legend>
          <div className="flex flex-wrap gap-2">
            {(allCategories ?? []).map((cat) => (
              <label key={cat.id} className="flex items-center gap-1 rounded border px-2 py-1 text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={form.category_ids.includes(cat.id)}
                  onChange={() => toggleArrayItem('category_ids', cat.id)}
                  className="rounded"
                />
                {cat.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Теги</legend>
          <div className="flex flex-wrap gap-2">
            {(allTags ?? []).map((tag) => (
              <label key={tag.id} className="flex items-center gap-1 rounded border px-2 py-1 text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={form.tag_ids.includes(tag.id)}
                  onChange={() => toggleArrayItem('tag_ids', tag.id)}
                  className="rounded"
                />
                {tag.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Кейсы использования</legend>
          <div className="flex flex-wrap gap-2">
            {(allUseCases ?? []).map((uc) => (
              <label key={uc.id} className="flex items-center gap-1 rounded border px-2 py-1 text-sm cursor-pointer hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={form.use_case_ids.includes(uc.id)}
                  onChange={() => toggleArrayItem('use_case_ids', uc.id)}
                  className="rounded"
                />
                {uc.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/admin')}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </form>
    </div>
  );
}
