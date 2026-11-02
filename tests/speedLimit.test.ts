import { describe, expect, it } from 'vitest'
import type { SpeedLimitRule } from '../src/api/types'
import { enabled, GB, toRuleForm, toRulePayload } from '../src/pages/server/speedlimit/utils'

const rule: SpeedLimitRule = {
  id: 7,
  name: '公平使用',
  enable: 1,
  node_ids: [
    { type: 'vmess', id: 1 },
    { type: 'trojan', id: 1 },
  ],
  plan_limit_enabled: true,
  plan_ids: [2, 3],
  daily_enabled: false,
  trigger_period: 7230,
  threshold: GB * 1.25,
  speed_limit: 5,
  limit_duration: 3690,
  disconnect_existing_connections: '1',
}

describe('动态限速表单与 API 单位转换', () => {
  it('兼容后端开关值，字符串 0 不应被当成开启', () => {
    expect([true, 1, '1'].every(enabled)).toBe(true)
    expect([false, 0, '0', undefined].some(enabled)).toBe(false)
  })

  it('编辑并保存时保留秒级时间、小数 GB 和协议相同 ID 的节点', () => {
    const form = toRuleForm(rule)
    expect(form.trigger_period).toBe(120.5)
    expect(form.limit_duration).toBe(61.5)
    expect(form.threshold).toBe(1.25)
    expect(form.node_keys).toEqual(['vmess:1', 'trojan:1'])
    expect(toRulePayload(form, rule.id)).toEqual({
      id: 7,
      name: rule.name,
      node_ids: rule.node_ids,
      plan_limit_enabled: 1,
      plan_ids: [2, 3],
      daily_enabled: 0,
      trigger_period: 7230,
      threshold: GB * 1.25,
      speed_limit: 5,
      limit_duration: 3690,
      disconnect_existing_connections: 1,
    })
  })

  it('每日模式不发送隐藏时间参数，关闭订阅限制时清空其范围', () => {
    const form = { ...toRuleForm(rule), daily_enabled: true, plan_limit_enabled: false }
    const payload = toRulePayload(form)
    expect(payload).not.toHaveProperty('trigger_period')
    expect(payload).not.toHaveProperty('limit_duration')
    expect(payload.plan_ids).toEqual([])
    expect(payload.daily_enabled).toBe(1)
    expect(payload).not.toHaveProperty('id')
  })

  it('字节阈值与秒数四舍五入为后端要求的整数', () => {
    const payload = toRulePayload({ ...toRuleForm(rule), threshold: 0.01, trigger_period: 1.333, name: '  测试  ' })
    expect(payload.threshold).toBe(10737418)
    expect(payload.trigger_period).toBe(80)
    expect(payload.name).toBe('测试')
  })
})
