import { Link, useSearchParams } from 'react-router-dom';
import { Bot, Clock3, Eye, MessageSquare } from 'lucide-react';
import { usePublicModelChats } from '../../hooks/useChats';
import { Badge, Button, Skeleton } from '../../components/ui';

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat('ru-RU').format(value ?? 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ModelPublicChatsPage() {
  const [searchParams] = useSearchParams();
  const modelExternalId = searchParams.get('model')?.trim() ?? '';
  const { data, isLoading, error } = usePublicModelChats(modelExternalId, Boolean(modelExternalId));

  if (!modelExternalId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6">
        <h1 className="text-3xl font-semibold text-slate-950">Модель не выбрана</h1>
        <p className="mt-3 text-slate-600">
          В ссылке не хватает параметра модели, поэтому мы не знаем, какие публичные чаты показать.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <Skeleton className="mb-4 h-8 w-72" />
        <Skeleton className="mb-8 h-4 w-[32rem]" />
        <div className="grid gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6">
        <h1 className="text-3xl font-semibold text-slate-950">Чаты по модели не найдены</h1>
        <p className="mt-3 text-slate-600">
          Не получилось загрузить публичные переписки для этой модели.
        </p>
      </div>
    );
  }

  const title = data.model.model_label ?? data.model.model_external_id;

  return (
    <div className="bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)]">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Главная</Link>
          {' / '}
          <Link to="/models" className="hover:text-foreground">Модели</Link>
          {' / '}
          <span className="text-foreground">Чаты по модели</span>
        </nav>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Публичные чаты по модели</Badge>
            <Badge variant="outline">{data.model.model_external_id}</Badge>
          </div>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            {title}
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
            Здесь собраны открытые переписки с агентами, которые работают на этой модели. Можно быстро посмотреть реальные сценарии,
            открыть публичный чат и перейти к агентам, использующим тот же движок.
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {formatCount(data.model.public_chats_count)} открытых чатов
            </span>
            <span className="inline-flex items-center gap-1">
              <Bot className="h-4 w-4" />
              {formatCount(data.model.agents_count)} агентов
            </span>
          </div>
        </section>

        <section className="mt-8">
          {data.chats.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-950">Пока нет открытых переписок</h2>
              <p className="mt-3 text-slate-600">
                Как только кто-то откроет чат с агентом на этой модели для публичного просмотра, он появится здесь.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {data.chats.map((chat) => (
                <article key={chat.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {chat.agent_name && chat.agent_id && (
                          <Link
                            to={`/agents/${chat.agent_id}/chats`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {chat.agent_name}
                          </Link>
                        )}
                      </div>

                      <h2 className="mt-2 text-xl font-semibold text-slate-950">
                        <Link to={chat.chat_url} className="hover:text-primary hover:underline">
                          {chat.title}
                        </Link>
                      </h2>

                      <p className="mt-2 text-sm text-slate-500">
                        Автор: {chat.owner_username ? `@${chat.owner_username}` : chat.owner_name}
                      </p>

                      {chat.last_message_preview && (
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                          {chat.last_message_preview}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link to={chat.chat_url}>
                        <Button>Открыть чат</Button>
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      {formatCount(chat.message_count)} сообщений
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {formatCount(chat.unique_view_count)} просмотров
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-4 w-4" />
                      Обновлён {formatDate(chat.last_message_at)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
