import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify } from '../src/api/qs'

const post = vi.fn(async (_url: string, _params: object) => ({ code: 200, data: true }))
vi.mock('../src/api/request', () => ({ post, get: vi.fn() }))
vi.mock('../src/app/settings', () => ({ adminPath: (path: string) => `/admin${path}` }))
const { saveNotice } = await import('../src/api/services/notice')

describe('公告自动弹出设置', () => {
  beforeEach(() => post.mockClear())

  it.each([[true, 1], [false, 0]] as const)('将开关 %s 编码为后端接受的 %s', async (enabled, expected) => {
    await saveNotice({ id: 5, auto_popup: enabled, popup_interval: 12 })
    const payload = post.mock.calls[0][1]
    expect(payload).toEqual({ id: 5, auto_popup: expected, popup_interval: 12 })
    expect(stringify(payload)).toContain(`auto_popup=${expected}`)
  })

  it('未提供开关时不改变请求字段', async () => {
    await saveNotice({ title: '公告' })
    expect(post.mock.calls[0][1]).toEqual({ title: '公告' })
  })
})
