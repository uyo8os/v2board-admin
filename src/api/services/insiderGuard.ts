import { adminPath } from '@/app/settings'
import { get, post } from '../request'
import type {
  GuardCandidates,
  GuardEvent,
  GuardEventType,
  GuardHours,
  GuardOverview,
  GuardReviewAction,
  GuardRestriction,
  GuardRiskUser,
  GuardTimeline,
  GuardUserDetail,
  NodeType,
  SubscribeAuditDetail,
  SubscribeAuditDimension,
  SubscribeAuditFilter,
  SubscribeAuditRecord,
  SubscribeAuditStats,
} from '../types'

// 风控中心接口：GET 用 query，POST 用表单；节点一律用 node_type + node_id 标识
const guardPath = (name: string) => adminPath(`/insiderGuard/${name}`)

// 风控数据每次实际请求均绕过 HTTP 缓存；nonce 只加入 URL，不改变 Query 的 key 与请求头。
let requestSequence = 0
const guardGet = <T>(name: string, params?: object) =>
  get<T>(guardPath(name), { ...params, _ig: `${Date.now()}-${++requestSequence}` }, { cache: 'no-store' })

/** 概览：近 24 小时事件数、审核总数、限制中账号数、最近 20 条节点异常 */
export const fetchGuardOverview = () => guardGet<GuardOverview>('overview')
/** 风险用户：按时段统计订阅次数与来源 IP 数并评分（响应顶层另有 hours / threshold） */
export const fetchGuardUsers = (hours: GuardHours) => guardGet<GuardRiskUser[]>('users', { hours })
/** 当前受限账号（服务端分页，顶层 total） */
export const fetchGuardRestrictions = (params: { current: number; pageSize: number }) =>
  guardGet<GuardRestriction[]>('restrictions', params)
/** 事件列表（服务端分页，顶层 total），可按用户 ID、事件类型筛选 */
export const fetchGuardEvents = (params: {
  current: number
  pageSize: number
  user_id?: number
  event_type?: GuardEventType
}) => guardGet<GuardEvent[]>('events', params)
export const fetchGuardUserDetail = (id: number) => guardGet<GuardUserDetail>('userDetail', { id })
/** 人工审核记录（不改变账号状态）：原因 8～1000 字 */
export const saveGuardReview = (params: { id: number; action: GuardReviewAction; reason: string }) =>
  post<boolean>(guardPath('review'), params)
/** 限制：不封号，之后拉订阅时节点入口换成假地址；原因 12～1000 字，后端要求显式确认 */
export const restrictGuardUser = (params: { id: number; reason: string }) =>
  post<boolean>(guardPath('restrict'), { ...params, confirm: 1 })
/** 解除限制：恢复真实入口；原因 8～1000 字 */
export const releaseGuardUser = (params: { id: number; reason: string }) => post<boolean>(guardPath('release'), params)
/** 登记节点异常：occurred_at 为 unix 秒，reason 1000 字以内 */
export const createNodeIncident = (params: {
  node_type: NodeType
  node_id: number
  occurred_at: number
  reason: string
}) => post<boolean>(guardPath('nodeIncident'), params)
export const fetchIncidentCandidates = (id: number) => guardGet<GuardCandidates>('candidates', { id })
export const fetchIncidentTimeline = (id: number) => guardGet<GuardTimeline>('timeline', { id })

export const fetchSubscribeAudit = (params: SubscribeAuditFilter & { current: number; pageSize: number }) =>
  guardGet<SubscribeAuditRecord[]>('subscribeAudit', params)
/** fresh 只控制本次统计重算，不应放入 React Query 的 key。 */
export const fetchSubscribeAuditStats = (
  params: SubscribeAuditFilter & { dimension: SubscribeAuditDimension; fresh?: 1 },
) => guardGet<SubscribeAuditStats>('subscribeAuditStats', params)
export const fetchSubscribeAuditDetail = (id: number) => guardGet<SubscribeAuditDetail>('subscribeAuditDetail', { id })
