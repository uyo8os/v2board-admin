import { useQuery } from '@tanstack/react-query'
import { Descriptions, Drawer, Tag, Typography } from 'antd'
import { unwrap } from '@/api/request'
import { fetchSubscribeAuditDetail } from '@/api/services/insiderGuard'
import { Loading } from '@/components/Loading'
import { Failed, guardKeys, guardTime, Note } from './shared'
import { SUBSCRIBE_AUDIT_RESULT, SUBSCRIBE_AUDIT_SOURCE } from './subscribeAuditFilters'

export function SubscribeAuditDetail({ id, onClose }: { id?: number; onClose: () => void }) {
  const query = useQuery({
    queryKey: [...guardKeys.subscribeAuditDetail, id],
    queryFn: () => unwrap(fetchSubscribeAuditDetail(id!)),
    enabled: id !== undefined,
  })
  const record = query.data?.id === id ? query.data : undefined
  const http = record?.request_details
  return (
    <Drawer title="订阅审计详情" size="min(760px, 100vw)" open={id !== undefined} onClose={onClose} destroyOnHidden>
      <Loading loading={query.isLoading}>
        {query.isError && !record && <Failed>详情暂时无法加载，记录可能已按保留规则清理。请关闭后重试。</Failed>}
        {record && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="用户">{record.email || `#${record.user_id}`}</Descriptions.Item>
              <Descriptions.Item label="拉取时间">{guardTime(record.requested_at)}</Descriptions.Item>
              <Descriptions.Item label="来源">{SUBSCRIBE_AUDIT_SOURCE[record.source]}</Descriptions.Item>
              <Descriptions.Item label="客户端 IP">{record.ip_address || '未知'}</Descriptions.Item>
              <Descriptions.Item label="客户端 UA">
                <span style={{ overflowWrap: 'anywhere' }}>{record.ua || '未提供'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="订阅格式">{record.format || '-'}</Descriptions.Item>
              <Descriptions.Item label="处理结果">
                <Tag color={SUBSCRIBE_AUDIT_RESULT[record.result].color}>
                  {SUBSCRIBE_AUDIT_RESULT[record.result].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="HTTP 状态">{record.status}</Descriptions.Item>
              <Descriptions.Item label="处理耗时">{record.duration_ms} ms</Descriptions.Item>
              <Descriptions.Item label="用户当前订阅链接">
                {record.current_subscribe_url ? (
                  <Typography.Text copyable style={{ overflowWrap: 'anywhere' }}>
                    {record.current_subscribe_url}
                  </Typography.Text>
                ) : (
                  '用户已删除或当前链接不可用'
                )}
              </Descriptions.Item>
            </Descriptions>
            <Note style={{ margin: '10px 0 18px' }}>
              复制的是按当前站点设置生成的订阅链接，可能使用临时令牌，不是这次历史请求的地址。
            </Note>
            {http ? (
              <Descriptions title="安全请求信息" bordered size="small" column={1}>
                <Descriptions.Item label="请求方法">{http.method}</Descriptions.Item>
                <Descriptions.Item label="请求路径">
                  <span style={{ overflowWrap: 'anywhere' }}>{http.path}</span>
                </Descriptions.Item>
                {(['flag', 'version'] as const).map(
                  (key) =>
                    http.query?.[key] !== undefined && (
                      <Descriptions.Item key={key} label={key}>
                        {http.query?.[key]}
                      </Descriptions.Item>
                    ),
                )}
                {http.decoy !== undefined && (
                  <Descriptions.Item label="假入口配置">{http.decoy ? '是' : '否'}</Descriptions.Item>
                )}
              </Descriptions>
            ) : (
              <Note>此记录没有安全请求详情，历史数据不会补录。</Note>
            )}
            <Note style={{ marginTop: 12 }}>逐次审计不保存订阅 token、原始完整 URL 或请求头。</Note>
          </>
        )}
      </Loading>
    </Drawer>
  )
}
