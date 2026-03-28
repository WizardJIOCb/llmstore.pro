import { Link, useParams } from 'react-router-dom';
import { useCatalogItemBySlug } from '../../hooks/useCatalog';
import { useCreateArticleComment, useDeleteArticleComment, useArticleComments } from '../../hooks/useComments';
import { useAuth } from '../../hooks/useAuth';
import { CatalogCard } from '../../components/catalog/CatalogCard';
import { CommentsSection } from '../../components/comments/CommentsSection';
import { Badge, Skeleton } from '../../components/ui';
import {
  pricingTypeLabels,
  deploymentTypeLabels,
  privacyTypeLabels,
  languageSupportLabels,
  difficultyLabels,
  readinessLabels,
} from '../../lib/label-maps';

export function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isAuthenticated, isAdmin } = useAuth();
  const { data: item, isLoading, error } = useCatalogItemBySlug(slug ?? '');
  const { data: comments = [], isLoading: commentsLoading } = useArticleComments(slug ?? '');
  const createComment = useCreateArticleComment(slug ?? '');
  const deleteComment = useDeleteArticleComment(slug ?? '');

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
        <p className="text-muted-foreground">Статья не найдена или была удалена.</p>
        <Link to="/articles" className="mt-4 inline-block text-primary hover:underline">
          К списку статей
        </Link>
      </div>
    );
  }

  const meta = item.meta_full;

  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">Главная</Link>
        {' / '}
        <Link to="/articles" className="hover:text-foreground">Статьи</Link>
        {' / '}
        <span className="text-foreground">{item.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h1 className="mb-4 text-3xl font-bold">{item.title}</h1>

          {item.short_description && (
            <p className="mb-6 text-lg text-muted-foreground">{item.short_description}</p>
          )}

          <div className="mb-6 flex flex-wrap gap-2">
            {item.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">#{tag.slug}</Badge>
            ))}
          </div>

          {item.full_description && (
            <div className="prose prose-sm max-w-none">
              {item.full_description.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}

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

        <div className="space-y-6">
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

          {item.author && (
            <div className="rounded-lg border p-6">
              <h3 className="mb-3 text-lg font-semibold">Автор</h3>
              <p className="text-sm">{item.author.name ?? item.author.username ?? 'Аноним'}</p>
            </div>
          )}
        </div>
      </div>

      {item.related_items.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-6 text-2xl font-bold">Похожие элементы</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {item.related_items.map((rel) => (
              <CatalogCard key={rel.id} item={rel} hrefOverride={`/article/${rel.slug}`} />
            ))}
          </div>
        </div>
      )}

      <CommentsSection
        comments={comments}
        isLoading={commentsLoading}
        isAuthenticated={isAuthenticated}
        isSubmitting={createComment.isPending}
        currentUserId={user?.id}
        canDeleteAny={isAdmin}
        onSubmit={(content) => createComment.mutateAsync(content)}
        onDelete={(commentId) => deleteComment.mutateAsync(commentId)}
      />
    </div>
  );
}
