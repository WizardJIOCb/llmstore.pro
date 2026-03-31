import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { Spinner } from '../../components/ui/Spinner';
import { apiClient } from '../../lib/api-client';
import type { CodingReport } from '../../lib/api/chats';

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

export function SharedChatPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-chat-any', token],
    queryFn: async () => {
      if (!token) throw new Error('Token required');

      try {
        const v2 = await apiClient.get<{ data: V2SharedChat }>(`/shared/chats/${token}`);
        return {
          title: v2.data.data.chat.title,
          subtitle: 'Общий чат - только для чтения',
          messages: v2.data.data.messages.map((m): SharedMessageItem => ({
            id: m.id,
            role: m.role,
            content: m.content,
            usage: m.usage ?? null,
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

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{data.title}</h1>
        <p className="text-xs text-muted-foreground">{data.subtitle}</p>
      </div>

      <div className="space-y-4">
        {data.messages.map((msg, i) => (
          <ChatMessage
            key={msg.id ?? i}
            role={msg.role}
            content={msg.content}
            codingReport={msg.role === 'assistant' ? extractCodingReport(msg.usage, msg.content) : undefined}
            previewPageUrl={msg.role === 'assistant' && token && msg.id ? `/api/shared/chats/${token}/messages/${msg.id}/preview` : undefined}
          />
        ))}
      </div>

      {data.messages.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">Чат пуст</p>
      )}
    </div>
  );
}
