import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '../lib/api/catalog';

export function useCategories() {
  return useQuery({
    queryKey: ['taxonomy', 'categories'],
    queryFn: catalogApi.getCategories,
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['taxonomy', 'tags'],
    queryFn: catalogApi.getTags,
    staleTime: 1000 * 60 * 30,
  });
}

export function useUseCases() {
  return useQuery({
    queryKey: ['taxonomy', 'use-cases'],
    queryFn: catalogApi.getUseCases,
    staleTime: 1000 * 60 * 30,
  });
}
