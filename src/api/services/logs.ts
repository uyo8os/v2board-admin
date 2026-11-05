import { adminPath } from '@/app/settings'
import { get, post } from '../request'

export type LogKind = 'system' | 'queue' | 'mail'

export interface SystemLog {
  id: number
  title: string
  level: string | null
  host: string | null
  uri: string
  method: string
  ip: string | null
  data: string | null
  context: string | null
  created_at: number
}

export interface QueueLog {
  id: number
  connection: string
  queue: string
  payload: string
  exception: string
  failed_at: string
}

export interface MailLog {
  id: number
  email: string
  subject: string
  template_name: string
  error: string | null
  created_at: number
}

export interface LogPageParams {
  current: number
  page_size: number
}

const systemPath = (action: string) => adminPath(`/system/${action}`)

export const fetchSystemLogs = (page: LogPageParams, level: string) =>
  get<SystemLog[]>(
    systemPath('getSystemLog'),
    { ...page, ...(level && { filter: [{ key: 'level', condition: 'is', value: level }] }) },
    { cache: 'no-store' },
  )

export const fetchQueueLogs = (page: LogPageParams) =>
  get<QueueLog[]>(systemPath('getQueueLog'), page, { cache: 'no-store' })
export const fetchMailLogs = (page: LogPageParams, email: string) =>
  get<MailLog[]>(systemPath('getMailLog'), { ...page, ...(email && { email }) }, { cache: 'no-store' })

const CLEAR_ACTION: Record<LogKind, string> = {
  system: 'clearSystemLog',
  queue: 'clearQueueLog',
  mail: 'clearMailLog',
}

export const clearLogs = (kind: LogKind) => post<boolean>(systemPath(CLEAR_ACTION[kind]))
