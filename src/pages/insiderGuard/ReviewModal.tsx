// 人工审核弹窗（「概览」风险用户表的「审核」、「用户详情」的「审核此用户」）。
// 持续观察 / 解除疑虑 / 建议限制：只记一条审核记录，不改账号。
// 限制：不封号，之后该用户拉订阅时所有节点的入口地址换成假地址（风控设置里未填时按用户自动生成），需勾选确认、原因至少 12 字；
// 节点限制和消费限制分别解除，所有动作都会留审核记录。
// 与项目里其他弹窗一样包住触发元素，点击打开；关闭动画结束后表单恢复初始值
import { Checkbox, Input, Modal, Select, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { cloneElement, useState, type MouseEventHandler, type ReactElement } from 'react'
import { unwrap } from '@/api/request'
import {
  excludeGuardNodes,
  fetchGuardUserDetail,
  releaseGuardConsumption,
  releaseGuardUser,
  restrictGuardConsumption,
  restrictGuardUser,
  saveGuardReview,
} from '@/api/services/insiderGuard'
import type { GuardReviewAction } from '@/api/types'
import { message } from '@/app/staticApi'
import { FormGroup } from '@/components/FormGroup'
import { filterNodeOption, useNodeOptions, type NodeOption } from '@/components/NodeSelect'
import { nodeKey, parseNodeKey } from '@/utils/nodes'
import { guardKeys, MUTED, Note, REVIEW_ACTION_TEXT, userLabel } from './shared'

type ReviewAction = Exclude<GuardReviewAction, 'node_exclude'> | 'exclude'
const ACTIONS: ReviewAction[] = [
  'watch',
  'clear',
  'restrict_recommended',
  'restrict',
  'exclude',
  'release',
  'consumption_restrict',
  'consumption_release',
]
const ACTION_OPTIONS = ACTIONS.map((value) => ({
  value,
  label: value === 'exclude' ? '节点排除' : REVIEW_ACTION_TEXT[value],
}))
/** 分别按节点限制和消费限制状态提供解除动作。 */
const actionOptions = (nodeRestricted: boolean, consumptionRestricted: boolean, current: ReviewAction) =>
  ACTION_OPTIONS.filter(
    (option) =>
      (option.value !== 'release' || nodeRestricted || current === 'release') &&
      (option.value !== 'consumption_release' || consumptionRestricted || current === 'consumption_release'),
  )

/** 原因的最少字数（与后端一致：限制 12，其余 8）与上限；字数按码点算，与后端 mb_strlen 一致 */
const REASON_MIN: Record<ReviewAction, number> = {
  watch: 8,
  clear: 8,
  restrict_recommended: 8,
  restrict: 12,
  exclude: 8,
  release: 8,
  consumption_restrict: 8,
  consumption_release: 8,
}
const REASON_MAX = 1000
const REASON_EXAMPLE: Record<ReviewAction, string> = {
  watch: '短时间内多个 IP 频繁拉取订阅，先观察',
  clear: '已与用户确认为多设备自用',
  restrict_recommended: '订阅疑似外泄，建议限制',
  restrict: '订阅已在公开渠道流传，限制后观察投诉情况',
  exclude: '该用户需要排除指定节点',
  release: '用户已更换订阅并说明情况，解除限制',
  consumption_restrict: '账号存在异常，暂时限制消费',
  consumption_release: '账号异常已处理，解除消费限制',
}
const placeholder = (action: ReviewAction) => `至少 ${REASON_MIN[action]} 个字，例如：${REASON_EXAMPLE[action]}`

function ExcludedNodeSelect({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const { options, loading, loaded } = useNodeOptions()
  const known = new Set(options.map((option) => option.value))
  const missing: NodeOption[] = value
    .filter((key) => !known.has(key))
    .map((key) => ({
      value: key,
      label: `${key}（节点不可用）`,
      search: key.toLowerCase(),
    }))
  return (
    <>
      <Select<string[], NodeOption>
        mode="multiple"
        maxCount={100}
        style={{ width: '100%' }}
        placeholder="选择不下发的节点"
        showSearch
        loading={loading}
        value={value}
        options={[...options, ...missing]}
        filterOption={filterNodeOption}
        onChange={onChange}
      />
      {!loaded && !loading && <Note>节点列表读取失败，请关闭后重试。</Note>}
      {loaded && missing.length > 0 && (
        <Note>部分已选节点不在节点列表中，请确认节点状态；已删除的节点需移除后才能保存。</Note>
      )}
    </>
  )
}

export interface ReviewUser {
  id: number
  email?: string | null
  /** 当前是否处于任一限制中 */
  restricted?: boolean
  /** 一行风险摘要，例如「最近 1 小时：评分 25，订阅 30 次，IP 2 个」 */
  summary?: string
}

interface ReviewModalProps {
  user: ReviewUser
  /** 保存成功后：刷新概览（审核总数、限制中账号）、风险用户表（限制标记）与用户详情（审核记录、限制状态） */
  onSaved: () => void
  children: ReactElement<{ onClick?: MouseEventHandler }>
}

export function ReviewModal({ user, onSaved, children }: ReviewModalProps) {
  const [visible, setVisible] = useState(false)
  const [action, setAction] = useState<ReviewAction>('watch')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excluded, setExcluded] = useState<string[]>([])
  const detail = useQuery({
    queryKey: [...guardKeys.userDetail, user.id],
    queryFn: () => unwrap(fetchGuardUserDetail(user.id)),
    enabled: visible,
  })
  const currentRestriction = detail.data?.restriction
  const consumptionRestriction = detail.data?.consumption_restriction
  const canChangeRestriction =
    !detail.isFetching &&
    !detail.isError &&
    !!detail.data &&
    (!currentRestriction || currentRestriction.mode === 'decoy' || currentRestriction.mode === 'exclude')

  const close = () => setVisible(false)
  /** 关闭动画结束后再重置，避免关闭过程中内容跳变 */
  const reset = () => {
    setAction('watch')
    setReason('')
    setConfirmed(false)
    setExcluded([])
  }

  const submit = async () => {
    const text = reason.trim()
    const length = [...text].length
    if (length < REASON_MIN[action]) return message.error(`原因至少 ${REASON_MIN[action]} 个字`)
    if (length > REASON_MAX) return message.error(`原因不能超过 ${REASON_MAX} 字`)
    if (
      ['restrict', 'exclude', 'release', 'consumption_restrict', 'consumption_release'].includes(action) &&
      !canChangeRestriction
    )
      return message.error('当前限制状态尚未获取，请稍后重试')
    if (action === 'restrict' && !confirmed) return message.error('请先勾选确认限制')
    if (action === 'exclude' && excluded.length === 0) return message.error('请选择至少一个要排除的节点')
    setSaving(true)
    const res =
      action === 'restrict'
        ? await restrictGuardUser({ id: user.id, reason: text })
        : action === 'exclude'
          ? await excludeGuardNodes({
              id: user.id,
              reason: text,
              nodes: excluded.map((key) => {
                const node = parseNodeKey(key)
                return { node_type: node.type, node_id: node.id }
              }),
            })
          : action === 'release'
            ? await releaseGuardUser({ id: user.id, reason: text })
            : action === 'consumption_restrict'
              ? await restrictGuardConsumption({ id: user.id, reason: text })
              : action === 'consumption_release'
                ? await releaseGuardConsumption({ id: user.id, reason: text })
                : await saveGuardReview({ id: user.id, action, reason: text })
    setSaving(false)
    if (res.code !== 200 || res.data !== true) return
    message.success(
      action === 'restrict' || action === 'exclude'
        ? '已限制，下次拉取订阅或 App 配置生效'
        : action === 'release'
          ? '已解除节点限制'
          : action === 'consumption_restrict'
            ? '已限制消费'
            : action === 'consumption_release'
              ? '已解除消费限制'
              : '审核已保存',
    )
    close()
    onSaved()
  }

  return (
    <>
      {cloneElement(children, {
        onClick: () => {
          setVisible(true)
        },
      })}
      <Modal
        title="人工审核"
        open={visible}
        onCancel={close}
        afterClose={reset}
        onOk={() => void submit()}
        okText={
          action === 'restrict'
            ? '确认限制'
            : action === 'release'
              ? '解除节点限制'
              : action === 'consumption_restrict'
                ? '确认限制消费'
                : action === 'consumption_release'
                  ? '解除消费限制'
                  : '保存审核'
        }
        okButtonProps={{ loading: saving, danger: action === 'restrict' }}
        cancelText="取消"
        // 提交中不能关闭：避免请求还在进行时弹窗已经关掉、结果无处提示
        mask={{ closable: false }}
        keyboard={!saving}
        closable={!saving}
        cancelButtonProps={{ disabled: saving }}
      >
        <FormGroup label="用户">
          <div>
            {userLabel(user.email, user.id)}
            {user.email && <span style={MUTED}> #{user.id}</span>}
            {(detail.data ? !!currentRestriction || !!consumptionRestriction : user.restricted) ? (
              <Tag color="red" style={{ marginLeft: 8 }}>
                已限制
              </Tag>
            ) : (
              <Tag style={{ marginLeft: 8 }}>未限制</Tag>
            )}
          </div>
          {user.summary && <Note>{user.summary}</Note>}
        </FormGroup>
        <FormGroup label="动作">
          <div>
            <Select<ReviewAction>
              style={{ width: '100%' }}
              value={action}
              options={actionOptions(!!currentRestriction, !!consumptionRestriction, action).map((option) => ({
                ...option,
                disabled:
                  ['restrict', 'exclude', 'release', 'consumption_restrict', 'consumption_release'].includes(
                    option.value,
                  ) && !canChangeRestriction,
              }))}
              onChange={(value) => {
                setAction(value)
                setConfirmed(false)
                if (value === 'exclude')
                  setExcluded(
                    (currentRestriction?.excluded_nodes ?? []).map((node) =>
                      nodeKey({ type: node.node_type, id: node.node_id }),
                    ),
                  )
              }}
            />
          </div>
        </FormGroup>
        {detail.isFetching && <Note style={{ marginBottom: 12 }}>正在读取当前限制状态…</Note>}
        {detail.isError && <Note style={{ marginBottom: 12 }}>当前限制状态读取失败，请关闭后重试。</Note>}
        {currentRestriction && (
          <Note style={{ marginBottom: 12 }}>
            当前限制：
            {currentRestriction.mode === 'exclude'
              ? '节点排除'
              : currentRestriction.mode === 'decoy'
                ? '下发假入口'
                : '类型未获取'}
            。
          </Note>
        )}
        {consumptionRestriction && <Note style={{ marginBottom: 12 }}>当前限制：消费限制。</Note>}
        {action === 'consumption_restrict' && (
          <div className="alert alert-warning" role="alert" style={{ marginBottom: 16 }}>
            限制后不能新建购买、续费、变更、充值和流量重置包订单；自动续费暂停，解除后按原有规则执行。
            已有订单仍可继续付款，礼品卡兑换和提前开启下一周期不受影响。节点限制与消费限制相互独立。
          </div>
        )}
        {action === 'consumption_release' && <Note style={{ marginBottom: 16 }}>解除消费限制不会改变节点限制。</Note>}
        {action === 'release' && consumptionRestriction && (
          <Note style={{ marginBottom: 16 }}>解除节点限制不会改变消费限制。</Note>
        )}
        {action === 'restrict' && (
          <div className="alert alert-warning" role="alert" style={{ marginBottom: 16 }}>
            <p className="mb-2">
              限制不封号：之后拉取的订阅与 App 配置中，节点入口、SNI、Host 头及 obfs host
              换成假地址（风控设置未填时按用户生成固定保留段 IPv4），端口与凭据不变。
              登录后的用户面板不受影响，解除后恢复；已缓存的旧配置不会被主动撤回。限制状态查询异常时，配置暂不可用。
            </p>
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
              我确认限制该用户
            </Checkbox>
          </div>
        )}
        {action === 'exclude' && (
          <>
            <FormGroup label="排除节点">
              <ExcludedNodeSelect value={excluded} onChange={setExcluded} />
              <Note>
                最多选择 100 个节点。选中的节点不会下发；其他节点正常下发。已缓存的旧配置及现有连接不会被主动撤回。
              </Note>
            </FormGroup>
          </>
        )}
        {currentRestriction &&
          ((action === 'exclude' && currentRestriction.mode === 'decoy') ||
            (action === 'restrict' && currentRestriction.mode === 'exclude')) && (
            <Note style={{ marginBottom: 16 }}>保存后将替换当前节点限制，假入口限制与节点排除不能同时生效。</Note>
          )}
        {action === 'restrict' && currentRestriction && (
          <Note style={{ marginBottom: 16 }}>保存后会更新限制并再记一条审核记录。</Note>
        )}
        <FormGroup label="原因">
          <Input.TextArea
            rows={4}
            placeholder={placeholder(action)}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormGroup>
        <Note>所有动作都会记入该用户的审核记录；账号封禁请在用户管理中经独立确认后操作。</Note>
      </Modal>
    </>
  )
}
