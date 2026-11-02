import { adminPath } from '@/app/settings'
import { get, post } from '../request'
import type { SpeedLimitRecord, SpeedLimitRule, SpeedLimitPayload } from '../types'

const path = (action: string) => adminPath(`/server/speedlimit/${action}`)

export const fetchSpeedLimitRules = () => get<SpeedLimitRule[]>(path('fetch'))
export const saveSpeedLimitRule = (params: SpeedLimitPayload) => post<boolean>(path('save'), params, true)
export const dropSpeedLimitRule = (id: number) => post<boolean>(path('drop'), { id }, true)
export const toggleSpeedLimitRule = (id: number) => post<boolean>(path('toggle'), { id }, true)
export const releaseSpeedLimit = (id: number) => post<boolean>(path('release'), { id }, true)
export const clearSpeedLimitHistory = (rule_id: number) => post<boolean>(path('clearHistory'), { rule_id }, true)
export const fetchSpeedLimitRecords = (
  history: boolean,
  params: { rule_id: number; current: number; page_size: number; email?: string },
) => get<SpeedLimitRecord[]>(path(history ? 'history' : 'records'), params)
