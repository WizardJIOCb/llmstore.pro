import { useRef, useEffect, useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAgent, useStartRun, useChatHistory, useShareChat, useClearChat } from '../../hooks/useAgents';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useProfile } from '../../hooks/useProfile';
import { usePlaygroundStore } from '../../stores/playground-store';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { ChatInput } from '../../components/agents/ChatInput';
import { ToolTracePanel } from '../../components/agents/ToolTracePanel';
import { RunMetadata } from '../../components/agents/RunMetadata';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import type { ToolTrace } from '../../lib/api/agents';
import { TopUpHelp } from '../../components/billing/TopUpHelp';

function getApiErrorCode(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
  return maybe?.response?.data?.error?.code;
}

function getApiErrorMessage(err: unknown): string | undefined {
  const maybe = err as { response?: { data?: { error?: { message?: string } } } };
  return maybe?.response?.data?.error?.message;
}

export function AgentPlaygroundPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading } = useAgent(id);
  const { data: chatHistory, isLoading: historyLoading } = useChatHistory(id);
  const { data: appSettings } = useAppSettings();
  const { data: profile } = useProfile();
  const startRun = useStartRun();
  const shareChatMutation = useShareChat();
  const clearChatMutation = useClearChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shareLabel, setShareLabel] = useState('Поделиться');
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  const {
    messages,
    isRunning,
    error,
    historyLoaded,
    addUserMessage,
    addAssistantMessage,
    setMessages,
    setRunning,
    setError,
    clearMessages,
  } = usePlaygroundStore();

  useEffect(() => {
    if (chatHistory?.messages && chatHistory.messages.length > 0 && !historyLoaded) {
      const mapped = chatHistory.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        toolTraces: m.toolTraces,
        runId: m.runId,
        usage: m.usage,
        latencyMs: m.latencyMs,
        codingReport: m.codingReport,
      }));
      setMessages(mapped);
    } else if (chatHistory && chatHistory.messages.length === 0 && !historyLoaded) {
      setMessages([]);
    }
  }, [chatHistory, historyLoaded, setMessages]);

  useEffect(() => {
    return () => {
      clearMessages();
    };
  }, [id, clearMessages]);

  const allToolTraces = messages.reduce<ToolTrace[]>((acc, msg) => {
    if (msg.toolTraces) acc.push(...msg.toolTraces);
    return acc;
  }, []);
  const hasAvailableBalance = profile ? Number(profile.balance_usd) > 0 : true;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (content: string) => {
    if (!id || isRunning) return;
    if (!hasAvailableBalance) {
      setIsTopUpOpen(true);
      setError('У вас не осталось баланса. Скоро вы сможете пополнить его на сайте, а пока можете написать Родиону.');
      return;
    }

    addUserMessage(content);
    setRunning(true);
    setError(null);

    const allMsgs = [
      ...messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content },
    ];

    try {
      const result = await startRun.mutateAsync({
        agentId: id,
        messages: allMsgs,
      });

      addAssistantMessage(result.output || '(пустой ответ)', {
        toolTraces: result.tool_traces,
        runId: result.run_id,
        usage: result.usage,
        latencyMs: result.latency_ms,
        codingReport: result.coding_report,
      });
    } catch (err) {
      const code = getApiErrorCode(err);
      const apiMessage = getApiErrorMessage(err);
      if (code === 'INSUFFICIENT_BALANCE') {
        setMessages(messages);
        setIsTopUpOpen(true);
        setError(apiMessage || 'У вас не осталось баланса. Скоро вы сможете пополнить его на сайте.');
      } else {
        const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
        setError(msg);
      }
    } finally {
      setRunning(false);
    }
  }, [id, isRunning, hasAvailableBalance, messages, addUserMessage, addAssistantMessage, setMessages, setRunning, setError, startRun]);

  const handleShare = useCallback(async () => {
    if (!id) return;
    try {
      const { share_token } = await shareChatMutation.mutateAsync(id);
      const url = `${window.location.origin}/shared/chat/${share_token}`;
      await navigator.clipboard.writeText(url);
      setShareLabel('Скопировано!');
      setTimeout(() => setShareLabel('Поделиться'), 2000);
    } catch {
      setShareLabel('Ошибка');
      setTimeout(() => setShareLabel('Поделиться'), 2000);
    }
  }, [id, shareChatMutation]);

  const handleClear = useCallback(async () => {
    if (!id) return;
    clearMessages();
    try {
      await clearChatMutation.mutateAsync(id);
    } catch {
      // local state already cleared
    }
  }, [id, clearMessages, clearChatMutation]);

  if (isLoading || historyLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Агент не найден</p>
      </div>
    );
  }

  const starterPrompts = (() => {
    const config = agent.version?.runtime_config as { starter_prompts?: unknown } | null | undefined;
    if (!config || !Array.isArray(config.starter_prompts)) return [];
    return config.starter_prompts.filter((prompt): prompt is string => (
      typeof prompt === 'string' && prompt.trim().length > 0
    ));
  })();

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">{agent.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                disabled={shareChatMutation.isPending}
              >
                {shareLabel}
              </Button>
            )}
            <Link to={`/builder/agent/${agent.id}`}>
              <Button variant="outline" size="sm">Настройки</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Очистить
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">
                Отправьте сообщение или выберите быстрое действие
              </p>
              {starterPrompts.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {starterPrompts.map((prompt, idx) => (
                    <Button
                      key={`${prompt}-${idx}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSend(prompt)}
                      disabled={isRunning || !hasAvailableBalance}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              <ChatMessage
                role={msg.role}
                content={msg.content}
                toolTraces={msg.toolTraces}
                codingReport={msg.codingReport}
              />
              {msg.role === 'assistant' && msg.usage && (
                <div className="mt-1 ml-1">
                  <RunMetadata usage={msg.usage} latencyMs={msg.latencyMs} />
                </div>
              )}
            </div>
          ))}

          {isRunning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Думаю...
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t px-4 py-3 space-y-2">
          {messages.length > 0 && starterPrompts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((prompt, idx) => (
                <Button
                  key={`quick-${prompt}-${idx}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSend(prompt)}
                  disabled={isRunning || !hasAvailableBalance}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          )}
          {!hasAvailableBalance && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <TopUpHelp settings={appSettings} />
              <div className="mt-3">
                <Link to="/profile">
                  <Button size="sm">Открыть профиль</Button>
                </Link>
              </div>
            </div>
          )}
          <ChatInput
            onSend={handleSend}
            disabled={isRunning || !hasAvailableBalance}
            placeholder={hasAvailableBalance ? 'Введите сообщение...' : 'Баланс закончился'}
          />
        </div>
      </div>

      <div className="hidden w-80 shrink-0 border-l lg:flex flex-col">
        <div className="shrink-0 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Инструменты</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <ToolTracePanel traces={allToolTraces} />
        </div>
      </div>

      {isTopUpOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsTopUpOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-5 py-4">
              <h3 className="text-lg font-semibold">Недостаточно баланса</h3>
            </div>
            <div className="px-5 py-4">
              <TopUpHelp settings={appSettings} />
            </div>
            <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsTopUpOpen(false)}>
                Закрыть
              </Button>
              <Link to="/profile" onClick={() => setIsTopUpOpen(false)}>
                <Button size="sm">Открыть профиль</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
