import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/api-client';
import { chatsApi, type ChatAttachment, type CodingReport } from '../../lib/api/chats';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';

interface LegacySharedChat {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  agent_name: string;
}

interface V2SharedChat {
  chat: {
    id: string;
    title: string;
    mode: 'general' | 'agent';
    agent_name: string | null;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    usage?: Record<string, unknown> | null;
    created_at: string;
  }>;
}

interface SharedMessageItem {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: Record<string, unknown> | null;
  attachments?: ChatAttachment[];
}

interface SharedPageData {
  chatId?: string;
  title: string;
  subtitle: string;
  messages: SharedMessageItem[];
}

function downloadChatBundle(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify({ data: payload }, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getApiErrorMessage(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { error?: { message?: string } } } };
  return maybe?.response?.data?.error?.message;
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractCodingReportFromContent(content: string): CodingReport | null {
  const openMatch = content.match(/<dev-report>\s*/i);
  if (!openMatch || openMatch.index == null) return null;

  const payload = content.slice(openMatch.index + openMatch[0].length);
  const closeMatch = payload.match(/\s*<\/dev-report>/i);
  const candidate = closeMatch ? payload.slice(0, closeMatch.index) : payload;

  try {
    return JSON.parse(candidate) as CodingReport;
  } catch {
    const rescued = extractFirstJsonObject(candidate);
    if (!rescued) return null;
    try {
      return JSON.parse(rescued) as CodingReport;
    } catch {
      return null;
    }
  }
}

function extractCodingReport(value?: Record<string, unknown> | null, content?: string): CodingReport | null {
  if (value && value.coding_report && typeof value.coding_report === 'object') {
    return value.coding_report as CodingReport;
  }
  if (typeof content === 'string' && content.includes('<dev-report>')) {
    return extractCodingReportFromContent(content);
  }
  return null;
}

function extractAttachments(value?: Record<string, unknown> | null): ChatAttachment[] {
  if (!value || !Array.isArray((value as { attachments?: unknown[] }).attachments)) return [];
  return ((value as { attachments: unknown[] }).attachments ?? [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as ChatAttachment);
}

export function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: profile } = useProfile(isAuthenticated);
  const [isExporting, setIsExporting] = useState(false);
  const updateSharedPreviewMutation = useMutation({
    mutationFn: ({ messageId, ...payload }: { messageId: string; title?: string | null; html: string }) =>
      chatsApi.updateSharedPreview(token!, messageId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-chat-any', token],
    queryFn: async () => {
      if (!token) throw new Error('Token required');

      try {
        const v2 = await apiClient.get<{ data: V2SharedChat }>(`/shared/chats/${token}`);
        return {
          chatId: v2.data.data.chat.id,
          title: v2.data.data.chat.title,
          subtitle: 'Общий чат - только для чтения',
          messages: v2.data.data.messages.map((m): SharedMessageItem => ({
            id: m.id,
            role: m.role,
            content: m.content,
            usage: m.usage ?? null,
            attachments: extractAttachments(m.usage ?? null),
          })),
        };
      } catch {
        const legacy = await apiClient.get<{ data: LegacySharedChat }>(`/shared/chat/${token}`);
        return {
          title: legacy.data.data.agent_name,
          subtitle: 'Общий чат - только для чтения',
          messages: legacy.data.data.messages.map((m): SharedMessageItem => ({
            role: m.role,
            content: m.content,
          })),
        };
      }
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Чат не найден или ссылка недействительна</p>
      </div>
    );
  }

  const exportChat = async () => {
    if (!token) return;
    setIsExporting(true);
    try {
      const bundle = await chatsApi.exportSharedBundle(token);
      downloadChatBundle(bundle.filename, bundle.payload);
    } catch (err) {
      window.alert(getApiErrorMessage(err) ?? 'Не удалось экспортировать чат');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-xs text-muted-foreground">{data.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportChat} disabled={isExporting}>
          {isExporting ? 'Экспорт...' : 'Экспортировать чат'}
        </Button>
      </div>

      <div className="space-y-4">
        {data.messages.map((msg, i) => (
          <ChatMessage
            key={msg.id ?? i}
            role={msg.role}
            content={msg.content}
            attachments={msg.attachments ?? extractAttachments(msg.usage)}
            codingReport={msg.role === 'assistant' ? extractCodingReport(msg.usage, msg.content) : undefined}
            previewPageUrl={msg.role === 'assistant' && token && msg.id ? `/api/shared/chats/${token}/messages/${msg.id}/preview` : undefined}
            canEditPreview={Boolean(profile) && msg.role === 'assistant' && Boolean(msg.id)}
	            onSavePreview={profile && msg.role === 'assistant' && msg.id
	              ? async (payload) => {
	                const messageId = msg.id!;
                try {
                  await updateSharedPreviewMutation.mutateAsync({
                    messageId,
                    ...payload,
                  });
                } catch (error) {
                  const maybe = error as { response?: { data?: { error?: { message?: string } } } };
                  throw new Error(maybe?.response?.data?.error?.message ?? 'Не удалось сохранить preview');
	                }
	              }
	              : undefined}
	            canDeleteMessage={Boolean(profile) && Boolean(data.chatId) && Boolean(msg.id)}
		            onDeleteMessage={profile && data.chatId && msg.id
		              ? async () => {
		                try {
		                  await chatsApi.deleteMessage(data.chatId!, msg.id!);
		                  queryClient.invalidateQueries({ queryKey: ['shared-chat-any', token] });
		                } catch (error) {
	                  const maybe = error as { response?: { data?: { error?: { message?: string } } } };
	                  throw new Error(maybe?.response?.data?.error?.message ?? 'Не удалось удалить сообщение');
	                }
	              }
	              : undefined}
	          />
        ))}
      </div>

      {data.messages.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Чат пуст</p>
      )}
    </div>
  );
}
