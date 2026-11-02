import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify } from '../src/api/qs'

const post = vi.fn(async (_url: string, _params: object) => ({ code: 200, data: true }))
vi.mock('../src/api/request', () => ({ post, get: vi.fn() }))
vi.mock('../src/app/settings', () => ({ adminPath: (path: string) => `/admin${path}` }))
const { saveConfig } = await import('../src/api/services/config')

describe('新增系统配置的数组保存', () => {
  beforeEach(() => post.mockClear())

  it('预设金额和 MIME 类型去除空项、保留小数，不修改表单原值', async () => {
    const params = {
      deposit_preset_amounts: ['10', ' 50.5 ', ''],
      ticket_image_upload_allowed_types: [' image/png ', 'image/webp', ' '],
    }
    await saveConfig(params)
    expect(post).toHaveBeenCalledWith('/admin/config/save', {
      deposit_preset_amounts: ['10', '50.5'],
      ticket_image_upload_allowed_types: ['image/png', 'image/webp'],
    })
    expect(params.deposit_preset_amounts).toEqual(['10', ' 50.5 ', ''])
  })

  it('清空列表时显式传 nullable 值，序列化后仍包含字段', async () => {
    await saveConfig({ deposit_enable: 0, deposit_preset_amounts: [' ', ''], ticket_image_upload_allowed_types: [] })
    const payload = post.mock.calls[0][1]
    expect(payload).toEqual({
      deposit_enable: 0,
      deposit_preset_amounts: null,
      ticket_image_upload_allowed_types: null,
    })
    expect(stringify(payload)).toBe('deposit_enable=0&deposit_preset_amounts=&ticket_image_upload_allowed_types=')
  })

  it('不补入当前分组以外的字段', async () => {
    await saveConfig({
      email_qq_numeric_only: 1,
      recaptcha_enable: 1,
      login_captcha_enable: 0,
      show_active_sessions: 1,
    })
    expect(post).toHaveBeenCalledWith('/admin/config/save', {
      email_qq_numeric_only: 1,
      recaptcha_enable: 1,
      login_captcha_enable: 0,
      show_active_sessions: 1,
    })
  })
})
