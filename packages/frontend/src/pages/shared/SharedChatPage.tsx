import { useParams } from 'react-router-dom';
import { useSharedChat } from '../../hooks/useAgents';
import { ChatMessage } from '../../components/agents/ChatMessage';
import { Spinner } from '../../components/ui/Spinner';

export function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useSharedChat(token);

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
        <h1 className="text-xl font-semibold">{data.agent_name}</h1>
        <p className="text-xs text-muted-foreground">Общий чат — только для чтения</p>
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
