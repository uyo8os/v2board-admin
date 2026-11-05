import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Input, Space, Tooltip, type TableColumnsType } from 'antd'
import { useRef, useState } from 'react'
import { ApiError, unwrap } from '@/api/request'
import {
  clearTrafficAdvanceRecords,
  fetchTrafficAdvanceRecords,
  type TrafficAdvanceRecord,
} from '@/api/services/trafficAdvance'
import { V2Table } from '@/components/table/V2Table'
import { paginationProps } from '@/hooks/usePagedList'
import { AdminLayout } from '@/layouts/AdminLayout'
import { useUi } from '@/stores/appearance'
import { formatTime } from '@/utils/format'
import { formatDeductDays } from './utils'

const time = (value: number) => formatTime(value, 'YYYY/MM/DD HH:mm:ss')
const columns: TableColumnsType<TrafficAdvanceRecord> = [
  { title: '时间', dataIndex: 'created_at', width: 180, render: time },
  { title: '邮箱', dataIndex: 'email', width: 240, ellipsis: true },
  { title: '订阅', dataIndex: 'plan_name', width: 210, ellipsis: true },
  {
    title: '扣除天数',
    dataIndex: 'deduct_seconds',
    width: 130,
    render: (seconds: number) => (
      <Tooltip title={`准确扣除 ${seconds} 秒`}>
        <span>{formatDeductDays(seconds)}</span>
      </Tooltip>
    ),
  },
  { title: '原到期时间', dataIndex: 'old_expired_at', width: 180, render: time },
  { title: '新到期时间', dataIndex: 'new_expired_at', width: 180, render: time },
]

export default function TrafficAdvancePage() {
  const { modal, message } = App.useApp()
  const client = useQueryClient()
  const ui = useUi()
  const [page, setPage] = useState({ current: 1, pageSize: 10 })
  const [draft, setDraft] = useState('')
  const [email, setEmail] = useState('')
  const [confirming, setConfirming] = useState(false)
  const clearBusy = useRef(false)
  const query = useQuery({
    queryKey: ['trafficAdvance', page, email],
    queryFn: async () => {
      const response = await fetchTrafficAdvanceRecords({ ...page, email })
      if (response.code !== 200) throw new ApiError(response.code, response.msg)
      return { rows: response.data ?? [], total: response.total ?? 0 }
    },
  })
  const cleanup = useMutation({
    mutationFn: (filter: string) => unwrap(clearTrafficAdvanceRecords(filter)),
    onSuccess: async ({ deleted }) => {
      void message.success(`已清理 ${deleted} 条提前开启记录`)
      setPage((previous) => ({ ...previous, current: 1 }))
      await client.invalidateQueries({ queryKey: ['trafficAdvance'] })
    },
  })
  const search = (value: string) => {
    const next = value.trim()
    if (next === email && page.current === 1) void query.refetch()
    else {
      setEmail(next)
      setPage((previous) => ({ ...previous, current: 1 }))
    }
  }
  const clear = () => {
    if (clearBusy.current) return
    clearBusy.current = true
    setConfirming(true)
    const filter = email
    modal.confirm({
      title: '清理提前开启记录？',
      content: (
        <>
          <p>每次最多清理 1000 条最旧记录，不受当前分页影响。</p>
          <p>仅删除历史记录，不改变账户流量、到期时间、重置日期。</p>
          <p>{filter ? `仅清理当前筛选邮箱 ${filter} 的记录。` : '当前列表未按邮箱筛选，将清理全部邮箱的记录。'}</p>
        </>
      ),
      okText: '确认清理',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => cleanup.mutateAsync(filter),
      afterClose: () => {
        clearBusy.current = false
        setConfirming(false)
      },
    })
  }

  return (
    <AdminLayout title="提前开启记录">
      <div className="block block-rounded">
        <div className="block-content block-content-full">
          <Space wrap style={{ marginBottom: 16 }}>
            <Input.Search
              aria-label="按完整邮箱搜索"
              placeholder="输入完整邮箱搜索"
              value={draft}
              maxLength={64}
              allowClear
              enterButton="搜索"
              disabled={confirming}
              style={{ width: 280 }}
              onChange={(event) => {
                setDraft(event.target.value)
                if (!event.target.value) search('')
              }}
              onSearch={search}
            />
            <Button
              disabled={confirming || (!draft && !email)}
              onClick={() => {
                setDraft('')
                search('')
              }}
            >
              重置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={query.isFetching}
              disabled={confirming}
              onClick={() => void query.refetch()}
            >
              刷新
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={cleanup.isPending}
              disabled={confirming || query.isPending || query.isError}
              onClick={clear}
            >
              清理记录
            </Button>
          </Space>
          {query.isError ? (
            <Alert
              type="error"
              showIcon
              title="提前开启记录加载失败"
              action={<Button onClick={() => void query.refetch()}>重试</Button>}
            />
          ) : (
            <V2Table<TrafficAdvanceRecord>
              rowKey="id"
              loading={query.isFetching}
              columns={columns}
              dataSource={query.data?.rows ?? []}
              scroll={{ x: 1120 }}
              locale={{ emptyText: '暂无提前开启记录' }}
              pagination={{
                ...paginationProps(ui),
                ...page,
                pageSizeOptions: [10, 20, 50, 100],
                total: query.data?.total ?? 0,
                showTotal: (total) => `共 ${total} 条`,
              }}
              onChange={(next) => {
                const pageSize = next.pageSize ?? page.pageSize
                setPage({ current: pageSize !== page.pageSize ? 1 : (next.current ?? 1), pageSize })
              }}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
