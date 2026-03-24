import { useRef, useEffect, useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAgent, useStartRun, useChatHistory, useShareChat, useClearChat } from '../../hooks/useAgents';
import { usePlaygroundStore } from '../../stores/playground-store';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { ChatInput } from '../../components/agents/ChatInput';
import { ToolTracePanel } from '../../components/agents/ToolTracePanel';
import { QuickActions } from '../../components/agents/QuickActions';
import { RunMetadata } from '../../components/agents/RunMetadata';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import type { ToolTrace } from '../../lib/api/agents';

export function AgentPlaygroundPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading } = useAgent(id);
  const { data: chatHistory, isLoading: historyLoading } = useChatHistory(id);
  const startRun = useStartRun();
  const shareChatMutation = useShareChat();
  const clearChatMutation = useClearChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shareLabel, setShareLabel] = useState('Поделиться');

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

  // Seed store from chat history on first load
  useEffect(() => {
    if (chatHistory?.messages && chatHistory.messages.length > 0 && !historyLoaded) {
      const mapped = chatHistory.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        toolTraces: m.toolTraces,
        runId: m.runId,
        usage: m.usage,
        latencyMs: m.latencyMs,
      }));
      setMessages(mapped);
    } else if (chatHistory && chatHistory.messages.length === 0 && !historyLoaded) {
      setMessages([]);
    }
  }, [chatHistory, historyLoaded, setMessages]);

  // Clear store when navigating away (different agent)
  useEffect(() => {
    return () => {
      clearMessages();
    };
  }, [id, clearMessages]);

  // Collect all tool traces from messages
  const allToolTraces = messages.reduce<ToolTrace[]>((acc, msg) => {
    if (msg.toolTraces) acc.push(...msg.toolTraces);
    return acc;
  }, []);

  // Last assistant message metadata
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (content: string) => {
    if (!id || isRunning) return;

    addUserMessage(content);
    setRunning(true);
    setError(null);

    // Build full conversation history for the run
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
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [id, isRunning, messages, addUserMessage, addAssistantMessage, setRunning, setError, startRun]);

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
      // Silently fail — local state is already cleared
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

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center justify-between shrink-0">
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-4">
              <p className="text-muted-foreground">
                Отправьте сообщение или выберите быстрое действие
              </p>
              <QuickActions onSelect={handleSend} disabled={isRunning} />
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              <ChatMessage role={msg.role} content={msg.content} />
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
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3 shrink-0 space-y-2">
          {messages.length > 0 && (
            <QuickActions onSelect={handleSend} disabled={isRunning} />
          )}
          <ChatInput onSend={handleSend} disabled={isRunning} />
        </div>
      </div>

      {/* Tool trace sidebar */}
      <div className="hidden lg:flex w-80 border-l flex-col shrink-0">
        <div className="border-b px-4 py-3 shrink-0">
          <h2 className="font-semibold text-sm">Инструменты</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <ToolTracePanel traces={allToolTraces} />
        </div>
      </div>
    </div>
  );
}
