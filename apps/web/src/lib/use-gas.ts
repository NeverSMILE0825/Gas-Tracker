'use client'

import type { AnalysisDto, ChartDto, CurrentGasDto, DriversDto, StatusDto } from '@gasscope/shared'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useGasQuery } from '@/lib/query-state'

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api<StatusDto>('/api/v1/status'),
    refetchInterval: 12_000,
  })
}

export function useCurrent() {
  return useQuery({
    queryKey: ['current'],
    queryFn: () => api<CurrentGasDto>('/api/v1/gas/current'),
    refetchInterval: 12_000,
  })
}

export function useAnalysis(extra = '') {
  const { qs, live } = useGasQuery()
  const query = extra ? `${qs}&${extra}` : qs
  return useQuery({
    queryKey: ['analysis', query],
    queryFn: () => api<AnalysisDto>(`/api/v1/analysis?${query}`),
    refetchInterval: live ? 20_000 : false,
  })
}

export function useChart() {
  const { qs, live } = useGasQuery()
  return useQuery({
    queryKey: ['chart', qs],
    queryFn: () => api<ChartDto>(`/api/v1/chart?${qs}`),
    refetchInterval: live ? 20_000 : false,
  })
}

export function useDrivers(groupBy: DriversDto['groupBy'], sort: DriversDto['sort'] = 'gasUsed', limit = 12) {
  const { qs, live } = useGasQuery()
  const query = `${qs}&groupBy=${groupBy}&sort=${sort}&limit=${limit}`
  return useQuery({
    queryKey: ['drivers', query],
    queryFn: () => api<DriversDto>(`/api/v1/drivers?${query}`),
    refetchInterval: live ? 20_000 : false,
  })
}
