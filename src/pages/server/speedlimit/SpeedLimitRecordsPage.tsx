import { ArrowLeftOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Input, Modal, Pagination, Skeleton, Table, Tabs, Tag, type TableColumnsType } from 'antd'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ApiError, unwrap } from '@/api/request'
import { clearSpeedLimitHistory, fetchSpeedLimitRecords, releaseSpeedLimit } from '@/api/services/speedLimit'
import type { SpeedLimitNodeTraffic, SpeedLimitRecord } from '@/api/types'
import { message, modal } from '@/app/staticApi'
import { AdminLayout } from '@/layouts/AdminLayout'
import { formatTime } from '@/utils/format'
import { RECORDS_KEY, traffic } from './utils'
import './speedlimit.scss'

const time = (value: number | null) => (value ? formatTime(value) : '—')

export default function SpeedLimitRecordsPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  // 切换规则或页签时重新初始化搜索、分页和明细状态。
  return <Records key={`${location.pathname}?${params}`} />
}

function Records() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const ruleId = Number(params.get('rule_id'))
  const validRule = Number.isInteger(ruleId) && ruleId > 0
  const name = params.get('name') || `规则 #${ruleId}`
  const history = location.pathname.endsWith('/history')
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [email, setEmail] = useState('')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<SpeedLimitRecord>()
  const query = useQuery({
    queryKey: [...RECORDS_KEY, ruleId, history, current, pageSize, search],
    enabled: validRule,
    queryFn: async () => {
      const res = await fetchSpeedLimitRecords(history, {
        rule_id: ruleId,
        current,
        page_size: pageSize,
        ...(search && { email: search }),
      })
      if (res.code !== 200) throw new ApiError(res.code, res.msg)
      return { records: res.data ?? [], total: res.total ?? 0 }
    },
  })
  const refresh = () => client.invalidateQueries({ queryKey: [...RECORDS_KEY, ruleId] })
  const release = (record: SpeedLimitRecord) =>
    modal.confirm({
      title: '解除该用户的限速？',
      content: `${record.email} 将恢复此规则以外的原有限速设置。`,
      okText: '解除限速',
      cancelText: '取消',
      onOk: async () => {
        await unwrap(releaseSpeedLimit(record.id))
        void message.success('限速已解除')
        if (query.data?.records.length === 1 && current > 1) setCurrent(current - 1)
        void refresh()
      },
    })
  const clear = () =>
    modal.confirm({
      title: '清空该规则的历史记录？',
      content: '将删除此规则全部已解除的记录，包括未显示在当前搜索结果中的记录。',
      okText: '清空历史记录',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await unwrap(clearSpeedLimitHistory(ruleId))
        void message.success('历史记录已清空')
        setCurrent(1)
        void refresh()
      },
    })
  const outcome = (record: SpeedLimitRecord) =>
    history ? (
      <Tag color={record.release_type === 'manual' ? 'orange' : 'default'}>
        {record.release_type === 'manual' ? '手动解除' : '到期解除'}
      </Tag>
    ) : (
      <Button onClick={() => release(record)}>解除限速</Button>
    )
  const columns: TableColumnsType<SpeedLimitRecord> = [
    { title: '用户邮箱', dataIndex: 'email', ellipsis: true },
    { title: '触发时间', dataIndex: 'triggered_at', render: time, width: 155 },
    {
      title: history ? '实际解除' : '预计解除',
      dataIndex: history ? 'released_at' : 'release_at',
      render: time,
      width: 155,
    },
    {
      title: '触发流量',
      dataIndex: 'total',
      width: 125,
      render: (value: number, record) => (
        <Button type="link" className="sl-traffic-link" onClick={() => setDetail(record)}>
          {traffic(value)}
        </Button>
      ),
    },
    { title: history ? '解除方式' : '操作', key: 'action', width: 125, render: (_, record) => outcome(record) },
  ]
  const trafficColumns: TableColumnsType<SpeedLimitNodeTraffic> = [
    { title: '节点', key: 'node', render: (_, node) => node.name || `${node.type.toUpperCase()} #${node.id}` },
    { title: '上传', dataIndex: 'u', render: traffic },
    { title: '下载', dataIndex: 'd', render: traffic },
    { title: '倍率', key: 'rate', render: (_, node) => `${node.rate ?? 1}×` },
    {
      title: '计费合计',
      key: 'total',
      render: (_, node) => traffic(node.total ?? Math.round((node.u + node.d) * (node.rate ?? 1))),
    },
  ]

  return (
    <AdminLayout title="动态限速">
      <div className="sl-page">
        <Button
          type="text"
          className="sl-back"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/server/speedlimit')}
        >
          返回规则列表
        </Button>
        <header className="sl-page-heading">
          <div>
            <div className="sl-eyebrow">规则 / #{validRule ? ruleId : '—'}</div>
            <h1>{name}</h1>
            <p>
              {history
                ? '查看已解除的限速及触发流量明细，历史记录保留 7 天。'
                : '查看正在限速的用户，按需手动解除并追踪触发流量。'}
            </p>
          </div>
        </header>
        {!validRule ? (
          <Alert type="error" title="缺少有效的规则编号，请返回规则列表重新选择。" />
        ) : (
          <section className="sl-record-panel">
            <Tabs
              activeKey={history ? 'history' : 'manage'}
              onChange={(key) => navigate(`/server/speedlimit/${key}?${params}`)}
              items={[
                { key: 'manage', label: '当前限速' },
                { key: 'history', label: '历史记录' },
              ]}
            />
            <div className="sl-toolbar sl-record-toolbar">
              <Input.Search
                aria-label="按邮箱搜索"
                placeholder="搜索用户邮箱"
                allowClear
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (!event.target.value) {
                    setSearch('')
                    setCurrent(1)
                  }
                }}
                onSearch={(value) => {
                  setSearch(value.trim())
                  setCurrent(1)
                }}
                enterButton="搜索"
              />
              <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
                刷新
              </Button>
              {history && (
                <Button danger icon={<DeleteOutlined />} onClick={clear} disabled={query.isPending || query.isError}>
                  清空历史
                </Button>
              )}
            </div>
            {query.isError ? (
              <Alert
                type="error"
                title="记录加载失败"
                action={<Button onClick={() => void query.refetch()}>重试</Button>}
              />
            ) : query.isPending ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <>
                {!query.data.records.length ? (
                  <Empty
                    className="sl-record-empty"
                    description={search ? '没有找到匹配的用户' : history ? '暂无历史记录' : '当前没有正在限速的用户'}
                  />
                ) : (
                  <>
                    <div className="sl-record-desktop">
                      <Table rowKey="id" columns={columns} dataSource={query.data.records} pagination={false} />
                    </div>
                    <div className="sl-record-mobile">
                      {query.data.records.map((record) => (
                        <article className="sl-record-card" key={record.id}>
                          <div className="sl-record-heading">
                            <strong>{record.email}</strong>
                            {history && outcome(record)}
                          </div>
                          <dl>
                            <div>
                              <dt>触发时间</dt>
                              <dd>{time(record.triggered_at)}</dd>
                            </div>
                            <div>
                              <dt>{history ? '实际解除' : '预计解除'}</dt>
                              <dd>{time(history ? record.released_at : record.release_at)}</dd>
                            </div>
                          </dl>
                          <footer>
                            <Button type="link" className="sl-traffic-link" onClick={() => setDetail(record)}>
                              {traffic(record.total)} · 流量明细
                            </Button>
                            {!history && outcome(record)}
                          </footer>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                <div className="sl-pagination">
                  <span>
                    共 {query.data.total} 条{search ? '匹配记录' : '记录'}
                  </span>
                  <Pagination
                    current={current}
                    pageSize={pageSize}
                    total={query.data.total}
                    showSizeChanger
                    pageSizeOptions={[10, 20, 50]}
                    showLessItems
                    onChange={(page, size) => {
                      setPageSize(size)
                      setCurrent(size !== pageSize ? 1 : page)
                    }}
                  />
                </div>
              </>
            )}
          </section>
        )}
        <Modal
          open={Boolean(detail)}
          onCancel={() => setDetail(undefined)}
          footer={<Button onClick={() => setDetail(undefined)}>关闭</Button>}
          title="节点流量明细"
          width={720}
          className="sl-traffic-modal"
        >
          {detail && (
            <>
              <div className="sl-detail-heading">
                <strong>{detail.email}</strong>
                <span>
                  触发流量 <b>{traffic(detail.total)}</b>
                </span>
              </div>
              <p className="sl-hint">计费合计 =（上传 + 下载）× 节点倍率</p>
              <Table<SpeedLimitNodeTraffic>
                rowKey={(node) => `${node.type}:${node.id}`}
                columns={trafficColumns}
                dataSource={detail.node_traffic ?? []}
                pagination={false}
                scroll={{ x: 540 }}
              />
            </>
          )}
        </Modal>
      </div>
    </AdminLayout>
  )
}
