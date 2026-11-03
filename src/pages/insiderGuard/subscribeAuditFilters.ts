import type { SubscribeAuditFilter, SubscribeAuditResult, SubscribeAuditSource } from '@/api/types'

export interface SubscribeAuditDraft {
  rolling: boolean
  time_from?: number
  time_to?: number
  user_id: string
  email: string
  ip: string
  ua: string
  format: string
  result: SubscribeAuditResult | ''
  source: SubscribeAuditSource | ''
  status: string
}

export function defaultSubscribeAuditDraft(): SubscribeAuditDraft {
  return { rolling: true, user_id: '', email: '', ip: '', ua: '', format: '', result: '', source: '', status: '' }
}

/** 只在提交 / 刷新时确定滚动窗口；编辑草稿不改变已应用的查询。 */
export function subscribeAuditFilter(
  draft: SubscribeAuditDraft,
  now = Math.floor(Date.now() / 1000),
): SubscribeAuditFilter {
  const filter: SubscribeAuditFilter = {}
  if (draft.rolling) {
    filter.time_from = Math.max(0, now - 86400)
    filter.time_to = now
  } else {
    for (const key of ['time_from', 'time_to'] as const) {
      const value = draft[key]
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error('请选择有效的拉取时间')
      if (value !== undefined) filter[key] = value
    }
    if (filter.time_from !== undefined && filter.time_to !== undefined && filter.time_from > filter.time_to) {
      throw new Error('开始时间不能晚于结束时间')
    }
  }
  const userId = draft.user_id.trim()
  if (userId) {
    if (!/^\d+$/.test(userId) || !Number.isSafeInteger(Number(userId)) || Number(userId) < 1) {
      throw new Error('请输入有效的用户 ID')
    }
    filter.user_id = Number(userId)
  }
  for (const [key, limit] of [
    ['email', 64],
    ['ua', 512],
    ['ip', 45],
    ['format', 64],
  ] as const) {
    const value = draft[key].trim()
    if ([...value].length > limit) throw new Error(`${key} 筛选不能超过 ${limit} 字`)
    if (value) filter[key] = value
  }
  const status = draft.status.trim()
  if (status) {
    if (!/^\d{3}$/.test(status) || Number(status) < 100 || Number(status) > 599)
      throw new Error('HTTP 状态需为 100～599')
    filter.status = Number(status)
  }
  if (draft.result) filter.result = draft.result
  if (draft.source) filter.source = draft.source
  return filter
}

export const SUBSCRIBE_AUDIT_RESULT = {
  success: { label: '成功', color: 'green' },
  unavailable: { label: '账号不可用', color: 'orange' },
  error: { label: '失败', color: 'red' },
} as const

export const SUBSCRIBE_AUDIT_SOURCE = { subscription: '普通订阅', app: 'App 配置' } as const
