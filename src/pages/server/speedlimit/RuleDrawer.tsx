import { ArrowRightOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Drawer, Form, Input, InputNumber, Radio, Select, Switch } from 'antd'
import { useState } from 'react'
import { usePlans } from '@/api/queries'
import { unwrap } from '@/api/request'
import { fetchNodes } from '@/api/services/serverManage'
import { saveSpeedLimitRule } from '@/api/services/speedLimit'
import type { SpeedLimitRule } from '@/api/types'
import { message } from '@/app/staticApi'
import { duration, nodeKey, RECORDS_KEY, RULES_KEY, toRuleForm, toRulePayload, type RuleForm } from './utils'

interface Props {
  rule?: SpeedLimitRule
  onClose: () => void
}

export function RuleDrawer({ rule, onClose }: Props) {
  const [form] = Form.useForm<RuleForm>()
  const [saving, setSaving] = useState(false)
  const client = useQueryClient()
  const nodes = useQuery({ queryKey: ['server', 'speedlimit', 'nodes'], queryFn: () => unwrap(fetchNodes()) })
  const plans = usePlans()
  const values = Form.useWatch([], form) as RuleForm | undefined
  const current = values ?? toRuleForm(rule)
  const daily = current.daily_enabled
  const nodeOptions = (nodes.data ?? []).map((node) => ({
    value: nodeKey(node),
    label: `${node.name} · ${node.type.toUpperCase()}`,
  }))
  // 已删除的节点 / 订阅保留在选择器里，避免编辑其他参数时悄悄改变规则范围。
  for (const node of rule?.node_ids ?? []) {
    if (!nodeOptions.some((option) => option.value === nodeKey(node))) {
      nodeOptions.push({ value: nodeKey(node), label: `已移除节点 · ${node.type.toUpperCase()} #${node.id}` })
    }
  }
  const planOptions = (plans.data ?? []).map((plan) => ({ value: plan.id, label: plan.name }))
  for (const id of rule?.plan_ids ?? []) {
    if (!planOptions.some((option) => option.value === Number(id)))
      planOptions.push({ value: Number(id), label: `已移除订阅 #${id}` })
  }

  const save = async (data: RuleForm) => {
    setSaving(true)
    try {
      const res = await saveSpeedLimitRule(toRulePayload(data, rule?.id))
      if (res.code !== 200) return
      void message.success(rule ? '规则已保存' : '规则已创建并启用')
      void client.invalidateQueries({ queryKey: RULES_KEY })
      void client.invalidateQueries({ queryKey: RECORDS_KEY })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      title={rule ? '编辑限速规则' : '创建限速规则'}
      size="min(720px, 100vw)"
      rootClassName="sl-drawer"
      onClose={() => {
        if (!saving) onClose()
      }}
      maskClosable={!saving}
      footer={
        <div className="sl-drawer-footer">
          <Button onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {rule ? '保存修改' : '创建并启用'}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={toRuleForm(rule)}
        onFinish={(data) => void save(data)}
        requiredMark={false}
        scrollToFirstError
      >
        <section className="sl-form-section">
          <div className="sl-section-heading">
            <span>01</span>
            <div>
              <h3>规则与适用范围</h3>
              <p>指定需要统计流量的节点与用户。</p>
            </div>
          </div>
          <Form.Item
            name="name"
            label="规则名称"
            rules={[{ required: true, whitespace: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="例如：高峰时段公平使用" maxLength={100} />
          </Form.Item>
          {nodes.isError && (
            <Alert
              type="error"
              title="节点加载失败"
              action={
                <Button size="small" onClick={() => void nodes.refetch()}>
                  重试
                </Button>
              }
            />
          )}
          <Form.Item
            name="node_keys"
            label="适用节点"
            rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个节点' }]}
            extra="汇总所选节点的计费流量，流量倍率与系统扣费口径一致。"
          >
            <Select
              mode="multiple"
              showSearch={{ optionFilterProp: 'label' }}
              loading={nodes.isFetching}
              options={nodeOptions}
              placeholder="搜索并选择节点"
              maxTagCount="responsive"
            />
          </Form.Item>
          <div className="sl-option-row">
            <div>
              <strong>仅对指定订阅生效</strong>
              <p>关闭时，对所选节点上的全部用户生效。</p>
            </div>
            <Form.Item name="plan_limit_enabled" valuePropName="checked" noStyle>
              <Switch aria-label="仅对指定订阅生效" />
            </Form.Item>
          </div>
          {current.plan_limit_enabled && (
            <>
              {plans.isError && (
                <Alert
                  type="error"
                  title="订阅加载失败"
                  action={
                    <Button size="small" onClick={() => void plans.refetch()}>
                      重试
                    </Button>
                  }
                />
              )}
              <Form.Item
                name="plan_ids"
                label="适用订阅"
                rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个订阅' }]}
              >
                <Select
                  mode="multiple"
                  showSearch={{ optionFilterProp: 'label' }}
                  loading={plans.isFetching}
                  options={planOptions}
                  placeholder="搜索并选择订阅"
                  maxTagCount="responsive"
                />
              </Form.Item>
            </>
          )}
        </section>
        <section className="sl-form-section">
          <div className="sl-section-heading">
            <span>02</span>
            <div>
              <h3>触发与恢复</h3>
              <p>设置流量阈值、限速值和恢复时间。</p>
            </div>
          </div>
          <Form.Item name="daily_enabled" label="统计方式">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: '计时窗口', value: false },
                { label: '按每日统计', value: true },
              ]}
            />
          </Form.Item>
          <p className="sl-hint">
            {daily
              ? '每天 0 点开始统计，触发后限速至次日 0 点，时间以服务器时区为准。'
              : '从用户首次上报流量开始计时，窗口内达到阈值后触发限速。'}
          </p>
          <div className="sl-form-grid">
            {!daily && (
              <Form.Item
                name="trigger_period"
                label="统计窗口（分钟）"
                rules={[
                  { required: true, message: '请输入统计窗口' },
                  { type: 'number', min: 1, message: '统计窗口至少 1 分钟' },
                ]}
              >
                <InputNumber min={1} step={1} placeholder="120" />
              </Form.Item>
            )}
            <Form.Item
              name="threshold"
              label="流量阈值（GB）"
              rules={[
                { required: true, message: '请输入流量阈值' },
                { type: 'number', min: 1 / 1024 ** 3, message: '流量阈值必须大于 0' },
              ]}
            >
              <InputNumber min={1 / 1024 ** 3} step={1} placeholder="例如 10" />
            </Form.Item>
            <Form.Item
              name="speed_limit"
              label="触发后限速（Mbps）"
              rules={[
                { required: true, message: '请输入限速值' },
                { type: 'integer', min: 1, message: '限速值必须为正整数' },
              ]}
            >
              <InputNumber min={1} precision={0} placeholder="例如 5" />
            </Form.Item>
            {!daily && (
              <Form.Item
                name="limit_duration"
                label="限速时长（分钟）"
                rules={[
                  { required: true, message: '请输入限速时长' },
                  { type: 'number', min: 1, message: '限速时长至少 1 分钟' },
                ]}
              >
                <InputNumber min={1} step={1} placeholder="60" />
              </Form.Item>
            )}
          </div>
          <div className="sl-rule-preview">
            <ThunderboltOutlined />
            <div>
              <strong>规则预览</strong>
              <p>
                {daily ? '每日累计' : `${duration(Math.round((current.trigger_period || 0) * 60))}内累计`}{' '}
                {current.threshold ?? '—'} GB <ArrowRightOutlined /> 限速 {current.speed_limit ?? '—'} Mbps，
                {daily ? '次日 0 点解除' : `${duration(Math.round((current.limit_duration || 0) * 60))}后解除`}。
              </p>
            </div>
          </div>
          {rule && daily !== toRuleForm(rule).daily_enabled && (
            <Alert type="warning" showIcon title="切换统计方式后将重新计数，并解除旧模式下正在生效的限速。" />
          )}
        </section>
        <section className="sl-form-section">
          <div className="sl-section-heading">
            <span>03</span>
            <div>
              <h3>连接处理</h3>
              <p>选择触发限速时如何处理已有连接。</p>
            </div>
          </div>
          <div className="sl-option-row">
            <div>
              <strong>触发后断开已有连接</strong>
              <p>仅影响所选节点，用户重连后应用新的限速值。</p>
            </div>
            <Form.Item name="disconnect_existing_connections" valuePropName="checked" noStyle>
              <Switch aria-label="触发后断开已有连接" />
            </Form.Item>
          </div>
        </section>
      </Form>
    </Drawer>
  )
}
