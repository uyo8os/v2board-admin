import { adminPath } from '@/app/settings'
import { get, post } from '../request'
import type { ConfigGroups } from '../types'

/** key 为分组名（site / frontend / ...），不传时返回全部分组 */
export const fetchConfig = (key?: string) => get<ConfigGroups>(adminPath('/config/fetch'), { key })
/** 保存配置：后端只更新请求里带的字段（系统配置页每次提交一个分组的全部字段） */
export const saveConfig = (params: object) => {
  const data: Record<string, unknown> = { ...params }
  for (const key of ['deposit_preset_amounts', 'ticket_image_upload_allowed_types']) {
    if (!Array.isArray(data[key])) continue
    const values = data[key].map((value) => String(value).trim()).filter(Boolean)
    // form-urlencoded 会省略空数组；用 nullable 字段显式清空，避免保存后旧值重新出现。
    data[key] = values.length ? values : null
  }
  return post<boolean>(adminPath('/config/save'), data)
}
export const getEmailTemplate = () => get<string[]>(adminPath('/config/getEmailTemplate'))
export const getThemeTemplate = () => get<string[]>(adminPath('/config/getThemeTemplate'))
/** 带上输入框里的机器人 Token（原版不传，后端使用已保存的 Token） */
export const setTelegramWebhook = (token: string) =>
  post<boolean>(adminPath('/config/setTelegramWebhook'), { telegram_bot_token: token })
/** 响应里的 log 为发送结果（TestMailLog） */
export const testSendMail = () => post<boolean>(adminPath('/config/testSendMail'))
