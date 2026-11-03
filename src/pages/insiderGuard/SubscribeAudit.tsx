import { FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DatePicker, Input, Select, Tag, type TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { ApiError, unwrap } from '@/api/request'
import { fetchConfig } from '@/api/services/config'
import { fetchSubscribeAudit, fetchSubscribeAuditStats } from '@/api/services/insiderGuard'
import type {
  SubscribeAuditDimension,
  SubscribeAuditFilter,
  SubscribeAuditRecord,
  SubscribeAuditStats,
} from '@/api/types'
import { message } from '@/app/staticApi'
import { paginationProps } from '@/hooks/usePagedList'
import { useUi } from '@/stores/appearance'
import { SubscribeAuditDetail } from './SubscribeAuditDetail'
import {
  defaultSubscribeAuditDraft,
  subscribeAuditFilter,
  SUBSCRIBE_AUDIT_RESULT,
  SUBSCRIBE_AUDIT_SOURCE,
  type SubscribeAuditDraft,
} from './subscribeAuditFilters'
import { Ellipsis, Failed, guardKeys, guardTime, MUTED, Note, Section, SubTable, userLabel } from './shared'

type Page = { current: number; pageSize: number }
const listKey = (filters: SubscribeAuditFilter, page: Page) => [...guardKeys.subscribeAudit, filters, page] as const
const statsKey = (filters: SubscribeAuditFilter, dimension: SubscribeAuditDimension) =>
  [...guardKeys.subscribeAuditStats, filters, dimension] as const
const listData = async (filters: SubscribeAuditFilter, page: Page) => {
  const response = await fetchSubscribeAudit({ ...filters, ...page })
  if (response.code !== 200) throw new ApiError(response.code, response.msg)
  return { rows: response.data ?? [], total: response.total ?? 0 }
}
const DIMENSIONS: Array<{ value: SubscribeAuditDimension; label: string }> = [
  { value: 'ip', label: 'IP 排行' },
  { value: 'ua', label: 'UA 排行' },
  { value: 'user', label: '用户排行' },
]

export function SubscribeAudit({ onUserDetail }: { onUserDetail: (id: number) => void }) {
  const ui = useUi()
  const client = useQueryClient()
  const [draft, setDraft] = useState(defaultSubscribeAuditDraft)
  const [applied, setApplied] = useState(draft)
  const [filters, setFilters] = useState(() => subscribeAuditFilter(draft))
  const [page, setPage] = useState<Page>({ current: 1, pageSize: 20 })
  const [dimension, setDimension] = useState<SubscribeAuditDimension>('ip')
  const [showFilters, setShowFilters] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [detailId, setDetailId] = useState<number>()
  const records = useQuery({
    queryKey: listKey(filters, page),
    queryFn: () => listData(filters, page),
    placeholderData: keepPreviousData,
  })
  const stats = useQuery({
    queryKey: statsKey(filters, dimension),
    queryFn: () => unwrap(fetchSubscribeAuditStats({ ...filters, dimension })),
  })
  const config = useQuery({ queryKey: guardKeys.config, queryFn: () => unwrap(fetchConfig('insider_guard')) })

  const load = async (next: SubscribeAuditFilter, nextPage: Page, fresh: boolean) => {
    setRefreshing(true)
    try {
      // 防止更早的普通统计响应覆盖手动强制重算的结果。
      await client.cancelQueries({ queryKey: statsKey(next, dimension), exact: true })
      const pending = [
        client.fetchQuery({ queryKey: listKey(next, nextPage), queryFn: () => listData(next, nextPage), staleTime: 0 }),
        client.fetchQuery({
          queryKey: statsKey(next, dimension),
          queryFn: () =>
            unwrap(fetchSubscribeAuditStats({ ...next, dimension, ...(fresh ? { fresh: 1 as const } : {}) })),
          staleTime: 0,
        }),
      ]
      setFilters(next)
      setPage(nextPage)
      await Promise.all(pending)
    } catch {
      // 请求层已经显示错误，表格继续保留可用的上次结果。
    } finally {
      setRefreshing(false)
    }
  }
  const apply = () => {
    try {
      const next = subscribeAuditFilter(draft)
      setApplied({ ...draft })
      void load(next, { ...page, current: 1 }, false)
    } catch (error) {
      message.error((error as Error).message)
    }
  }
  const refresh = () => void load(subscribeAuditFilter(applied), page, true)
  const patch = <K extends keyof SubscribeAuditDraft>(key: K, value: SubscribeAuditDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }))
  const narrow = (field: 'ip' | 'ua' | 'user_id', value: string | number) => {
    if (value === '') return
    const nextDraft = { ...applied, [field]: String(value) }
    setDraft(nextDraft)
    setApplied(nextDraft)
    void load(subscribeAuditFilter(nextDraft), { ...page, current: 1 }, false)
  }

  const columns: TableColumnsType<SubscribeAuditRecord> = [
    {
      title: '拉取时间',
      dataIndex: 'requested_at',
      key: 'requested_at',
      width: 170,
      render: (value: number, record) => <a onClick={() => setDetailId(record.id)}>{guardTime(value)}</a>,
    },
    {
      title: '用户',
      key: 'user',
      width: 220,
      render: (_: unknown, record) => (
        <a onClick={() => onUserDetail(record.user_id)}>{userLabel(record.email, record.user_id)}</a>
      ),
    },
    {
      title: '来源 IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 150,
      render: (value: string) => value || '未知',
    },
    {
      title: '客户端 UA',
      dataIndex: 'ua',
      key: 'ua',
      width: 230,
      render: (value: string) => <Ellipsis text={value} width={220} empty="未提供" />,
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (value: SubscribeAuditRecord['source']) => SUBSCRIBE_AUDIT_SOURCE[value],
    },
    { title: '格式', dataIndex: 'format', key: 'format', width: 110, render: (value: string) => value || '-' },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 110,
      render: (value: SubscribeAuditRecord['result']) => (
        <Tag color={SUBSCRIBE_AUDIT_RESULT[value].color}>{SUBSCRIBE_AUDIT_RESULT[value].label}</Tag>
      ),
    },
    { title: 'HTTP 状态', dataIndex: 'status', key: 'status', width: 100 },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 90,
      render: (value: number) => `${value} ms`,
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button size="small" onClick={() => setDetailId(record.id)}>
          详情
        </Button>
      ),
    },
  ]
  const rankColumns: TableColumnsType<SubscribeAuditStats['ranking'][number]> = [
    { title: '排名', key: 'rank', width: 65, render: (_: unknown, _row, index) => index + 1 },
    {
      title: DIMENSIONS.find((item) => item.value === dimension)?.label,
      key: 'value',
      render: (_: unknown, row) =>
        row.value !== '' ? (
          <a onClick={() => narrow(dimension === 'user' ? 'user_id' : dimension, row.value)}>
            <Ellipsis text={row.label} width={360} />
          </a>
        ) : (
          row.label
        ),
    },
    { title: '拉取次数', dataIndex: 'count', key: 'count', width: 110 },
    {
      title: '最后拉取',
      dataIndex: 'last_at',
      key: 'last_at',
      width: 170,
      render: (value: number) => guardTime(value),
    },
  ]

  return (
    <Section
      extra={
        <>
          <Button icon={<FilterOutlined />} onClick={() => setShowFilters((value) => !value)}>
            {showFilters ? '收起筛选' : '筛选条件'}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={refreshing || records.isFetching || stats.isFetching}
            onClick={refresh}
          >
            刷新
          </Button>
          <span style={MUTED}>{applied.rolling ? '最近 24 小时（刷新时滚动）' : '自选时间范围'}</span>
        </>
      }
    >
      <Note style={{ marginBottom: 12 }}>
        这里按每次请求独立记录，与“最近事件”的小时合并数据独立。仅覆盖识别到用户后的订阅 / App 请求及其失败，不覆盖无效
        token 或提前拦截。记录异步写入，可能稍有延迟。
      </Note>
      {Number(config.data?.insider_guard?.insider_guard_subscribe_audit_enabled ?? 1) === 0 && (
        <Note style={{ marginBottom: 12 }}>逐次采集已关闭，已有记录仍可查询并按保留设置清理。</Note>
      )}
      {showFilters && (
        <div style={{ border: '1px solid var(--v2b-line-soft, #eee)', padding: 12, marginBottom: 16 }}>
          <div className="d-flex flex-wrap" style={{ gap: 10, marginBottom: 10 }}>
            <Select
              aria-label="审计时间范围"
              style={{ width: 150 }}
              value={draft.rolling ? '24h' : 'custom'}
              options={[
                { value: '24h', label: '最近 24 小时' },
                { value: 'custom', label: '自选时间' },
              ]}
              onChange={(value) => patch('rolling', value === '24h')}
            />
            {!draft.rolling && (
              <DatePicker.RangePicker
                showTime
                allowEmpty={[true, true]}
                value={[
                  draft.time_from === undefined ? null : dayjs.unix(draft.time_from),
                  draft.time_to === undefined ? null : dayjs.unix(draft.time_to),
                ]}
                onChange={(values) =>
                  setDraft((previous) => ({
                    ...previous,
                    time_from: values?.[0]?.unix(),
                    time_to: values?.[1]?.unix(),
                  }))
                }
              />
            )}
            <Input
              aria-label="审计用户 ID"
              placeholder="用户 ID"
              style={{ width: 130 }}
              value={draft.user_id}
              onChange={(event) => patch('user_id', event.target.value)}
            />
            <Input
              aria-label="邮箱包含"
              placeholder="邮箱包含"
              maxLength={64}
              style={{ width: 200 }}
              value={draft.email}
              onChange={(event) => patch('email', event.target.value)}
            />
            <Input
              aria-label="精确来源 IP"
              placeholder="来源 IP（精确）"
              maxLength={45}
              style={{ width: 190 }}
              value={draft.ip}
              onChange={(event) => patch('ip', event.target.value)}
            />
            <Input
              aria-label="UA 包含"
              placeholder="UA 包含"
              maxLength={512}
              style={{ width: 220 }}
              value={draft.ua}
              onChange={(event) => patch('ua', event.target.value)}
            />
            <Input
              aria-label="精确订阅格式"
              placeholder="格式（精确）"
              maxLength={64}
              style={{ width: 150 }}
              value={draft.format}
              onChange={(event) => patch('format', event.target.value)}
            />
            <Select
              aria-label="审计请求来源"
              style={{ width: 150 }}
              value={draft.source}
              options={[
                { value: '', label: '全部来源' },
                ...Object.entries(SUBSCRIBE_AUDIT_SOURCE).map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) => patch('source', value)}
            />
            <Select
              aria-label="审计处理结果"
              style={{ width: 150 }}
              value={draft.result}
              options={[
                { value: '', label: '全部结果' },
                ...Object.entries(SUBSCRIBE_AUDIT_RESULT).map(([value, item]) => ({ value, label: item.label })),
              ]}
              onChange={(value) => patch('result', value)}
            />
            <Input
              aria-label="审计 HTTP 状态"
              placeholder="HTTP 状态 100～599"
              style={{ width: 170 }}
              value={draft.status}
              onChange={(event) => patch('status', event.target.value)}
            />
          </div>
          <div className="d-flex" style={{ gap: 8 }}>
            <Button type="primary" icon={<SearchOutlined />} onClick={apply} loading={refreshing}>
              应用筛选
            </Button>
            <Button onClick={() => setDraft(defaultSubscribeAuditDraft())}>重置草稿</Button>
          </div>
          <Note style={{ marginTop: 8 }}>
            修改后点击“应用筛选”才更新列表和统计。自选时间留空时查询全部保留明细；刷新使用已应用条件。
          </Note>
        </div>
      )}
      <div className="d-flex flex-wrap" style={{ gap: 28, marginBottom: 12 }}>
        {(
          [
            ['匹配记录', 'total'],
            ['涉及用户', 'users'],
            ['来源 IP 数', 'ips'],
            ['UA 数', 'uas'],
          ] as const
        ).map(([label, key]) => (
          <div key={key}>
            <div style={MUTED}>{label}</div>
            <div style={{ fontSize: 24 }}>{stats.data?.[key] ?? '-'}</div>
          </div>
        ))}
      </div>
      <div className="d-flex flex-wrap align-items-center" style={{ gap: 10, marginBottom: 10 }}>
        <strong>拉取 Top 10</strong>
        <Select
          aria-label="订阅统计维度"
          style={{ width: 140 }}
          value={dimension}
          options={DIMENSIONS}
          onChange={setDimension}
          disabled={refreshing}
        />
        {stats.data && <span style={MUTED}>统计于 {guardTime(stats.data.generated_at)}</span>}
      </div>
      {stats.isError && <Failed>统计加载失败，可点击刷新重试。</Failed>}
      <SubTable
        rowKey={(row) => String(row.value)}
        loading={stats.isFetching}
        dataSource={stats.data?.ranking ?? []}
        columns={rankColumns}
        scroll={{ x: 600 }}
      />
      <Note style={{ marginBottom: 16 }}>
        统计覆盖符合筛选的全部保留明细，不受当前分页影响；最多缓存 60
        秒，点击刷新会强制重算。排行可点击筛选，不代表异常结论。
      </Note>
      {records.isError && <Failed>明细加载失败，可点击刷新重试。</Failed>}
      <SubTable<SubscribeAuditRecord>
        rowKey="id"
        loading={records.isFetching}
        dataSource={records.data?.rows ?? []}
        columns={columns}
        scroll={{ x: 1450 }}
        pagination={{
          ...paginationProps(ui),
          ...page,
          total: records.data?.total ?? 0,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
        }}
        onChange={(next) =>
          setPage({
            current: next.pageSize !== page.pageSize ? 1 : (next.current ?? 1),
            pageSize: next.pageSize ?? page.pageSize,
          })
        }
      />
      <SubscribeAuditDetail id={detailId} onClose={() => setDetailId(undefined)} />
    </Section>
  )
}
