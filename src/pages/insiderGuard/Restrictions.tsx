// 当前受限账号直接来自限制表，不受风险用户统计时段影响。
import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Popover, Tooltip, type TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'
import { ApiError } from '@/api/request'
import { fetchGuardRestrictions } from '@/api/services/insiderGuard'
import type { GuardRestriction } from '@/api/types'
import { paginationProps } from '@/hooks/usePagedList'
import { useUi } from '@/stores/appearance'
import { ReviewModal } from './ReviewModal'
import { Ellipsis, Failed, guardKeys, guardTime, NodeLabel, Note, Section, SubTable } from './shared'

interface RestrictionsProps {
  onDetail: (userId: number) => void
  onReviewed: () => void
}

export function Restrictions({ onDetail, onReviewed }: RestrictionsProps) {
  const ui = useUi()
  const [page, setPage] = useState({ current: 1, pageSize: 20 })
  const query = useQuery({
    queryKey: [...guardKeys.restrictions, page],
    queryFn: async () => {
      const res = await fetchGuardRestrictions(page)
      if (res.code !== 200) throw new ApiError(res.code, res.msg)
      return { rows: res.data ?? [], total: res.total ?? 0 }
    },
  })

  // 解除当前页最后一个账号后，回到仍有数据的最后一页。
  useEffect(() => {
    if (!query.data) return
    const lastPage = Math.max(1, Math.ceil(query.data.total / page.pageSize))
    // 服务端总数变化后修正越界页码，触发该页的重新请求。
    // oxlint-disable-next-line react/set-state-in-effect
    if (page.current > lastPage) setPage((p) => ({ ...p, current: lastPage }))
  }, [query.data, page])

  const columns: TableColumnsType<GuardRestriction> = [
    { title: '用户 ID', dataIndex: 'user_id', key: 'user_id', width: 90 },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (email: string | null) => email || '已删除' },
    {
      title: '限制类型',
      key: 'mode',
      render: (_: unknown, row) =>
        row.mode === 'exclude'
          ? '节点排除'
          : row.mode === 'decoy'
            ? '假入口限制'
            : row.mode === 'consumption'
              ? '消费限制'
              : '类型未获取',
    },
    {
      title: '排除节点',
      key: 'excluded_nodes',
      width: 260,
      render: (_: unknown, row) =>
        row.mode === 'exclude' && row.excluded_nodes.length > 0 ? (
          <Popover
            title={`排除节点（${row.excluded_nodes.length}）`}
            trigger={['hover', 'focus', 'click']}
            placement="topLeft"
            content={
              <div style={{ maxHeight: 240, maxWidth: 'min(380px, calc(100vw - 48px))', overflowY: 'auto' }}>
                {row.excluded_nodes.map((node) => (
                  <div key={`${node.node_type}:${node.node_id}`} style={{ padding: '2px 0', overflowWrap: 'anywhere' }}>
                    <NodeLabel type={node.node_type} id={node.node_id} name={node.node_name} />
                  </div>
                ))}
              </div>
            }
          >
            <span
              role="button"
              tabIndex={0}
              aria-label={`查看全部 ${row.excluded_nodes.length} 个排除节点`}
              style={{
                display: 'block',
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {row.excluded_nodes.map((node) => (
                <span key={`${node.node_type}:${node.node_id}`} style={{ marginRight: 8 }}>
                  <NodeLabel type={node.node_type} id={node.node_id} name={node.node_name} />
                </span>
              ))}
            </span>
          </Popover>
        ) : (
          '-'
        ),
    },
    { title: '限制时间', dataIndex: 'created_at', key: 'created_at', width: 170, render: guardTime },
    {
      title: '管理员 ID',
      dataIndex: 'admin_id',
      key: 'admin_id',
      width: 110,
      render: (id: number | null) => id ?? '-',
    },
    { title: '限制原因', dataIndex: 'reason', key: 'reason', render: (reason: string) => <Ellipsis text={reason} /> },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, row) =>
        row.email === null ? (
          <Tooltip title="用户已删除，无法查看或审核">
            <span className="d-flex" style={{ gap: 8 }}>
              <Button size="small" disabled>
                详情
              </Button>
              <Button size="small" disabled>
                审核
              </Button>
            </span>
          </Tooltip>
        ) : (
          <div className="d-flex" style={{ gap: 8 }}>
            <Button size="small" onClick={() => onDetail(row.user_id)}>
              详情
            </Button>
            <ReviewModal user={{ id: row.user_id, email: row.email, restricted: true }} onSaved={onReviewed}>
              <Button size="small">审核</Button>
            </ReviewModal>
          </div>
        ),
    },
  ]

  return (
    <Section
      extra={
        <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
          刷新
        </Button>
      }
    >
      <Note style={{ marginBottom: 12 }}>
        显示当前所有限制，同一账号的节点限制和消费限制分别列出，可通过审核分别解除。
      </Note>
      {query.isError && <Failed>读取失败：限制列表暂时无法加载，请点「刷新」重试</Failed>}
      <SubTable<GuardRestriction>
        rowKey={(row) => `${row.user_id}:${row.mode}`}
        loading={query.isFetching}
        dataSource={query.data?.rows ?? []}
        columns={columns}
        scroll={{ x: 850 }}
        pagination={{
          ...paginationProps(ui),
          pageSizeOptions: [10, 20, 50, 100],
          ...page,
          total: query.data?.total ?? 0,
        }}
        onChange={(next) => setPage({ current: next.current ?? 1, pageSize: next.pageSize ?? page.pageSize })}
      />
    </Section>
  )
}
