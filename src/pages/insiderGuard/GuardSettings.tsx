// 风控设置（独占一个标签页）：config/fetch?key=insider_guard 读取初值，整组提交 config/save
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, InputNumber, Switch } from 'antd'
import { useState, type ReactNode } from 'react'
import { unwrap } from '@/api/request'
import { fetchConfig, saveConfig } from '@/api/services/config'
import { message } from '@/app/staticApi'
import { Loading } from '@/components/Loading'
import { Failed, guardKeys, MUTED, Note, Section } from './shared'

interface GuardConfig {
  /** 高风险阈值：评分达到该值标为高风险 */
  insider_guard_risk_threshold: number
  /** 审计记录保留天数 1～365 */
  insider_guard_retention_days: number
  /** 假入口地址：被限制的用户拉订阅时所有节点的连接地址都换成它；留空则后端按用户生成固定的假公网 IPv4 */
  insider_guard_decoy_host: string
  insider_guard_subscribe_audit_enabled: number
  insider_guard_subscribe_audit_retention_days: number
  insider_guard_subscribe_audit_max_records: number
}

type NumberKey = Exclude<keyof GuardConfig, 'insider_guard_decoy_host'>

const DEFAULTS: GuardConfig = {
  insider_guard_risk_threshold: 50,
  insider_guard_retention_days: 3,
  insider_guard_decoy_host: '',
  insider_guard_subscribe_audit_enabled: 1,
  insider_guard_subscribe_audit_retention_days: 3,
  insider_guard_subscribe_audit_max_records: 100000,
}

/** 假入口地址：IPv6（至少两个冒号，可带方括号，后端会去掉）| IPv4（四段数字）| 域名 三选一，与后端 ConfigSave 的校验一致 */
const HOST_PATTERN =
  /^(\[[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*\]|[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*|\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*)$/

/** 后端返回的值可能是字符串，统一转成整数；不是数字时用默认值 */
function normalize(raw: Record<string, unknown> | undefined): GuardConfig {
  const int = (key: NumberKey) => {
    const value = Number.parseInt(String(raw?.[key] ?? ''), 10)
    return Number.isNaN(value) ? DEFAULTS[key] : value
  }
  return {
    insider_guard_risk_threshold: int('insider_guard_risk_threshold'),
    insider_guard_retention_days: int('insider_guard_retention_days'),
    insider_guard_decoy_host: String(raw?.insider_guard_decoy_host ?? '').trim(),
    insider_guard_subscribe_audit_enabled: int('insider_guard_subscribe_audit_enabled'),
    insider_guard_subscribe_audit_retention_days: int('insider_guard_subscribe_audit_retention_days'),
    insider_guard_subscribe_audit_max_records: int('insider_guard_subscribe_audit_max_records'),
  }
}

/** 输入框后面的单位 */
function Unit({ children }: { children: ReactNode }) {
  return <span style={{ ...MUTED, marginLeft: 8 }}>{children}</span>
}

/** 一行设置：左边标题和说明，右边控件（与系统配置页同一种左文右控件的布局） */
function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="row" style={{ padding: '16px 0', borderBottom: '1px solid var(--v2b-line-soft, #eee)' }}>
      <div className="col-lg-8">
        <div style={{ fontWeight: 'bold', marginBottom: 5 }}>{title}</div>
        <div style={MUTED}>{description}</div>
      </div>
      <div className="col-lg-4 text-right">{children}</div>
    </div>
  )
}

export function GuardSettings() {
  const config = useQuery({
    queryKey: guardKeys.config,
    queryFn: () => unwrap(fetchConfig('insider_guard')),
  })
  const retry = (
    <Button size="small" loading={config.isFetching} onClick={() => void config.refetch()}>
      重试
    </Button>
  )
  return (
    <Section>
      <Loading loading={config.isLoading}>
        {config.data ? (
          <>
            {/* 已经读到过配置、重新读取失败：表单不重建，保留当前显示的值（含未保存的修改） */}
            {config.isError && <Note style={{ padding: '12px 0 0' }}>重新读取失败，表单保留当前显示的值 {retry}</Note>}
            {/* 重新读取到配置时（key 变化）按新值重建表单，覆盖未保存的修改 */}
            <SettingsForm key={config.dataUpdatedAt} initial={normalize(config.data.insider_guard)} />
          </>
        ) : config.isError ? (
          <Failed>读取失败：风控设置暂时无法加载 {retry}</Failed>
        ) : (
          <div style={{ minHeight: 120 }} />
        )}
      </Loading>
    </Section>
  )
}

function SettingsForm({ initial }: { initial: GuardConfig }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<GuardConfig>(initial)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof GuardConfig>(key: K, value: GuardConfig[K] | null) => {
    if (value === null) return
    setForm((f) => ({ ...f, [key]: value }))
  }

  const save = async () => {
    if (
      !Number.isInteger(form.insider_guard_retention_days) ||
      form.insider_guard_retention_days < 1 ||
      form.insider_guard_retention_days > 365
    ) {
      return message.error('审计保留天数需在 1～365 之间')
    }
    if (
      !Number.isInteger(form.insider_guard_risk_threshold) ||
      form.insider_guard_risk_threshold < 1 ||
      form.insider_guard_risk_threshold > 50
    ) {
      return message.error('高风险阈值需为 1～50 之间的整数')
    }
    const host = form.insider_guard_decoy_host.trim()
    if (host && !HOST_PATTERN.test(host)) return message.error('假入口地址只能填域名或 IP')
    if (
      !Number.isInteger(form.insider_guard_subscribe_audit_retention_days) ||
      form.insider_guard_subscribe_audit_retention_days < 1 ||
      form.insider_guard_subscribe_audit_retention_days > 365
    ) {
      return message.error('逐次订阅审计保留天数需为 1～365 之间的整数')
    }
    if (
      !Number.isInteger(form.insider_guard_subscribe_audit_max_records) ||
      form.insider_guard_subscribe_audit_max_records < 1 ||
      form.insider_guard_subscribe_audit_max_records > 1000000
    ) {
      return message.error('逐次订阅审计最多记录数需为 1～1000000 之间的整数')
    }
    setSaving(true)
    const res = await saveConfig({ ...form, insider_guard_decoy_host: host })
    setSaving(false)
    if (res.code !== 200 || res.data !== true) return
    message.success('保存成功')
    // 阈值影响风险用户的高风险判定与用户详情里的「需人工复核」。
    void queryClient.invalidateQueries({ queryKey: guardKeys.config })
    void queryClient.invalidateQueries({ queryKey: guardKeys.usersAll })
    void queryClient.invalidateQueries({ queryKey: guardKeys.userDetail })
    void queryClient.invalidateQueries({ queryKey: guardKeys.subscribeAudit })
    void queryClient.invalidateQueries({ queryKey: guardKeys.subscribeAuditStats })
  }

  return (
    <>
      <Row
        title="高风险阈值"
        description="评分达到阈值标为高风险。所选时段订阅拉取超过 20 次加 25 分，登录与订阅合计来源 IP 超过 8 个加 25 分；评分仅为 0、25、50，阈值 1～50，默认 50。仅提示人工复核，不会自动限制账号"
      >
        <InputNumber
          min={1}
          max={50}
          precision={0}
          value={form.insider_guard_risk_threshold}
          onChange={(v) => set('insider_guard_risk_threshold', v)}
        />
      </Row>
      <Row
        title="小时活动保留天数"
        description="每小时清理超过保留期的登录 / 订阅活动及不活跃节点下发记录，UA 字典多留 1 天。审核与异常登记长期保留；持续活跃的节点记录首次时间可能更早。1～365 天，默认 3；不足 2 天可能影响候选完整性。每活跃设备每天约 24 行、每行约 0.4 KB，万级用户建议不超过 7 天；数据含 IP 与 UA，请按当地法规设置"
      >
        <InputNumber
          min={1}
          max={365}
          precision={0}
          value={form.insider_guard_retention_days}
          onChange={(v) => set('insider_guard_retention_days', v)}
        />
        <Unit>天</Unit>
      </Row>
      <Row
        title="假入口地址"
        description="被限制账号的订阅与 App 配置节点入口、SNI、Host 头及 obfs host 换成该地址，端口、凭据不变（节点名恰好等于入口地址时也替换）。留空则按用户生成固定的保留段 IPv4（240～254 开头），也可填自己的蜜罐。解除后恢复，不影响登录后的用户面板；限制状态查询异常时配置暂不可用"
      >
        <Input
          style={{ width: 220 }}
          placeholder="留空自动生成"
          maxLength={253}
          value={form.insider_guard_decoy_host}
          onChange={(e) => set('insider_guard_decoy_host', e.target.value)}
        />
      </Row>
      <h3 className="block-title" style={{ marginTop: 24 }}>
        逐次订阅审计
      </h3>
      <Row
        title="启用逐次采集"
        description="识别到用户后，逐次记录普通订阅与 App 配置请求及处理失败；无效 token、提前拦截不在覆盖范围。记录异步写入，不保存 token、完整请求 URL 或请求头。关闭后保留已有数据并继续自动清理，不影响上方小时活动与风险评分"
      >
        <Switch
          aria-label="启用逐次订阅审计"
          checked={form.insider_guard_subscribe_audit_enabled === 1}
          onChange={(checked) => set('insider_guard_subscribe_audit_enabled', checked ? 1 : 0)}
        />
      </Row>
      <Row
        title="逐次明细保留天数"
        description="独立于上方小时活动保留期，范围 1～365 天，默认 3 天。超过天数或条数任一上限时，自动清理最旧明细；缩短上限可能删除已有明细"
      >
        <InputNumber
          aria-label="逐次订阅审计保留天数"
          min={1}
          max={365}
          precision={0}
          value={form.insider_guard_subscribe_audit_retention_days}
          onChange={(value) => set('insider_guard_subscribe_audit_retention_days', value)}
        />
        <Unit>天</Unit>
      </Row>
      <Row
        title="逐次明细最多条数"
        description="范围 1～1000000 条，默认 100000 条。每分钟分批清理，短时超限在后续轮次收敛。逐次明细占用高于小时合并数据，请结合使用量设置；统计只覆盖仍保留的明细"
      >
        <InputNumber
          aria-label="逐次订阅审计最多记录数"
          min={1}
          max={1000000}
          precision={0}
          value={form.insider_guard_subscribe_audit_max_records}
          onChange={(value) => set('insider_guard_subscribe_audit_max_records', value)}
        />
        <Unit>条</Unit>
      </Row>
      <div style={{ padding: '16px 0' }}>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </div>
    </>
  )
}
