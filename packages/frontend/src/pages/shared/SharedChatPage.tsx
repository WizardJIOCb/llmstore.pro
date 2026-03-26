import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { Spinner } from '../../components/ui/Spinner';
import { apiClient } from '../../lib/api-client';

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
  messages: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>;
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
          messages: v2.data.data.messages.map((m) => ({ role: m.role, content: m.content })),
        };
      } catch {
        const legacy = await apiClient.get<{ data: LegacySharedChat }>(`/shared/chat/${token}`);
        return {
          title: legacy.data.data.agent_name,
          subtitle: 'Общий чат - только для чтения',
          messages: legacy.data.data.messages,
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
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}
      </div>

      {data.messages.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Чат пуст</p>
      )}
    </div>
  );
}
