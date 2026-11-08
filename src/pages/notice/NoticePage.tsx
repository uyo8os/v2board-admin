import { PlusOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Divider, Input, InputNumber, Modal, Select, Switch, type TableColumnsType } from 'antd'
import { useState } from 'react'
import { unwrap } from '@/api/request'
import { dropNotice, fetchNotices, saveNotice, toggleNoticeShow } from '@/api/services/notice'
import type { Notice } from '@/api/types'
import { confirmDelete } from '@/components/confirmDelete'
import { FormGroup } from '@/components/FormGroup'
import { JsLink } from '@/components/JsLink'
import { TableBlock } from '@/components/TableBlock'
import { V2Table } from '@/components/table/V2Table'
import { AdminLayout } from '@/layouts/AdminLayout'
import { formatTime } from '@/utils/format'

// 公告管理（原版模块 JZE9 + model lETv）
export default function NoticePage() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const { data: notices = [], isFetching } = useQuery({
    queryKey: ['notice', 'list'],
    queryFn: () => unwrap(fetchNotices()),
  })
  const [visible, setVisible] = useState(false)
  const [submit, setSubmit] = useState<Partial<Notice>>({ auto_popup: false, popup_interval: 24 })

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['notice', 'list'] })

  const toggleModal = () => {
    const next = !visible
    setVisible(next)
    if (!next) setSubmit({ auto_popup: false, popup_interval: 24 })
  }

  const save = async () => {
    const interval = submit.popup_interval
    if ((submit.auto_popup && interval == null) || (interval != null && (!Number.isInteger(interval) || interval < 1 || interval > 8760))) {
      void message.error('弹出间隔必须是 1 至 8760 之间的整数小时')
      return
    }
    const res = await saveNotice({ ...submit, popup_interval: interval ?? 24 })
    if (res.code !== 200) return
    void refetch()
    toggleModal()
  }

  const drop = async (record: Notice) => {
    const res = await dropNotice(record.id)
    if (res.code === 200) void refetch()
  }

  const columns: TableColumnsType<Notice> = [
    { title: '#', dataIndex: 'id', key: 'id' },
    {
      title: '显示',
      dataIndex: 'show',
      key: 'show',
      render: (show: number, record) => (
        <Switch
          size="small"
          checked={Boolean(show)}
          onChange={async () => {
            const res = await toggleNoticeShow(record.id)
            if (res.code === 200) void refetch()
          }}
        />
      ),
    },
    { title: '标题', dataIndex: 'title', key: 'title' },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'right',
      render: (value: number) => formatTime(value),
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      align: 'right',
      fixed: 'right',
      render: (_: unknown, record) => (
        <div>
          <JsLink
            onClick={() => {
              setSubmit({ ...record, auto_popup: Boolean(record.auto_popup), popup_interval: record.popup_interval ?? 24 })
              setVisible(true)
            }}
          >
            编辑
          </JsLink>
          <Divider orientation="vertical" />
          {/* 有意修正：原版公告删除没有确认，这里与优惠券、知识库等页面统一 */}
          <JsLink onClick={() => confirmDelete(() => drop(record))}>删除</JsLink>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout title="公告管理">
      <TableBlock
        loading={isFetching}
        toolbar={
          <Button icon={<PlusOutlined />} onClick={toggleModal}>
            添加公告
          </Button>
        }
      >
        <V2Table<Notice> dataSource={notices} pagination={false} columns={columns} scroll={{ x: 950 }} />
      </TableBlock>
      <Modal
        title={submit.id ? '编辑公告' : '新建公告'}
        open={visible}
        onCancel={toggleModal}
        onOk={() => void save()}
        okText="提交"
        cancelText="取消"
      >
        <div>
          <FormGroup label="标题">
            <Input
              placeholder="请输入公告标题"
              value={submit.title}
              onChange={(e) => setSubmit({ ...submit, title: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="公告内容">
            <Input.TextArea
              rows={12}
              value={submit.content}
              placeholder="请输入公告内容"
              onChange={(e) => setSubmit({ ...submit, content: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="公告标签">
            <Select
              mode="tags"
              suffixIcon={null}
              value={submit.tags || []}
              style={{ width: '100%' }}
              placeholder="输入后回车添加标签"
              onChange={(tags: string[]) => setSubmit({ ...submit, tags: tags.length > 0 ? tags : null })}
            />
          </FormGroup>
          <FormGroup label="图片URL">
            <Input
              placeholder="请输入图片URL"
              value={submit.img_url ?? undefined}
              onChange={(e) => setSubmit({ ...submit, img_url: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="自动弹出">
            <div>
              <Switch
                checked={Boolean(submit.auto_popup)}
                onChange={(auto_popup) => setSubmit({ ...submit, auto_popup })}
              />
            </div>
            <small className="text-muted">从最新 5 条已显示的公告中，自动弹出第一条开启此设置的公告。间隔按用户、公告及其更新时间分别计算。</small>
          </FormGroup>
          <FormGroup label="弹出间隔（小时）">
            <InputNumber
              min={1}
              max={8760}
              precision={0}
              addonAfter="小时"
              style={{ width: '100%' }}
              value={submit.popup_interval}
              onChange={(popup_interval) => setSubmit({ ...submit, popup_interval })}
            />
          </FormGroup>
        </div>
      </Modal>
    </AdminLayout>
  )
}
