import { create } from 'zustand';
import type { ToolTrace } from '../lib/api/agents';

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolTraces?: ToolTrace[];
  runId?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost?: string; model?: string } | null;
  latencyMs?: number;
}

interface PlaygroundState {
  messages: ChatMessage[];
  isRunning: boolean;
  error: string | null;
  historyLoaded: boolean;

  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string, meta?: {
    toolTraces?: ToolTrace[];
    runId?: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; estimated_cost?: string; model?: string } | null;
    latencyMs?: number;
  }) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  messages: [],
  isRunning: false,
  error: null,
  historyLoaded: false,

  addUserMessage: (content) =>
    set((s) => ({
      messages: [...s.messages, { role: 'user', content }],
      error: null,
    })),

  addAssistantMessage: (content, meta) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          role: 'assistant',
          content,
          toolTraces: meta?.toolTraces,
          runId: meta?.runId,
          usage: meta?.usage,
          latencyMs: meta?.latencyMs,
        },
      ],
    })),

  setMessages: (msgs) => set({ messages: msgs, historyLoaded: true }),
  setRunning: (running) => set({ isRunning: running }),
  setError: (error) => set({ error }),
  clearMessages: () => set({ messages: [], error: null, historyLoaded: false }),
}));
