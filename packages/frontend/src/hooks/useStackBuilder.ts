import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stackBuilderApi } from '../lib/api/stack-builder';
import type { StackBuilderInput, StackRecommendation } from '@llmstore/shared';

export function useRecommend() {
  return useMutation({
    mutationFn: (input: StackBuilderInput) => stackBuilderApi.recommend(input),
  });
}

export function useSaveResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      builder_answers: StackBuilderInput;
      recommended_result: Record<string, unknown>;
    }) => stackBuilderApi.save(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack-builder', 'saved'] });
    },
  });
}

export function useSavedResults() {
  return useQuery({
    queryKey: ['stack-builder', 'saved'],
    queryFn: stackBuilderApi.listSaved,
  });
}

export function useSavedResult(id: string) {
  return useQuery({
    queryKey: ['stack-builder', 'saved', id],
    queryFn: () => stackBuilderApi.getSaved(id),
    enabled: !!id,
  });
}

export function useExportResult() {
  return useMutation({
    mutationFn: (body: {
      format: 'json' | 'markdown';
      result?: Record<string, unknown>;
      saved_result_id?: string;
    }) => stackBuilderApi.exportResult(body),
  });
}

export function useCreateAgentFromStack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      result?: Record<string, unknown>;
      saved_result_id?: string;
    }) => stackBuilderApi.createAgent(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
