import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MENU } from '../src/layouts/menu'
import { formatDeductDays } from '../src/pages/trafficAdvance/utils'

const get = vi.fn(async (_url: string, _params?: object, _options?: object) => ({ code: 200, data: [], total: 0 }))
const post = vi.fn(async (_url: string, _params?: object) => ({ code: 200, data: { deleted: 1 } }))
vi.mock('../src/api/request', () => ({ get, post }))
vi.mock('../src/app/settings', () => ({ adminPath: (path: string) => `/admin${path}` }))
const { clearTrafficAdvanceRecords, fetchTrafficAdvanceRecords } = await import('../src/api/services/trafficAdvance')

describe('提前开启记录', () => {
  beforeEach(() => {
    get.mockClear()
    post.mockClear()
  })

  it('分页沿用 current/pageSize 参数并禁用 HTTP 缓存', async () => {
    await fetchTrafficAdvanceRecords({ current: 2, pageSize: 50 })
    expect(get).toHaveBeenCalledWith(
      '/admin/trafficAdvance/fetch',
      { current: 2, pageSize: 50 },
      { cache: 'no-store' },
    )
  })

  it('完整邮箱去掉前后空格，空搜索不发送邮箱条件', async () => {
    await fetchTrafficAdvanceRecords({ current: 1, pageSize: 10, email: ' user@example.test ' })
    expect(get.mock.calls[0][1]).toEqual({ current: 1, pageSize: 10, email: 'user@example.test' })
    await fetchTrafficAdvanceRecords({ current: 1, pageSize: 10, email: '  ' })
    expect(get.mock.calls[1][1]).toEqual({ current: 1, pageSize: 10 })
  })

  it('清理只发一次 POST 和邮箱条件，不发送列表分页参数', async () => {
    const result = await clearTrafficAdvanceRecords(' user@example.test ')
    expect(post).toHaveBeenCalledExactlyOnceWith('/admin/trafficAdvance/clear', { email: 'user@example.test' })
    expect(result.data?.deleted).toBe(1)
  })

  it('无邮箱清理发送空表单', async () => {
    await clearTrafficAdvanceRecords(' ')
    expect(post).toHaveBeenCalledExactlyOnceWith('/admin/trafficAdvance/clear', {})
  })

  it('扣除天数保留秒级差异，小数最多六位且不向下取整', () => {
    expect(formatDeductDays(86400)).toBe('1')
    expect(formatDeductDays(259200)).toBe('3')
    expect(formatDeductDays(43200)).toBe('0.5')
    expect(formatDeductDays(259199)).toBe('2.999988')
    expect(formatDeductDays(1)).toBe('0.000012')
  })

  it('菜单紧接工单管理之后', () => {
    const ticketIndex = MENU.findIndex((entry) => entry.type === 'item' && entry.href === '/ticket')
    expect(ticketIndex).toBeGreaterThan(-1)
    expect(MENU[ticketIndex + 1]).toMatchObject({
      type: 'item',
      title: '提前开启记录',
      href: '/trafficAdvance',
    })
  })
})
