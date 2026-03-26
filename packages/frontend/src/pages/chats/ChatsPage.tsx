import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatInput } from '../../components/agents/ChatInput';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { RunMetadata } from '../../components/agents/RunMetadata';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import {
  useChat,
  useChatAgents,
  useChatStats,
  useChatsList,
  useCreateChat,
  useDeleteChat,
  useSendChatMessage,
  useShareChatById,
  useUpdateChat,
} from '../../hooks/useChats';
import type { ChatListItem, ChatMessage as ChatMessageType } from '../../lib/api/chats';
import { cn } from '../../lib/utils';

const GENERAL_MODELS = [
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function extractUsage(value: Record<string, unknown> | null) {
  if (!value) return null;
  const prompt_tokens = typeof value.prompt_tokens === 'number' ? value.prompt_tokens : null;
  const completion_tokens = typeof value.completion_tokens === 'number' ? value.completion_tokens : null;
  const total_tokens = typeof value.total_tokens === 'number' ? value.total_tokens : null;
  if (prompt_tokens == null || completion_tokens == null || total_tokens == null) return null;

  return {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    estimated_cost: typeof value.estimated_cost === 'string' ? value.estimated_cost : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
  };
}

function extractToolNames(value: Record<string, unknown> | null): string[] {
  if (!value) return [];
  const raw = value.tool_names;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

type MenuItem = { kind: 'chat'; id: string } | null;

function getApiErrorCode(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { code?: string } } } };
  return maybe?.response?.data?.error?.code;
}

export function ChatsPage() {
  const { data: chats, isLoading: chatsLoading } = useChatsList();
  const { data: agents, isLoading: agentsLoading } = useChatAgents();
  const createChatMutation = useCreateChat();
  const updateChatMutation = useUpdateChat();
  const deleteChatMutation = useDeleteChat();
  const shareChatMutation = useShareChatById();
  const sendMessageMutation = useSendChatMessage();

  const [search, setSearch] = useState('');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuItem>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'general' | 'agent'>('general');
  const [newChatAgentId, setNewChatAgentId] = useState('');
  const [propertiesModel, setPropertiesModel] = useState('openai/gpt-4o-mini');
  const [propertiesSaving, setPropertiesSaving] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shareToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: activeChatData, isLoading: activeChatLoading } = useChat(activeChatId ?? undefined);
  const { data: activeChatStats, isLoading: chatStatsLoading } = useChatStats(
    activeChatId ?? undefined,
    isPropertiesOpen,
  );
  const activeChat = activeChatData?.chat ?? null;
  const messages = activeChatData?.messages ?? [];

  useEffect(() => {
    if (!activeChatId && chats && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!openMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendMessageMutation.isPending]);

  useEffect(() => {
    if (!isPropertiesOpen || !activeChat) return;
    setPropertiesModel(activeChat.model_external_id ?? 'openai/gpt-4o-mini');
  }, [isPropertiesOpen, activeChat]);

  useEffect(() => {
    return () => {
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
    };
  }, []);

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    if (!search.trim()) return chats;
    const q = search.trim().toLowerCase();
    return chats.filter((chat) => {
      const title = (chat.title || '').toLowerCase();
      const preview = (chat.last_message_preview || '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [chats, search]);

  const draftChats = filteredChats.filter((chat) => chat.message_count === 0);
  const regularChats = filteredChats.filter((chat) => chat.message_count > 0);

  const modeOptions = useMemo(
    () => [
      { value: 'general', label: 'Общение' },
      ...(agents ?? []).map((agent) => ({ value: `agent:${agent.id}`, label: `Агент: ${agent.name}` })),
    ],
    [agents],
  );

  const activeModeValue = useMemo(() => {
    if (!activeChat) return '';
    if (activeChat.mode === 'general') return 'general';
    return activeChat.agent_id ? `agent:${activeChat.agent_id}` : 'general';
  }, [activeChat]);

  const activeAgentListMeta = useMemo(() => {
    if (!activeChat?.agent_id) return null;
    return (agents ?? []).find((a) => a.id === activeChat.agent_id) ?? null;
  }, [activeChat?.agent_id, agents]);

  const activeAgentName = activeChatData?.chat.agent_name ?? activeAgentListMeta?.name ?? null;
  const activeAgentDescription =
    activeChatData?.chat.agent_chat_description
    ?? activeAgentListMeta?.chat_description
    ?? activeAgentListMeta?.description
    ?? null;
  const activeStarterPrompts =
    activeChatData?.chat.agent_starter_prompts
    ?? activeAgentListMeta?.starter_prompts
    ?? [];

  const sidebarLoading = chatsLoading || agentsLoading;

  const createNewChat = async () => setIsCreateDialogOpen(true);

  const createChatFromDialog = async () => {
    setLocalError(null);
    if (newChatMode === 'agent' && !newChatAgentId) {
      setLocalError('Выберите агента для нового чата');
      return;
    }

    try {
      const created = await createChatMutation.mutateAsync({
        mode: newChatMode,
        title: 'Новый чат',
        agent_id: newChatMode === 'agent' ? newChatAgentId : null,
      });
      setActiveChatId(created.id);
      setIsCreateDialogOpen(false);
      setNewChatMode('general');
      setNewChatAgentId('');
    } catch {
      setLocalError('Не удалось создать чат');
    }
  };

  const renameChat = async (chat: ChatListItem) => {
    const next = window.prompt('Новое имя чата', chat.title);
    if (!next) return;
    const title = next.trim();
    if (!title) return;
    setLocalError(null);
    try {
      await updateChatMutation.mutateAsync({ chatId: chat.id, title });
    } catch {
      setLocalError('Не удалось переименовать чат');
    } finally {
      setOpenMenu(null);
    }
  };

  const deleteChat = async (chatId: string) => {
    setLocalError(null);
    try {
      await deleteChatMutation.mutateAsync(chatId);
      if (activeChatId === chatId) setActiveChatId(null);
    } catch {
      setLocalError('Не удалось удалить чат');
    } finally {
      setOpenMenu(null);
    }
  };

  const shareChat = async (chatId: string) => {
    setLocalError(null);
    try {
      const { share_token } = await shareChatMutation.mutateAsync(chatId);
      const url = `${window.location.origin}/shared/chats/${share_token}`;
      await navigator.clipboard.writeText(url);
      setShareToastVisible(true);
      if (shareToastTimerRef.current) clearTimeout(shareToastTimerRef.current);
      shareToastTimerRef.current = setTimeout(() => setShareToastVisible(false), 2000);
    } catch {
      setLocalError('Не удалось поделиться чатом');
    } finally {
      setOpenMenu(null);
    }
  };

  const openProperties = (chatId: string) => {
    setActiveChatId(chatId);
    setOpenMenu(null);
    setIsPropertiesOpen(true);
  };

  const saveProperties = async () => {
    if (!activeChat) return;
    setLocalError(null);
    setPropertiesSaving(true);
    try {
      await updateChatMutation.mutateAsync({
        chatId: activeChat.id,
        model_external_id: propertiesModel,
      });
      setIsPropertiesOpen(false);
    } catch {
      setLocalError('Не удалось сохранить свойства чата');
    } finally {
      setPropertiesSaving(false);
    }
  };

  const handleModeChange = async (value: string) => {
    if (!activeChat) return;
    setLocalError(null);
    try {
      if (value === 'general') {
        await updateChatMutation.mutateAsync({ chatId: activeChat.id, mode: 'general', agent_id: null });
        return;
      }
      if (value.startsWith('agent:')) {
        await updateChatMutation.mutateAsync({
          chatId: activeChat.id,
          mode: 'agent',
          agent_id: value.replace('agent:', ''),
        });
      }
    } catch {
      setLocalError('Не удалось изменить режим чата');
    }
  };

  const sendMessage = async (content: string) => {
    if (!activeChat) return;
    setLocalError(null);
    try {
      await sendMessageMutation.mutateAsync({ chatId: activeChat.id, content });
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === 'INSUFFICIENT_BALANCE') {
        setIsTopUpOpen(true);
        setLocalError('Недостаточно баланса');
        return;
      }
      setLocalError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    }
  };

  const renderChatRow = (chat: ChatListItem) => (
    <div
      key={chat.id}
      className={cn(
        'relative rounded-md px-2 py-2 transition-colors',
        activeChatId === chat.id ? 'bg-accent text-foreground' : 'hover:bg-accent/60',
      )}
    >
      <button type="button" onClick={() => setActiveChatId(chat.id)} className="w-full pr-8 text-left">
        <p className="truncate text-sm font-medium">{chat.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {chat.last_message_preview || (chat.mode === 'general' ? 'Общение' : 'Чат с ботом')}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(chat.last_message_at)}</p>
      </button>

      <div className="absolute right-2 top-2" ref={openMenu?.kind === 'chat' && openMenu.id === chat.id ? menuRef : null}>
        <button
          type="button"
          className="h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenu((prev) => (prev?.kind === 'chat' && prev.id === chat.id ? null : { kind: 'chat', id: chat.id }));
          }}
          aria-label="Действия чата"
        >
          ...
        </button>
        {openMenu?.kind === 'chat' && openMenu.id === chat.id && (
          <div className="absolute right-0 top-8 z-20 w-44 rounded-md border bg-white p-1 shadow-lg">
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => renameChat(chat)}>
              Переименовать
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => openProperties(chat.id)}>
              Свойства
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => deleteChat(chat.id)}>
              Удалить
            </button>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => shareChat(chat.id)}>
              Поделиться
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="px-4 py-6">
      <div className={cn('pointer-events-none fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-500', shareToastVisible ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0')}>
        Ссылка скопирована
      </div>

      <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-7xl overflow-hidden rounded-xl border bg-white">
        <aside className="flex w-full max-w-xs shrink-0 flex-col border-r">
          <div className="border-b p-3 space-y-3">
            <Button className="w-full" onClick={createNewChat} disabled={createChatMutation.isPending}>Новый чат</Button>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск чата..." />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {sidebarLoading && <div className="flex justify-center py-8"><Spinner /></div>}
            {!sidebarLoading && draftChats.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Черновики</p>{draftChats.map(renderChatRow)}</section>}
            {!sidebarLoading && regularChats.length > 0 && <section className="space-y-1"><p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Чаты</p>{regularChats.map(renderChatRow)}</section>}
            {!sidebarLoading && (!chats || chats.length === 0) && <div className="p-2 text-sm text-muted-foreground space-y-2"><p>У вас пока нет чатов.</p><button type="button" className="text-primary hover:underline" onClick={createNewChat}>Создать первый чат</button></div>}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate font-semibold">{activeChat?.title ?? 'Чаты'}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {activeChat?.mode === 'general'
                  ? `OpenRouter: ${activeChat?.model_external_id ?? 'openai/gpt-4o-mini'}`
                  : activeAgentName
                    ? `Агент: ${activeAgentName}`
                    : 'Чат с агентом'}
              </p>
            </div>
            {activeChat && <Select options={modeOptions} value={activeModeValue} onChange={(e) => handleModeChange(e.target.value)} className="w-64" />}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {(activeChatLoading || sendMessageMutation.isPending) && messages.length === 0 && <div className="flex justify-center py-8"><Spinner /></div>}
            {!activeChatLoading && activeChat && messages.length === 0 && (
              <div className="py-8">
                {activeChat.mode === 'agent' && (activeAgentName || activeStarterPrompts.length > 0 || activeAgentDescription) ? (
                  <div className="mx-auto max-w-3xl rounded-xl border bg-muted/20 p-5 space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">{activeAgentName ?? 'Агент'}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeAgentDescription || 'Опишите задачу агенту простыми словами, и он начнет работу.'}
                      </p>
                    </div>
                    {activeStarterPrompts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Примеры сообщений</p>
                        <div className="flex flex-wrap gap-2">
                          {activeStarterPrompts.map((prompt, idx) => (
                            <Button key={`${prompt}-${idx}`} type="button" variant="outline" size="sm" disabled={sendMessageMutation.isPending} onClick={() => sendMessage(prompt)}>
                              {prompt}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">История пока пустая. Отправьте первое сообщение.</div>
                )}
              </div>
            )}
            {!activeChatLoading && !activeChat && <div className="py-12 text-center text-muted-foreground">Выберите чат слева или создайте новый.</div>}
            {messages.map((msg: ChatMessageType) => (
              <div key={msg.id}>
                <ChatMessage role={msg.role} content={msg.content} />
                {msg.role === 'assistant' && (
                  <div className="mt-1 ml-1">
                    <RunMetadata
                      usage={extractUsage(msg.usage)}
                      latencyMs={msg.latency_ms ?? undefined}
                      agentName={activeChat?.mode === 'agent' ? (activeAgentName ?? undefined) : undefined}
                      toolNames={extractToolNames(msg.usage)}
                    />
                  </div>
                )}
              </div>
            ))}
            {sendMessageMutation.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Думаю...</div>}
            <div ref={messagesEndRef} />
          </div>

          {localError && <div className="border-t px-4 py-2 text-sm text-destructive bg-destructive/10">{localError}</div>}

          <div className="border-t px-4 py-3 space-y-3">
            {activeChat?.mode === 'agent' && activeStarterPrompts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeStarterPrompts.map((prompt, idx) => (
                  <Button key={`quick-${prompt}-${idx}`} type="button" variant="outline" size="sm" disabled={sendMessageMutation.isPending} onClick={() => sendMessage(prompt)}>
                    {prompt}
                  </Button>
                ))}
              </div>
            )}
            <ChatInput onSend={sendMessage} disabled={!activeChat || sendMessageMutation.isPending} placeholder={activeChat ? 'Введите сообщение...' : 'Сначала выберите чат'} />
          </div>
        </section>
      </div>

      {isTopUpOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsTopUpOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-5 py-4"><h3 className="text-lg font-semibold">Недостаточно баланса</h3></div>
            <div className="px-5 py-4 space-y-3"><p className="text-sm text-muted-foreground">Чтобы продолжить общение в чатах и с агентами, пополните баланс.</p><div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">Попросите у Родиона</div></div>
            <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsTopUpOpen(false)}>Закрыть</Button>
              <Link to="/profile" onClick={() => setIsTopUpOpen(false)}><Button size="sm">Открыть профиль</Button></Link>
            </div>
          </div>
        </div>
      )}

      {isCreateDialogOpen && (
        <div
          className="fixed inset-0 z-[86] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsCreateDialogOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-6 py-5">
              <h3 className="text-xl font-semibold">Новый чат</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Выберите режим, чтобы начать диалог.
              </p>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                <p className="text-sm font-medium">Режим чата</p>
                <Select
                  value={newChatMode}
                  onChange={(e) => setNewChatMode(e.target.value as 'general' | 'agent')}
                  options={[
                    { value: 'general', label: 'Общение через OpenRouter' },
                    { value: 'agent', label: 'Чат с агентом' },
                  ]}
                  className="w-full"
                />
              </div>

              {newChatMode === 'agent' && (
                <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                  <p className="text-sm font-medium">Выберите агента</p>
                  <Select
                    value={newChatAgentId}
                    onChange={(e) => setNewChatAgentId(e.target.value)}
                    options={[
                      { value: '', label: 'Выберите агента...' },
                      ...(agents ?? []).map((agent) => ({
                        value: agent.id,
                        label: agent.is_owner ? `${agent.name} (мой)` : `${agent.name} (общий)`,
                      })),
                    ]}
                    className="w-full"
                  />
                  {(agents ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Сейчас нет доступных активных агентов.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-end gap-2 bg-muted/10 rounded-b-2xl">
              <Button variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={createChatFromDialog}
                disabled={createChatMutation.isPending || (newChatMode === 'agent' && !newChatAgentId)}
              >
                {createChatMutation.isPending ? 'Создаю...' : 'Создать чат'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {isPropertiesOpen && activeChat && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsPropertiesOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl border bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-5 py-4 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold">Свойства чата</h2><p className="text-sm text-muted-foreground">{activeChat.title}</p></div>
              <Button variant="ghost" size="sm" onClick={() => setIsPropertiesOpen(false)}>Закрыть</Button>
            </div>
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Режим</p><p className="text-sm font-medium">{activeChat.mode === 'general' ? 'Общение' : 'Бот'}</p></div>
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Агент</p><p className="text-sm font-medium">{activeChatStats?.chat.agent_name ?? '—'}</p></div>
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Создан</p><p className="text-sm font-medium">{formatDate(activeChat.created_at)}</p></div>
                <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Обновлен</p><p className="text-sm font-medium">{formatDate(activeChat.updated_at)}</p></div>
              </div>
              <div className="space-y-2"><p className="text-sm font-medium">Модель OpenRouter</p><Select options={GENERAL_MODELS} value={propertiesModel} onChange={(e) => setPropertiesModel(e.target.value)} className="w-full max-w-md" /></div>
              {chatStatsLoading ? <div className="flex justify-center py-6"><Spinner /></div> : null}
            </div>
            <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsPropertiesOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={saveProperties} disabled={propertiesSaving}>{propertiesSaving ? 'Сохраняю...' : 'Сохранить'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

