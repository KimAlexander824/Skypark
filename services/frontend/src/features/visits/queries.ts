import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { nanniesApi, nannyWorkspaceApi, settingsApi, visitsApi, type CreateVisitInput, type VisitsScope } from '@/api/visits'
import { childrenKeys } from '@/features/children/queries'
import type { ID } from '@/types'

export const visitKeys = {
  all: ['visits'] as const,
  list: (scope: VisitsScope) => ['visits', 'list', scope] as const,
  nannies: ['nannies'] as const,
  settings: ['settings', 'visits'] as const,
}

/** Список обновляется раз в 30 секунд, чтобы подхватывать автоматические переходы статусов. */
export const useVisits = (scope: VisitsScope) =>
  useQuery({ queryKey: visitKeys.list(scope), queryFn: () => visitsApi.list(scope), refetchInterval: 30_000, placeholderData: (p) => p })

export const useNannies = () => useQuery({ queryKey: visitKeys.nannies, queryFn: nanniesApi.list, refetchInterval: 30_000 })

export const useNannyWorkspace = (employeeId: ID) =>
  useQuery({
    queryKey: ['visits', 'nanny', employeeId],
    queryFn: () => nannyWorkspaceApi.get(employeeId),
    refetchInterval: 30_000,
    placeholderData: (p) => p,
  })

export const useVisitSettings = () => useQuery({ queryKey: visitKeys.settings, queryFn: settingsApi.get, staleTime: 60_000 })

function useInvalidateAll() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: visitKeys.all }),
      qc.invalidateQueries({ queryKey: visitKeys.nannies }),
      qc.invalidateQueries({ queryKey: childrenKeys.all }),
    ])
}

export function useCreateVisit() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (input: CreateVisitInput) => visitsApi.create(input), onSuccess: invalidate })
}

export function useFinishVisit() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: ({ id, by }: { id: ID; by: ID }) => visitsApi.finish(id, by), onSuccess: invalidate })
}
