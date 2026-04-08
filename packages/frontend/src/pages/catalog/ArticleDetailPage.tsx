import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, Clock, Eye, Flag, Heart, MessageSquare } from 'lucide-react';
import { useCatalogItemBySlug } from '../../hooks/useCatalog';
import { useArticleBookmark, useArticleBySlug, useArticleReaction, useArticleReport } from '../../hooks/useArticles';
import { useCreateArticleComment, useDeleteArticleComment, useArticleComments } from '../../hooks/useComments';
import { useCreateChat, usePublicAgentChats } from '../../hooks/useChats';
import { useAuth } from '../../hooks/useAuth';
import { CatalogCard } from '../../components/catalog/CatalogCard';
import { CommentsSection } from '../../components/comments/CommentsSection';
import { UserLink } from '../../components/users/UserLink';
import { Badge, Button, Select, Skeleton, Textarea } from '../../components/ui';
import { ArticleRichContent } from '../../components/articles/ArticleRichContent';
import { chatsApi, type ChatListItem } from '../../lib/api/chats';
import {
  pricingTypeLabels,
  deploymentTypeLabels,
  privacyTypeLabels,
  languageSupportLabels,
  difficultyLabels,
  readinessLabels,
} from '../../lib/label-maps';

const REPORT_OPTIONS = [
  { value: 'spam', label: 'Спам или мусор' },
  { value: 'abuse', label: 'Токсичный или опасный контент' },
  { value: 'broken', label: 'Битые ссылки или ложные обещания' },
  { value: 'copyright', label: 'Чужой контент или нарушение прав' },
  { value: 'other', label: 'Другая причина' },
];

function getSectionMeta(type?: string | null) {
  if (type === 'guide') {
    return {
      label: 'Гайды',
      href: '/guides',
      emptyLabel: 'Гайд',
    };
  }

  return {
    label: 'Статьи',
    href: '/articles',
    emptyLabel: 'Статья',
  };
}

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat('ru-RU').format(value ?? 0);
}

function getApiErrorMessage(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { message?: string } } } };
  return maybe?.response?.data?.error?.message;
}

function extractAgentIdFromCtaUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'https://llmstore.pro');
    const match = parsed.pathname.match(/^\/playground\/agent\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractLinkedAgentId(urls: Array<string | null | undefined>): string | null {
  for (const url of urls) {
    if (!url) continue;
    const agentId = extractAgentIdFromCtaUrl(url);
    if (agentId) return agentId;
  }
  return null;
}

export function ArticleDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const isArticleRoute = location.pathname.startsWith('/articles/') || location.pathname.startsWith('/article/');
  const { user, isAuthenticated, isAdmin } = useAuth();
  const createChat = useCreateChat();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('broken');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [chatActionError, setChatActionError] = useState<string | null>(null);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);

  const articleQuery = useArticleBySlug(isArticleRoute ? (slug ?? '') : '');
  const guideQuery = useCatalogItemBySlug(!isArticleRoute ? (slug ?? '') : '');
  const item = isArticleRoute ? articleQuery.data : guideQuery.data;
  const isLoading = isArticleRoute ? articleQuery.isLoading : guideQuery.isLoading;
  const error = isArticleRoute ? articleQuery.error : guideQuery.error;
  const draftMeta = item?.meta_full;
  const draftPrimaryCta = draftMeta?.primary_cta_label && draftMeta?.primary_cta_url
    ? { label: draftMeta.primary_cta_label, url: draftMeta.primary_cta_url }
    : null;
  const draftSecondaryCta = draftMeta?.secondary_cta_label && draftMeta?.secondary_cta_url
    ? { label: draftMeta.secondary_cta_label, url: draftMeta.secondary_cta_url }
    : null;
  const linkedAgentId = extractLinkedAgentId([draftPrimaryCta?.url, draftSecondaryCta?.url]);
  const publicAgentChatsQuery = usePublicAgentChats(linkedAgentId ?? '', Boolean(linkedAgentId));
  const linkedAgent = publicAgentChatsQuery.data?.agent ?? null;

  const { data: comments = [], isLoading: commentsLoading } = useArticleComments(slug ?? '');
  const createComment = useCreateArticleComment(slug ?? '');
  const deleteComment = useDeleteArticleComment(slug ?? '');
  const reactionMutation = useArticleReaction(slug ?? '');
  const bookmarkMutation = useArticleBookmark(slug ?? '');
  const reportMutation = useArticleReport(slug ?? '');

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="mb-4 h-8 w-1/3" />
        <Skeleton className="mb-2 h-4 w-1/2" />
        <Skeleton className="mb-8 h-64 w-full" />
      </div>
    );
  }

  const section = getSectionMeta(item?.type);

  if (error || !item) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold">Не найдено</h1>
        <p className="text-muted-foreground">{section.emptyLabel} не найден или был удалён.</p>
        <Link to={section.href} className="mt-4 inline-block text-primary hover:underline">
          К списку материалов
        </Link>
      </div>
    );
  }

  const meta = item.meta_full;
  const relatedHref = (type: string, itemSlug: string) => (type === 'guide' ? `/guides/${itemSlug}` : `/articles/${itemSlug}`);
  const primaryCta = draftPrimaryCta;
  const secondaryCta = draftSecondaryCta;

  const submitReport = async () => {
    await reportMutation.mutateAsync({
      reason: reportReason as 'spam' | 'abuse' | 'broken' | 'copyright' | 'other',
      details: reportDetails.trim() || undefined,
    });
    setReportSubmitted(true);
    setReportOpen(false);
    setReportDetails('');
  };

  const handleCtaClick = async (url: string) => {
    const agentId = extractAgentIdFromCtaUrl(url);

    if (!agentId) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    setChatActionError(null);

    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(window.location.href)}`);
      return;
    }

    if (pendingAgentId) return;
    setPendingAgentId(agentId);

    try {
      const cachedChats = queryClient.getQueryData<ChatListItem[]>(['chats']);
      const chatList = cachedChats ?? (
        await queryClient.fetchQuery<ChatListItem[]>({
          queryKey: ['chats'],
          queryFn: chatsApi.list,
        })
      );

      const existingChat = chatList.find((chat) => chat.mode === 'agent' && chat.agent_id === agentId);
      if (existingChat) {
        navigate(`/chats?chat=${existingChat.id}`);
        return;
      }

      const createdChat = await createChat.mutateAsync({
        mode: 'agent',
        title: 'Новый чат',
        agent_id: agentId,
      });

      navigate(`/chats?chat=${createdChat.id}`);
    } catch (actionError) {
      setChatActionError(
        getApiErrorMessage(actionError)
          ?? 'Не удалось открыть чат с этим агентом. Попробуйте ещё раз чуть позже.',
      );
    } finally {
      setPendingAgentId(null);
    }
  };

  const renderCtaButton = (
    cta: { label: string; url: string },
    variant?: 'outline',
  ) => {
    const agentId = extractAgentIdFromCtaUrl(cta.url);

    if (agentId) {
      const isPending = pendingAgentId === agentId;
      return (
        <Button
          variant={variant}
          disabled={isPending}
          onClick={() => void handleCtaClick(cta.url)}
        >
          {isPending ? 'Открываю чат...' : cta.label}
        </Button>
      );
    }

    return (
      <a href={cta.url} target="_blank" rel="noopener noreferrer">
        <Button variant={variant}>{cta.label}</Button>
      </a>
    );
  };

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Главная</Link>
          {' / '}
          <Link to={section.href} className="hover:text-foreground">{section.label}</Link>
          {' / '}
          <span className="text-foreground">{item.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{section.emptyLabel}</Badge>
                {item.featured && <Badge variant="warning">Featured</Badge>}
                {item.categories[0] && <Badge variant="outline">{item.categories[0].name}</Badge>}
              </div>

              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                {item.title}
              </h1>

              {item.short_description && (
                <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
                  {item.short_description}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-4 w-4" />
                  {formatCount(item.likes_count)}
                </span>
                {item.type === 'article' && (
                  <span className="inline-flex items-center gap-1">
                    <Bookmark className="h-4 w-4" />
                    {formatCount(item.bookmarks_count)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  {formatCount(item.comments_count)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {formatCount(item.views_count)}
                </span>
                {meta.reading_time_minutes && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {meta.reading_time_minutes} мин чтения
                  </span>
                )}
                {item.author && (
                  <span>
                    Автор:{' '}
                    <UserLink
                      username={item.author.username}
                      name={item.author.name}
                      fallback="Пользователь"
                      className="font-medium text-slate-700 hover:text-primary hover:underline"
                    />
                  </span>
                )}
              </div>

              {isArticleRoute && (
                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant={item.liked_by_me ? 'primary' : 'outline'}
                      disabled={!isAuthenticated || reactionMutation.isPending}
                      onClick={() => reactionMutation.mutate(Boolean(item.liked_by_me))}
                    >
                      {item.liked_by_me ? 'Убрать лайк' : 'Лайкнуть статью'}
                    </Button>
                    <Button
                      variant={item.bookmarked_by_me ? 'primary' : 'outline'}
                      disabled={!isAuthenticated || bookmarkMutation.isPending}
                      onClick={() => bookmarkMutation.mutate(Boolean(item.bookmarked_by_me))}
                    >
                      {item.bookmarked_by_me ? 'Убрать из закладок' : 'Сохранить в закладки'}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!isAuthenticated || reportMutation.isPending}
                      onClick={() => setReportOpen((current) => !current)}
                    >
                      <Flag className="h-4 w-4" />
                      Пожаловаться
                    </Button>
                  </div>

                  {!isAuthenticated && (
                    <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                      Войти, чтобы ставить лайки, сохранять статьи и отправлять жалобы
                    </Link>
                  )}

                  {reportSubmitted && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Жалоба отправлена. Мы сохранили сигнал для модерации и качества витрины.
                    </div>
                  )}

                  {reportOpen && isAuthenticated && (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <h2 className="text-lg font-semibold text-slate-950">Что не так с этой статьёй?</h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Жалоба не скрывает материал автоматически, но помогает быстро увидеть проблемные карточки и ссылки.
                      </p>
                      <div className="mt-4 grid gap-3">
                        <Select
                          options={REPORT_OPTIONS}
                          value={reportReason}
                          onChange={(event) => setReportReason(event.target.value)}
                        />
                        <Textarea
                          rows={4}
                          value={reportDetails}
                          onChange={(event) => setReportDetails(event.target.value)}
                          placeholder="Коротко опишите проблему, если нужен контекст"
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button disabled={reportMutation.isPending} onClick={() => void submitReport()}>
                            Отправить жалобу
                          </Button>
                          <Button variant="outline" onClick={() => setReportOpen(false)}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {item.hero_image_url && (
                <div className="mt-8 overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                  <img src={item.hero_image_url} alt={item.title} className="h-full w-full object-cover" />
                </div>
              )}

              <div className="mt-8 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">#{tag.slug}</Badge>
                ))}
              </div>

              <div className="mt-8">
                {item.type === 'article' ? (
                  <ArticleRichContent content={item.full_description} />
                ) : item.full_description ? (
                  <div className="prose prose-sm max-w-none">
                    {item.full_description.split('\n').map((line, index) => (
                      line.trim() ? <p key={index}>{line}</p> : <br key={index} />
                    ))}
                  </div>
                ) : null}
              </div>

              {(primaryCta || secondaryCta) && (
                <div className="mt-10 rounded-[28px] border border-sky-100 bg-sky-50/70 p-5">
                  <h2 className="text-lg font-semibold text-slate-950">Попробовать связку</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Если вам откликнулся сценарий из этой статьи, запустите агента или откройте приложенную связку прямо
                    после чтения.
                  </p>
                  {chatActionError && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {chatActionError}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    {primaryCta && renderCtaButton(primaryCta)}
                    {secondaryCta && renderCtaButton(secondaryCta, 'outline')}
                  </div>
                </div>
              )}
            </div>

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

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-950">Характеристики</h3>
              <dl className="space-y-3 text-sm">
                {meta.pricing_type && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Цена</dt>
                    <dd className="text-right font-medium">{pricingTypeLabels[meta.pricing_type]}</dd>
                  </div>
                )}
                {meta.deployment_type && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Deploy</dt>
                    <dd className="text-right font-medium">{deploymentTypeLabels[meta.deployment_type]}</dd>
                  </div>
                )}
                {meta.privacy_type && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Приватность</dt>
                    <dd className="text-right font-medium">{privacyTypeLabels[meta.privacy_type]}</dd>
                  </div>
                )}
                {meta.language_support && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Язык</dt>
                    <dd className="text-right font-medium">{languageSupportLabels[meta.language_support]}</dd>
                  </div>
                )}
                {meta.difficulty && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Уровень</dt>
                    <dd className="text-right font-medium">{difficultyLabels[meta.difficulty]}</dd>
                  </div>
                )}
                {meta.readiness && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Готовность</dt>
                    <dd className="text-right font-medium">{readinessLabels[meta.readiness]}</dd>
                  </div>
                )}
                {linkedAgentId && linkedAgent?.name && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Агент</dt>
                    <dd className="text-right font-medium">
                      <Link to={`/agents/${linkedAgentId}/chats`} className="text-primary hover:underline">
                        {linkedAgent.name}
                      </Link>
                    </dd>
                  </div>
                )}
                {linkedAgent?.model_label && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Модель</dt>
                    <dd className="text-right font-medium">
                      {linkedAgentId ? (
                        <Link to={`/agents/${linkedAgentId}/chats`} className="text-primary hover:underline">
                          {linkedAgent.model_label}
                        </Link>
                      ) : (
                        linkedAgent.model_label
                      )}
                    </dd>
                  </div>
                )}
                {linkedAgentId && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Режим</dt>
                    <dd className="text-right font-medium">Чат с агентом</dd>
                  </div>
                )}
                {linkedAgentId && linkedAgent && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Публичные чаты</dt>
                    <dd className="text-right font-medium">
                      <Link to={`/agents/${linkedAgentId}/chats`} className="text-primary hover:underline">
                        {formatCount(linkedAgent.public_chats_count)}
                      </Link>
                    </dd>
                  </div>
                )}
                {meta.vendor_name && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Источник</dt>
                    <dd className="text-right font-medium">{meta.vendor_name}</dd>
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
                    Исходный материал
                  </a>
                )}
              </div>
            </div>

            {item.categories.length > 0 && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-lg font-semibold text-slate-950">Категории</h3>
                <div className="flex flex-wrap gap-2">
                  {item.categories.map((cat) => (
                    <Badge key={cat.id} variant="outline">{cat.name}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {item.related_items.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-6 text-2xl font-bold">Похожие материалы</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {item.related_items.map((rel) => (
                <CatalogCard key={rel.id} item={rel} hrefOverride={relatedHref(rel.type, rel.slug)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
