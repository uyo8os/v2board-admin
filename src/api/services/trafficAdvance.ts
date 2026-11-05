import { adminPath } from '@/app/settings'
import { get, post } from '../request'

export interface TrafficAdvanceRecord {
  id: number
  user_id: number
  created_at: number
  email: string
  plan_id: number
  plan_name: string
  deduct_seconds: number
  old_expired_at: number
  new_expired_at: number
}

export interface TrafficAdvancePageParams {
  current: number
  pageSize: number
  email?: string
}

const emailFilter = (email?: string) => (email?.trim() ? { email: email.trim() } : {})

export const fetchTrafficAdvanceRecords = ({ current, pageSize, email }: TrafficAdvancePageParams) =>
  get<TrafficAdvanceRecord[]>(
    adminPath('/trafficAdvance/fetch'),
    { current, pageSize, ...emailFilter(email) },
    { cache: 'no-store' },
  )

/** 单次最多清理 1000 条最旧历史记录；只带邮箱条件，不带分页。 */
export const clearTrafficAdvanceRecords = (email?: string) =>
  post<{ deleted: number }>(adminPath('/trafficAdvance/clear'), emailFilter(email))
