import { useParams, Link } from 'react-router-dom';
import type { ContentType } from '@llmstore/shared';
import { useCatalogItem } from '../../hooks/useCatalog';
import { CatalogCard } from '../../components/catalog/CatalogCard';
import { Badge, Skeleton, Spinner } from '../../components/ui';
import {
  contentTypeLabels, pricingTypeLabels, deploymentTypeLabels,
  privacyTypeLabels, languageSupportLabels, difficultyLabels, readinessLabels,
} from '../../lib/label-maps';

interface Props {
  type: ContentType;
}

export function CatalogDetailPage({ type }: Props) {
  const { slug } = useParams<{ slug: string }>();
  const { data: item, isLoading, error } = useCatalogItem(type, slug ?? '');

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="mb-4 h-8 w-1/3" />
        <Skeleton className="mb-2 h-4 w-1/2" />
        <Skeleton className="mb-8 h-64 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold">Не найдено</h1>
        <p className="text-muted-foreground">Элемент каталога не найден или был удалён.</p>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">
          На главную
        </Link>
      </div>
    );
  }

  const meta = item.meta_full;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">Главная</Link>
        {' / '}
        <span>{contentTypeLabels[item.type] ?? item.type}</span>
        {' / '}
        <span className="text-foreground">{item.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2">
          <h1 className="mb-4 text-3xl font-bold">{item.title}</h1>

          {item.short_description && (
            <p className="mb-6 text-lg text-muted-foreground">{item.short_description}</p>
          )}

          {/* Tags */}
          <div className="mb-6 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">#{tag.slug}</Badge>
            ))}
          </div>

          {/* Full description */}
          {item.full_description && (
            <div className="prose prose-sm max-w-none">
              {item.full_description.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

          {/* Use cases */}
          {item.use_cases.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Сценарии использования</h2>
              <div className="flex flex-wrap gap-2">
                {item.use_cases.map((uc) => (
                  <Badge key={uc.id} variant="outline">{uc.name}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Meta info card */}
          <div className="rounded-lg border p-6">
            <h3 className="mb-4 text-lg font-semibold">Характеристики</h3>
            <dl className="space-y-3 text-sm">
              {meta.pricing_type && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Цена</dt>
                  <dd className="font-medium">{pricingTypeLabels[meta.pricing_type]}</dd>
                </div>
              )}
              {meta.deployment_type && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Deploy</dt>
                  <dd className="font-medium">{deploymentTypeLabels[meta.deployment_type]}</dd>
                </div>
              )}
              {meta.privacy_type && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Приватность</dt>
                  <dd className="font-medium">{privacyTypeLabels[meta.privacy_type]}</dd>
                </div>
              )}
              {meta.language_support && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Язык</dt>
                  <dd className="font-medium">{languageSupportLabels[meta.language_support]}</dd>
                </div>
              )}
              {meta.difficulty && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Уровень</dt>
                  <dd className="font-medium">{difficultyLabels[meta.difficulty]}</dd>
                </div>
              )}
              {meta.readiness && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Готовность</dt>
                  <dd className="font-medium">{readinessLabels[meta.readiness]}</dd>
                </div>
              )}
              {meta.vendor_name && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Вендор</dt>
                  <dd className="font-medium">{meta.vendor_name}</dd>
                </div>
              )}
            </dl>

            {/* Links */}
            <div className="mt-4 space-y-2">
              {meta.website_url && (
                <a href={meta.website_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
                  Сайт
                </a>
              )}
              {meta.docs_url && (
                <a href={meta.docs_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
                  Документация
                </a>
              )}
              {meta.github_url && (
                <a href={meta.github_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
                  GitHub
                </a>
              )}
              {meta.source_url && (
                <a href={meta.source_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
                  Исходный код
                </a>
              )}
            </div>
          </div>

          {/* Categories */}
          {item.categories.length > 0 && (
            <div className="rounded-lg border p-6">
              <h3 className="mb-3 text-lg font-semibold">Категории</h3>
              <div className="flex flex-wrap gap-2">
                {item.categories.map((cat) => (
                  <Badge key={cat.id} variant="outline">{cat.name}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Author */}
          {item.author && (
            <div className="rounded-lg border p-6">
              <h3 className="mb-3 text-lg font-semibold">Автор</h3>
              <p className="text-sm">{item.author.name ?? item.author.username ?? 'Аноним'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Related items */}
      {item.related_items.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-6 text-2xl font-bold">Похожие элементы</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {item.related_items.map((rel) => (
              <CatalogCard key={rel.id} item={rel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
