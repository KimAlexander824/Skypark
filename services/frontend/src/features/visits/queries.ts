import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { extensionsApi, nanniesApi, pricingApi, nannyWorkspaceApi, settingsApi, visitsApi, type CreateVisitInput, type VisitsScope } from '@/api/visits'
import { childrenKeys } from '@/features/children/queries'
import { notificationKeys } from '@/features/notifications/queries'
import type { ID } from '@/types'

export const visitKeys = {
  all: ['visits'] as const,
  list: (scope: VisitsScope) => ['visits', 'list', scope] as const,
  nannies: ['nannies'] as const,
  settings: ['settings', 'visits'] as const,
  discounts: ['visits', 'discounts'] as const,
  extensionOptions: (visitId: ID) => ['visits', 'extension-options', visitId] as const,
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

/** ТЗ §27 — скидки, действующие сегодня. */
export const useActiveDiscounts = () => useQuery({ queryKey: visitKeys.discounts, queryFn: pricingApi.discounts, staleTime: 60_000 })

export const useVisitSettings = () => useQuery({ queryKey: visitKeys.settings, queryFn: settingsApi.get, staleTime: 60_000 })

function useInvalidateAll() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: visitKeys.all }),
      qc.invalidateQueries({ queryKey: visitKeys.nannies }),
      qc.invalidateQueries({ queryKey: childrenKeys.all }),
      qc.invalidateQueries({ queryKey: notificationKeys.all }),
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

/* ---------- Продление (ТЗ §16–18) ---------- */

export const useExtensionOptions = (visitId: ID | undefined) =>
  useQuery({
    queryKey: visitKeys.extensionOptions(visitId ?? ''),
    queryFn: () => extensionsApi.options(visitId!),
    enabled: Boolean(visitId),
  })

export function useRequestExtension() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ visitId, minutes }: { visitId: ID; minutes: number }) => extensionsApi.request(visitId, minutes),
    onSuccess: invalidate,
  })
}

export function usePayExtension() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ visitId, extensionId, outcome }: { visitId: ID; extensionId: ID; outcome: 'paid' | 'failed' }) =>
      extensionsApi.pay(visitId, extensionId, outcome),
    onSuccess: invalidate,
  })
}

export function useDeclineExtension() {
  const invalidate = useInvalidateAll()
  return useMutation({ mutationFn: (visitId: ID) => extensionsApi.decline(visitId), onSuccess: invalidate })
}
