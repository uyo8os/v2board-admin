import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Dropdown, Empty, Input, Pagination, Select, Skeleton, Switch, Tag, Tooltip } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { usePlans } from '@/api/queries'
import { unwrap } from '@/api/request'
import { dropSpeedLimitRule, fetchSpeedLimitRules, toggleSpeedLimitRule } from '@/api/services/speedLimit'
import type { SpeedLimitRule } from '@/api/types'
import { message, modal } from '@/app/staticApi'
import { AdminLayout } from '@/layouts/AdminLayout'
import { RuleDrawer } from './RuleDrawer'
import { duration, enabled, RECORDS_KEY, RULES_KEY, traffic } from './utils'
import './speedlimit.scss'

export default function SpeedLimitPage() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const query = useQuery({ queryKey: RULES_KEY, queryFn: () => unwrap(fetchSpeedLimitRules()) })
  const { data: plans = [] } = usePlans()
  const [editing, setEditing] = useState<SpeedLimitRule | 'new'>()
  const [busy, setBusy] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const rules = query.data ?? []
  const filtered = rules.filter(
    (rule) =>
      rule.name.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'all' || enabled(rule.enable) === (status === 'enabled')),
  )
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)))
  const refresh = () => client.invalidateQueries({ queryKey: RULES_KEY })

  const toggle = async (rule: SpeedLimitRule) => {
    setBusy((ids) => [...ids, rule.id])
    try {
      const res = await toggleSpeedLimitRule(rule.id)
      if (res.code === 200) await refresh()
    } finally {
      setBusy((ids) => ids.filter((id) => id !== rule.id))
    }
  }
  const drop = (rule: SpeedLimitRule) =>
    modal.confirm({
      title: `删除「${rule.name}」？`,
      content: '删除后，当前限速会自动解除，关联的历史记录也会一并清除。',
      okText: '删除规则',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await unwrap(dropSpeedLimitRule(rule.id))
        void message.success('规则已删除')
        void refresh()
        void client.invalidateQueries({ queryKey: RECORDS_KEY })
      },
    })
  const records = (rule: SpeedLimitRule, history = false) =>
    navigate(
      `/server/speedlimit/${history ? 'history' : 'manage'}?${new URLSearchParams({ rule_id: String(rule.id), name: rule.name })}`,
    )

  return (
    <AdminLayout title="动态限速">
      <div className="sl-page">
        <header className="sl-page-heading">
          <div>
            <div className="sl-eyebrow">
              <ThunderboltOutlined /> 流量策略
            </div>
            <h1>让带宽分配更从容</h1>
            <p>按流量自动触发限速，到期恢复，兼顾高峰体验与公平使用。</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            创建规则
          </Button>
        </header>
        <div className="sl-overview" aria-label="规则概览">
          <div>
            <span>全部规则</span>
            <strong>{query.isPending ? '—' : rules.length}</strong>
          </div>
          <div>
            <span>
              <i className="sl-dot" />
              已启用
            </span>
            <strong>{query.isPending ? '—' : rules.filter((rule) => enabled(rule.enable)).length}</strong>
          </div>
          <div>
            <span>覆盖节点</span>
            <strong>
              {query.isPending
                ? '—'
                : new Set(
                    rules
                      .filter((rule) => enabled(rule.enable))
                      .flatMap((rule) => rule.node_ids.map((node) => `${node.type}:${node.id}`)),
                  ).size}
              <small>个</small>
            </strong>
          </div>
        </div>
        <div className="sl-toolbar">
          <Input
            aria-label="搜索规则"
            prefix={<SearchOutlined />}
            placeholder="搜索规则名称"
            allowClear
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          <Select
            aria-label="规则状态"
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'enabled', label: '已启用' },
              { value: 'disabled', label: '已停用' },
            ]}
          />
          <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
            刷新
          </Button>
        </div>
        {query.isError && (
          <Alert
            type="error"
            showIcon
            title="无法加载限速规则"
            action={<Button onClick={() => void query.refetch()}>重试</Button>}
          />
        )}
        {query.isPending ? (
          <div className="sl-rule-grid">
            {[1, 2].map((id) => (
              <div className="sl-rule-card" key={id}>
                <Skeleton active paragraph={{ rows: 6 }} />
              </div>
            ))}
          </div>
        ) : (
          !query.isError && (
            <>
              {filtered.length === 0 ? (
                <div className="sl-empty">
                  <Empty description={rules.length ? '没有找到匹配的规则' : '还没有限速规则'}>
                    {!rules.length && (
                      <Button type="primary" onClick={() => setEditing('new')}>
                        创建第一条规则
                      </Button>
                    )}
                  </Empty>
                </div>
              ) : (
                <div className="sl-rule-grid">
                  {filtered.slice((current - 1) * 12, current * 12).map((rule) => (
                    <article className={`sl-rule-card${enabled(rule.enable) ? '' : ' sl-rule-disabled'}`} key={rule.id}>
                      <div className="sl-card-heading">
                        <div>
                          <span className="sl-rule-id">RULE / {String(rule.id).padStart(2, '0')}</span>
                          <h2>{rule.name}</h2>
                        </div>
                        <div className="sl-status">
                          <span>{enabled(rule.enable) ? '已启用' : '已停用'}</span>
                          <Switch
                            checked={enabled(rule.enable)}
                            loading={busy.includes(rule.id)}
                            aria-label={`${enabled(rule.enable) ? '停用' : '启用'}${rule.name}`}
                            onChange={() => void toggle(rule)}
                          />
                        </div>
                      </div>
                      <div className="sl-card-tags">
                        <Tag>{enabled(rule.daily_enabled) ? '每日统计' : '计时窗口'}</Tag>
                        <Tooltip
                          title={
                            enabled(rule.plan_limit_enabled)
                              ? rule.plan_ids
                                  .map((id) => plans.find((plan) => plan.id === Number(id))?.name ?? `订阅 #${id}`)
                                  .join('、')
                              : '适用于所选节点上的全部用户'
                          }
                        >
                          <Tag>{enabled(rule.plan_limit_enabled) ? `${rule.plan_ids.length} 个订阅` : '全部用户'}</Tag>
                        </Tooltip>
                        {enabled(rule.disconnect_existing_connections) && <Tag color="orange">触发时断连</Tag>}
                      </div>
                      <div className="sl-threshold">
                        <div>
                          <span>累计流量达到</span>
                          <strong>{traffic(rule.threshold)}</strong>
                        </div>
                        <ArrowRightOutlined />
                        <div>
                          <span>自动限速至</span>
                          <strong>
                            {rule.speed_limit}
                            <small>Mbps</small>
                          </strong>
                        </div>
                      </div>
                      <dl className="sl-rule-facts">
                        <div>
                          <dt>统计范围</dt>
                          <dd>{rule.node_ids.length} 个节点</dd>
                        </div>
                        <div>
                          <dt>统计窗口</dt>
                          <dd>{enabled(rule.daily_enabled) ? '每日 0 点重置' : duration(rule.trigger_period)}</dd>
                        </div>
                        <div>
                          <dt>恢复时间</dt>
                          <dd>{enabled(rule.daily_enabled) ? '次日 0 点' : `${duration(rule.limit_duration)}后`}</dd>
                        </div>
                      </dl>
                      <footer className="sl-card-actions">
                        <Button icon={<EditOutlined />} onClick={() => setEditing(rule)}>
                          编辑
                        </Button>
                        <Button icon={<UserOutlined />} onClick={() => records(rule)}>
                          限速用户
                        </Button>
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              {
                                key: 'history',
                                icon: <HistoryOutlined />,
                                label: '历史记录',
                                onClick: () => records(rule, true),
                              },
                              {
                                key: 'delete',
                                icon: <DeleteOutlined />,
                                label: '删除规则',
                                danger: true,
                                onClick: () => drop(rule),
                              },
                            ],
                          }}
                        >
                          <Button icon={<MoreOutlined />} aria-label={`${rule.name}的更多操作`} />
                        </Dropdown>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
              {filtered.length > 12 && (
                <div className="sl-pagination">
                  <span>共 {filtered.length} 条规则</span>
                  <Pagination
                    current={current}
                    pageSize={12}
                    total={filtered.length}
                    showSizeChanger={false}
                    showLessItems
                    onChange={setPage}
                  />
                </div>
              )}
            </>
          )
        )}
        {editing && <RuleDrawer rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
      </div>
    </AdminLayout>
  )
}
