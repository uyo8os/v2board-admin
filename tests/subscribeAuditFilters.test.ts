import { describe, expect, it } from 'vitest'
import { defaultSubscribeAuditDraft, subscribeAuditFilter } from '../src/pages/insiderGuard/subscribeAuditFilters'

describe('逐次订阅审计筛选', () => {
  it('默认最近 24 小时，刷新时重新计算时间而不修改草稿', () => {
    const draft = defaultSubscribeAuditDraft()
    expect(subscribeAuditFilter(draft, 100000)).toEqual({ time_from: 13600, time_to: 100000 })
    expect(subscribeAuditFilter(draft, 100060)).toEqual({ time_from: 13660, time_to: 100060 })
    expect(draft).toEqual(defaultSubscribeAuditDraft())
  })

  it('自选时间固定，允许单边界和相同起止时间，不注入刷新参数', () => {
    const draft = { ...defaultSubscribeAuditDraft(), rolling: false, time_from: 100, time_to: 100 }
    expect(subscribeAuditFilter(draft, 100000)).toEqual({ time_from: 100, time_to: 100 })
    expect(subscribeAuditFilter({ ...draft, time_to: undefined })).toEqual({ time_from: 100 })
    expect(subscribeAuditFilter({ ...draft, time_from: undefined, time_to: undefined })).toEqual({})
  })

  it('提交时修剪文本、忽略空筛选、转换数字，保留 IP/UA 与明确来源结果', () => {
    expect(
      subscribeAuditFilter({
        ...defaultSubscribeAuditDraft(),
        rolling: false,
        user_id: ' 7 ',
        email: ' x%_ ',
        ip: ' 2001:db8::1 ',
        ua: ' Clash Test ',
        format: ' ClashMeta ',
        result: 'error',
        source: 'app',
        status: ' 503 ',
      }),
    ).toEqual({
      user_id: 7,
      email: 'x%_',
      ip: '2001:db8::1',
      ua: 'Clash Test',
      format: 'ClashMeta',
      result: 'error',
      source: 'app',
      status: 503,
    })
  })

  it('无效 ID、HTTP 状态、时间范围和过长筛选不会发出业务查询', () => {
    const draft = defaultSubscribeAuditDraft()
    for (const user_id of ['0', '-1', '7x', '9007199254740992'])
      expect(() => subscribeAuditFilter({ ...draft, user_id })).toThrow('用户 ID')
    for (const status of ['99', '600', '200x', '2e2'])
      expect(() => subscribeAuditFilter({ ...draft, status })).toThrow('HTTP 状态')
    expect(() => subscribeAuditFilter({ ...draft, rolling: false, time_from: 200, time_to: 100 })).toThrow('开始时间')
    expect(() => subscribeAuditFilter({ ...draft, rolling: false, time_from: -1 })).toThrow('拉取时间')
    expect(() => subscribeAuditFilter({ ...draft, email: 'x'.repeat(65) })).toThrow('64')
    expect(() => subscribeAuditFilter({ ...draft, ua: 'x'.repeat(513) })).toThrow('512')
    expect(subscribeAuditFilter({ ...draft, ua: '测'.repeat(512) }).ua).toHaveLength(512)
  })
})
