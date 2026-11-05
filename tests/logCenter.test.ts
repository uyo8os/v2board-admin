import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify } from '../src/api/qs'
import { queueName } from '../src/utils/queue'

const get = vi.fn(async (_url: string, _params?: object, _options?: object) => ({ code: 200, data: [], total: 0 }))
const post = vi.fn(async (_url: string) => ({ code: 200, data: true }))
vi.mock('../src/api/request', () => ({ get, post }))
vi.mock('../src/app/settings', () => ({ adminPath: (path: string) => `/admin${path}` }))
const { fetchSystemLogs, fetchQueueLogs, fetchMailLogs, clearLogs } = await import('../src/api/services/logs')

describe('日志中心接口', () => {
  beforeEach(() => {
    get.mockClear()
    post.mockClear()
  })

  it('系统日志按后端 FilterScope 约定分页和筛选级别', async () => {
    await fetchSystemLogs({ current: 2, page_size: 20 }, 'ERROR')
    expect(get).toHaveBeenCalledWith(
      '/admin/system/getSystemLog',
      { current: 2, page_size: 20, filter: [{ key: 'level', condition: 'is', value: 'ERROR' }] },
      { cache: 'no-store' },
    )
    expect(stringify(get.mock.calls[0][1])).toBe(
      'current=2&page_size=20&filter[0][key]=level&filter[0][condition]=is&filter[0][value]=ERROR',
    )
    await fetchSystemLogs({ current: 1, page_size: 10 }, '')
    expect(get.mock.calls[1][1]).toEqual({ current: 1, page_size: 10 })
  })

  it('队列日志只发送分页，邮件日志按收件邮箱搜索', async () => {
    await fetchQueueLogs({ current: 1, page_size: 50 })
    await fetchMailLogs({ current: 3, page_size: 10 }, 'a@example.test')
    expect(get.mock.calls[0]).toEqual([
      '/admin/system/getQueueLog',
      { current: 1, page_size: 50 },
      { cache: 'no-store' },
    ])
    expect(get.mock.calls[1]).toEqual([
      '/admin/system/getMailLog',
      { current: 3, page_size: 10, email: 'a@example.test' },
      { cache: 'no-store' },
    ])
  })

  it('每类清空操作调用对应接口', async () => {
    await clearLogs('system')
    await clearLogs('queue')
    await clearLogs('mail')
    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/admin/system/clearSystemLog',
      '/admin/system/clearQueueLog',
      '/admin/system/clearMailLog',
    ])
  })

  it('队列显示名称与监控页一致，未知队列保留原名', () => {
    expect(queueName('insider_guard_audit')).toBe('订阅审计队列')
    expect(queueName('send_email')).toBe('邮件队列')
    expect(queueName('other_queue')).toBe('other_queue')
  })
})
