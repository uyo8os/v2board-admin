import { DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Drawer, Input, Select, Space, Tag, type TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { ApiError, unwrap, type ApiResult } from '@/api/request'
import { clearLogs, fetchMailLogs, fetchQueueLogs, fetchSystemLogs } from '@/api/services/logs'
import type { LogKind, LogPageParams, MailLog, QueueLog, SystemLog } from '@/api/services/logs'
import { message, modal } from '@/app/staticApi'
import { V2Table } from '@/components/table/V2Table'
import { V2Tabs } from '@/components/V2Tabs'
import { paginationProps } from '@/hooks/usePagedList'
import { AdminLayout } from '@/layouts/AdminLayout'
import { useUi } from '@/stores/appearance'
import { formatTime } from '@/utils/format'
import { queueName } from '@/utils/queue'

type LogRecord = SystemLog | QueueLog | MailLog
type Detail = { label: string; value: string | number | null | undefined }

const KIND_TITLE: Record<LogKind, string> = { system: '系统日志', queue: '队列日志', mail: '邮件日志' }
const LEVELS = ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY']
const LEVEL_COLORS: Record<string, string> = {
  WARNING: 'orange',
  ERROR: 'red',
  CRITICAL: 'red',
  ALERT: 'red',
  EMERGENCY: 'red',
}

const systemTime = (value: number) => (value ? formatTime(value, 'YYYY/MM/DD HH:mm:ss') : '—')
const failedTime = (value: string) => {
  const time = dayjs(value)
  return time.isValid() ? time.format('YYYY/MM/DD HH:mm:ss') : value || '—'
}

function textValue(value: Detail['value']) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value !== 'string') return String(value)
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function LogTable<T extends LogRecord>({
  kind,
  fetchPage,
  columns,
  description,
  filter,
  search,
}: {
  kind: LogKind
  fetchPage: (page: LogPageParams, filter: string) => Promise<ApiResult<T[]>>
  columns: (show: (details: Detail[]) => void) => TableColumnsType<T>
  description: string
  filter?: 'level' | 'email'
  search?: string
}) {
  const ui = useUi()
  const client = useQueryClient()
  const [page, setPage] = useState({ current: 1, pageSize: 10 })
  const [draft, setDraft] = useState('')
  const [applied, setApplied] = useState('')
  const [details, setDetails] = useState<Detail[]>()
  const key = ['logs', kind]
  const query = useQuery({
    queryKey: [...key, page, applied],
    queryFn: async () => {
      const response = await fetchPage({ current: page.current, page_size: page.pageSize }, applied)
      if (response.code !== 200) throw new ApiError(response.code, response.msg)
      return { rows: response.data ?? [], total: response.total ?? 0 }
    },
  })

  const applyFilter = (value: string) => {
    const next = value.trim()
    if (next === applied && page.current === 1) void query.refetch()
    else {
      setApplied(next)
      setPage((previous) => ({ ...previous, current: 1 }))
    }
  }

  const clear = () =>
    modal.confirm({
      title: `清空全部${KIND_TITLE[kind]}？`,
      content:
        kind === 'queue'
          ? '将删除全部失败作业记录，不受分页影响；Horizon 的统计数据不会同时清空。'
          : '将删除此类别的全部记录，包括当前筛选条件以外的记录。',
      okText: '确认清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!(await unwrap(clearLogs(kind)))) {
          void message.error('清空失败，请重试')
          throw new Error('清空日志失败')
        }
        setDetails(undefined)
        setPage((previous) => ({ ...previous, current: 1 }))
        await client.invalidateQueries({ queryKey: key })
        void message.success('日志已清空')
      },
    })

  return (
    <div className="block-content block-content-full">
      <p className="text-muted">{description}</p>
      <Space wrap style={{ marginBottom: 16 }}>
        {filter === 'level' && (
          <Select
            aria-label="日志级别"
            style={{ width: 160 }}
            value={draft}
            options={[{ label: '全部级别', value: '' }, ...LEVELS.map((level) => ({ label: level, value: level }))]}
            onChange={(value) => {
              setDraft(value)
              applyFilter(value)
            }}
          />
        )}
        {filter === 'email' && (
          <Input
            aria-label="收件邮箱"
            placeholder={search}
            allowClear
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (!event.target.value) applyFilter('')
            }}
            onPressEnter={() => applyFilter(draft)}
            style={{ width: 220 }}
          />
        )}
        {filter === 'email' && (
          <Button icon={<SearchOutlined />} onClick={() => applyFilter(draft)}>
            搜索
          </Button>
        )}
        <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
          刷新
        </Button>
        <Button danger icon={<DeleteOutlined />} disabled={query.isPending || query.isError} onClick={clear}>
          清空日志
        </Button>
      </Space>
      {query.isError ? (
        <Alert
          type="error"
          showIcon
          title="日志加载失败"
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      ) : (
        <V2Table<T>
          rowKey="id"
          loading={query.isFetching}
          columns={columns(setDetails)}
          dataSource={query.data?.rows ?? []}
          tableLayout="fixed"
          scroll={{ x: 850 }}
          pagination={{
            ...paginationProps(ui),
            ...page,
            total: query.data?.total ?? 0,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={(next) => setPage({ current: next.current ?? 1, pageSize: next.pageSize ?? page.pageSize })}
        />
      )}
      <Drawer
        title={`${KIND_TITLE[kind]}详情`}
        open={Boolean(details)}
        onClose={() => setDetails(undefined)}
        size="min(760px, 100vw)"
        destroyOnHidden
      >
        {details?.map((item) => (
          <section key={item.label} style={{ marginBottom: 20 }}>
            <strong>{item.label}</strong>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8, marginBottom: 0 }}>
              {textValue(item.value)}
            </pre>
          </section>
        ))}
      </Drawer>
    </div>
  )
}

const systemColumns = (show: (details: Detail[]) => void): TableColumnsType<SystemLog> => [
  { title: '时间', dataIndex: 'created_at', width: 180, render: systemTime },
  {
    title: '级别',
    dataIndex: 'level',
    width: 115,
    render: (value: string | null) => (value ? <Tag color={LEVEL_COLORS[value]}>{value}</Tag> : '—'),
  },
  { title: '事件', dataIndex: 'title', ellipsis: true },
  { title: '请求方式', dataIndex: 'method', width: 110 },
  { title: 'IP', dataIndex: 'ip', width: 155, render: (value: string | null) => value || '—' },
  {
    title: '操作',
    key: 'action',
    width: 80,
    render: (_, row) => (
      <Button
        type="link"
        onClick={() =>
          show([
            { label: 'ID', value: row.id },
            { label: '事件', value: row.title },
            { label: '级别', value: row.level },
            { label: '时间', value: systemTime(row.created_at) },
            { label: '请求方式', value: row.method },
            { label: '操作 / 路径', value: row.uri },
            { label: '主机', value: row.host },
            { label: 'IP', value: row.ip },
            { label: '请求数据', value: row.data },
            { label: '上下文', value: row.context },
          ])
        }
      >
        详情
      </Button>
    ),
  },
]

const queueColumns = (show: (details: Detail[]) => void): TableColumnsType<QueueLog> => [
  { title: '失败时间', dataIndex: 'failed_at', width: 180, render: failedTime },
  { title: '队列名称', dataIndex: 'queue', width: 150, render: (value: string) => queueName(value) },
  { title: '连接', dataIndex: 'connection', width: 100 },
  { title: '异常', dataIndex: 'exception', ellipsis: true },
  {
    title: '操作',
    key: 'action',
    width: 80,
    render: (_, row) => (
      <Button
        type="link"
        onClick={() =>
          show([
            { label: 'ID', value: row.id },
            { label: '失败时间', value: failedTime(row.failed_at) },
            { label: '队列', value: `${queueName(row.queue)} (${row.queue})` },
            { label: '连接', value: row.connection },
            { label: '异常', value: row.exception },
            { label: '任务数据', value: row.payload },
          ])
        }
      >
        详情
      </Button>
    ),
  },
]

const mailColumns = (show: (details: Detail[]) => void): TableColumnsType<MailLog> => [
  { title: '时间', dataIndex: 'created_at', width: 180, render: systemTime },
  { title: '收件邮箱', dataIndex: 'email', ellipsis: true },
  { title: '主题', dataIndex: 'subject', ellipsis: true },
  {
    title: '发送结果',
    key: 'result',
    width: 120,
    render: (_, row) => (row.error ? <Tag color="red">发送失败</Tag> : <Tag color="green">未报告错误</Tag>),
  },
  {
    title: '操作',
    key: 'action',
    width: 80,
    render: (_, row) => (
      <Button
        type="link"
        onClick={() =>
          show([
            { label: 'ID', value: row.id },
            { label: '时间', value: systemTime(row.created_at) },
            { label: '收件邮箱', value: row.email },
            { label: '主题', value: row.subject },
            { label: '模板', value: row.template_name },
            { label: '发送错误', value: row.error },
          ])
        }
      >
        详情
      </Button>
    ),
  },
]

export default function LogCenterPage() {
  return (
    <AdminLayout title="日志中心">
      <div className="block block-rounded">
        <V2Tabs
          size="large"
          items={[
            {
              key: 'system',
              label: '系统日志',
              children: (
                <LogTable
                  kind="system"
                  fetchPage={fetchSystemLogs}
                  columns={systemColumns}
                  filter="level"
                  description="查看系统事件及管理员操作记录。"
                />
              ),
            },
            {
              key: 'queue',
              label: '队列日志',
              children: (
                <LogTable
                  kind="queue"
                  fetchPage={fetchQueueLogs}
                  columns={queueColumns}
                  description="仅显示失败作业，不包含所有作业的执行历史。"
                />
              ),
            },
            {
              key: 'mail',
              label: '邮件日志',
              children: (
                <LogTable
                  kind="mail"
                  fetchPage={fetchMailLogs}
                  columns={mailColumns}
                  filter="email"
                  search="搜索收件邮箱"
                  description="记录邮件发送尝试；未报告错误不代表收件人已收到邮件。"
                />
              ),
            },
          ]}
        />
      </div>
    </AdminLayout>
  )
}
