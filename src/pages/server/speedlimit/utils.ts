import type { SpeedLimitFlag, SpeedLimitPayload, SpeedLimitRule } from '@/api/types'

export const RULES_KEY = ['server', 'speedlimit', 'rules'] as const
export const RECORDS_KEY = ['server', 'speedlimit', 'records'] as const
export const GB = 1024 ** 3
export const enabled = (value: SpeedLimitFlag | undefined) => value === true || value === 1 || value === '1'
export const nodeKey = (node: { type: string; id: number }) => `${node.type}:${node.id}`

export interface RuleForm {
  name: string
  node_keys: string[]
  plan_limit_enabled: boolean
  plan_ids: number[]
  daily_enabled: boolean
  trigger_period: number
  threshold: number | null
  speed_limit: number | null
  limit_duration: number
  disconnect_existing_connections: boolean
}

export function toRuleForm(rule?: SpeedLimitRule): RuleForm {
  return {
    name: rule?.name ?? '',
    node_keys: rule?.node_ids.map(nodeKey) ?? [],
    plan_limit_enabled: enabled(rule?.plan_limit_enabled),
    plan_ids: [...new Set((rule?.plan_ids ?? []).map(Number))],
    daily_enabled: enabled(rule?.daily_enabled),
    trigger_period: (rule?.trigger_period ?? 7200) / 60,
    threshold: rule ? rule.threshold / GB : null,
    speed_limit: rule?.speed_limit ?? null,
    limit_duration: (rule?.limit_duration ?? 3600) / 60,
    disconnect_existing_connections: enabled(rule?.disconnect_existing_connections),
  }
}

/** 表单用分钟 / GB；每日模式不发送隐藏的时间字段，由后端保留原值。 */
export function toRulePayload(form: RuleForm, id?: number): SpeedLimitPayload {
  return {
    ...(id !== undefined && { id }),
    name: form.name.trim(),
    node_ids: form.node_keys.map((key) => {
      const [type, nodeId] = key.split(':')
      return { type, id: Number(nodeId) }
    }),
    plan_limit_enabled: form.plan_limit_enabled ? 1 : 0,
    plan_ids: form.plan_limit_enabled ? [...new Set(form.plan_ids.map(Number))] : [],
    daily_enabled: form.daily_enabled ? 1 : 0,
    ...(!form.daily_enabled && {
      trigger_period: Math.round(form.trigger_period * 60),
      limit_duration: Math.round(form.limit_duration * 60),
    }),
    threshold: Math.round(Number(form.threshold) * GB),
    speed_limit: Number(form.speed_limit),
    disconnect_existing_connections: form.disconnect_existing_connections ? 1 : 0,
  }
}

export function duration(seconds = 0) {
  if (!seconds) return '—'
  if (seconds % 86400 === 0) return `${seconds / 86400} 天`
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`
  return `${seconds} 秒`
}

export function traffic(bytes: number) {
  if (bytes >= GB) return `${Number((bytes / GB).toFixed(2))} GB`
  if (bytes >= 1024 ** 2) return `${Number((bytes / 1024 ** 2).toFixed(2))} MB`
  if (bytes >= 1024) return `${Number((bytes / 1024).toFixed(2))} KB`
  return `${bytes} B`
}
