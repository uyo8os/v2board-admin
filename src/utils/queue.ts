const QUEUE_NAMES: Record<string, string> = {
  insider_guard_audit: '订阅审计队列',
  order_handle: '订单队列',
  send_email: '邮件队列',
  send_email_mass: '邮件群发队列',
  send_telegram: 'Telegram消息队列',
  stat: '统计队列',
  traffic_fetch: '流量消费队列',
  speed_limit: '动态限速队列',
}

export const queueName = (name: string) => QUEUE_NAMES[name] ?? name
