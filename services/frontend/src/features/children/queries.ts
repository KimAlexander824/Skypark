import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { childrenApi, parentsApi, type ChildrenQuery, type RegisterChildInput } from '@/api/children'
import type { ID } from '@/types'

export const childrenKeys = {
  all: ['children'] as const,
  list: (q: ChildrenQuery) => ['children', 'list', q] as const,
  detail: (id: ID) => ['children', 'detail', id] as const,
}

export const useChildren = (q: ChildrenQuery) =>
  useQuery({ queryKey: childrenKeys.list(q), queryFn: () => childrenApi.list(q), placeholderData: (prev) => prev })

export const useChild = (id: ID) => useQuery({ queryKey: childrenKeys.detail(id), queryFn: () => childrenApi.get(id) })

export const useParentLookup = () => useMutation({ mutationFn: (phone: string) => parentsApi.findByPhone(phone) })

export function useRegisterChild() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterChildInput) => childrenApi.register(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: childrenKeys.all }),
  })
}
