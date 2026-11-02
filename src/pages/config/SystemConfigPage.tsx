import { Button, Input, InputNumber, Switch } from 'antd'
import { useEffect, type InputHTMLAttributes, type ReactNode } from 'react'
import { usePlans } from '@/api/queries'
import { V2Tabs } from '@/components/V2Tabs'
import { AdminLayout } from '@/layouts/AdminLayout'
import { useConfigManageStore, type ConfigGroup } from '@/stores/configManage'

interface ConfigItemProps {
  title: ReactNode
  description?: ReactNode
  /** 子项（上一项开启后才显示的设置），左侧带灰色竖条 */
  isChildren?: boolean
  children?: ReactNode
}

// 一行设置：左边标题和说明，右边控件（原版 1dM+ 里的组件 m）。
// 分隔线与说明文字的颜色：皮肤里取 --v2b-* 变量（见 styles/skins/_shell.scss），legacy 下没有定义，取原值
function ConfigItem({ title, description, isChildren, children }: ConfigItemProps) {
  return (
    <div
      className={`row ${isChildren ? 'v2board-config-children' : ''}`}
      style={{ padding: '20px', borderBottom: '1px solid var(--v2b-line-soft, #eee)' }}
    >
      <div className="col-lg-6">
        <div style={{ fontWeight: 'bold', marginBottom: 5 }}>{title}</div>
        <div style={{ fontSize: 12, marginBottom: 5, color: 'var(--v2b-text-muted, #666)' }}>{description}</div>
      </div>
      <div className="col-lg-6 text-right">{children}</div>
    </div>
  )
}

/** 分组里的值原样交给输入框（数字、逗号拼接的数组都由 React 转成文本） */
const text = (value: unknown) => value as InputHTMLAttributes<HTMLInputElement>['defaultValue']
const inputValue = (value: unknown) => (Array.isArray(value) ? value.join(',') : String(value ?? ''))
/** 与原版 parseInt(x) 的真假一致：1 / '1' 为开，0、空值为关 */
const on = (value: unknown) => Boolean(Number.parseInt(String(value), 10))
/** 下拉框的值（还没读取到时为空，显示第一个选项） */
const selected = (value: unknown) => (value ?? '') as string | number
/** 整数字段：不是数字（例如清空）时返回 undefined，不修改也不保存 */
const integer = (input: string) => {
  const value = Number.parseInt(input, 10)
  return Number.isNaN(value) ? undefined : value
}

const EVENTS: Array<[number, string]> = [
  [0, '不执行任何动作'],
  [1, '重置用户流量'],
]

// 前后分离、邮件、APP 标签页顶部的提示
function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="block-content">
      <div className="row">
        <div className="col-lg-12">
          <div className="alert alert-warning" role="alert">
            <p className="mb-0">{children}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 系统配置（原版模块 1dM+ + model config）。
// 与原版一致：文本框只用初始值（修改后不受重新读取影响），开关和下拉框跟随读取到的配置；
// 每次修改都在 1.5 秒后自动保存所在分组（按分组各自计时，见 stores/configManage）。
// 有意修正（与原版行为不同）：
//   - 「边栏风格 / 头部风格」写入 frontend 分组、「订阅链接有效时间」写入 subscribe 分组（原版写进 site / safe 分组，
//     边栏 / 头部开关要等保存并重新读取后才切换）
//   - 「注册试用」选「关闭」后立即隐藏「试用时间」（原版按 0 === 判断，选中的值是字符串 '0'）
//   - 「邀请佣金百分比」「用户可创建邀请码上限」不是数字（例如清空）时不修改、不保存（原版提交 NaN，后端提示格式错误）
//   - 「个性化」顶部的提示按新版的实际行为说明（原版写着前后分离部署时本页配置不生效）
export default function SystemConfigPage() {
  const config = useConfigManageStore()
  const { site, safe, subscribe, ticket, invite, frontend, server, email, telegram } = config
  const { data: plans = [] } = usePlans()

  useEffect(() => {
    const store = useConfigManageStore.getState()
    void store.fetch()
    void store.getEmailTemplate()
    void store.getThemeTemplate()
  }, [])

  const set = (group: ConfigGroup, key: string) => (value: unknown) => config.setValue(group, key, value)
  const input = (group: ConfigGroup, key: string, placeholder: string, className = 'form-control') => (
    <input
      type="text"
      className={className}
      placeholder={placeholder}
      defaultValue={text(config[group][key])}
      onChange={(e) => set(group, key)(e.target.value)}
    />
  )
  // 新增设置用受控输入，异步读取和切换标签后保持同步；节点通信地址在两个标签里共用同一字段。
  const configInput = (group: ConfigGroup, key: string, placeholder: string, type = 'text') => (
    <input
      name={key}
      type={type}
      className="form-control"
      placeholder={placeholder}
      value={inputValue(config[group][key])}
      onChange={(e) => set(group, key)(e.target.value)}
    />
  )
  const listInput = (group: ConfigGroup, key: string, placeholder: string) => (
    <input
      name={key}
      type="text"
      className="form-control"
      placeholder={placeholder}
      value={inputValue(config[group][key])}
      onChange={(e) => set(group, key)(e.target.value.split(','))}
    />
  )
  const textarea = (group: ConfigGroup, key: string, placeholder: string, rows: string, split = false) => (
    <textarea
      rows={Number(rows)}
      // 原版给 textarea 写了 type="text"（无效属性，保留相同的 DOM）
      {...{ type: 'text' }}
      className="form-control"
      placeholder={placeholder}
      defaultValue={text(config[group][key])}
      onChange={(e) => set(group, key)(split ? e.target.value.split(',') : e.target.value)}
    />
  )
  const toggle = (group: ConfigGroup, key: string, fallback = 0) => (
    <Switch
      id={key}
      checked={on(config[group][key] ?? fallback)}
      onChange={(checked) => set(group, key)(checked ? 1 : 0)}
    />
  )
  const select = (group: ConfigGroup, key: string, options: Array<[number, string]>, placeholder?: string) => (
    <select
      onChange={(e) => set(group, key)(e.target.value)}
      className="form-control"
      value={selected(config[group][key])}
      {...(placeholder !== undefined && { placeholder })}
    >
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
  const numberInput = (key: string, addonAfter: string) => (
    <Input
      addonAfter={addonAfter}
      size="large"
      type="number"
      placeholder="请输入"
      defaultValue={text(server[key])}
      onChange={(e) => set('server', key)(e.target.value)}
    />
  )
  const items = [
    {
      key: 'site',
      label: '站点',
      children: (
        <div className="">
          <ConfigItem title="站点名称" description="用于显示需要站点名称的地方。">
            {input('site', 'app_name', '请输入站点名称')}
          </ConfigItem>
          <ConfigItem title="站点描述" description="用于显示需要站点描述的地方。">
            {input('site', 'app_description', '请输入站点描述')}
          </ConfigItem>
          <ConfigItem title="站点网址" description="当前网站最新网址，将会在邮件等需要用于网址处体现。">
            {input('site', 'app_url', '请输入站点URL，末尾不要/')}
          </ConfigItem>
          <ConfigItem title="强制HTTPS" description="当站点没有使用HTTPS，CDN或反代开启强制HTTPS时需要开启。">
            {toggle('site', 'force_https')}
          </ConfigItem>
          <ConfigItem
            title="节点通信地址"
            description="节点与面板通信使用的地址，留空则使用站点网址。与「节点」标签中的对接 API 地址同步。"
          >
            {configInput('server', 'server_api_url', '请输入节点通信地址')}
          </ConfigItem>
          <ConfigItem title="LOGO" description="用于显示需要LOGO的地方。">
            {input('site', 'logo', '请输入LOGO URL，末尾不要/')}
          </ConfigItem>
          <ConfigItem
            title="订阅URL"
            description="用于订阅所使用，留空则为站点URL。如需多个订阅URL随机获取请使用逗号进行分割。"
          >
            {textarea('site', 'subscribe_url', '请输入订阅URL，末尾不要/。逗号分割支持多域名', '4')}
          </ConfigItem>
          <ConfigItem title="备用订阅URL" description="为用户提供备用订阅地址，留空则不显示。">
            {configInput('site', 'subscribe_url_backup', 'https://backup.example.com', 'url')}
          </ConfigItem>
          <ConfigItem
            title="订阅路径"
            description="用于订阅所使用，留空则为/api/v1/client/subscribe。如需更换不同的订阅路径请设置。"
          >
            {input('site', 'subscribe_path', '/api/v1/client/subscribe')}
          </ConfigItem>
          <ConfigItem title="用户条款(TOS)URL" description="用于跳转到用户条款(TOS)">
            {input('site', 'tos_url', '请输入用户条款URL，末尾不要/')}
          </ConfigItem>
          <ConfigItem title="停止新用户注册" description="开启后任何人都将无法进行注册。">
            {toggle('site', 'stop_register')}
          </ConfigItem>
          <ConfigItem title="注册试用" description="选择需要试用的订阅，如果没有选项请先前往订阅管理添加。">
            {select(
              'site',
              'try_out_plan_id',
              [[0, '关闭'], ...plans.map((plan): [number, string] => [plan.id, plan.name])],
              '请选择试用订阅',
            )}
          </ConfigItem>
          {/* 选「关闭」后值为字符串 '0'，按数字比较（原版按 0 === 判断，要等保存并重新读取后才隐藏） */}
          {Number(site.try_out_plan_id) === 0 || (
            <ConfigItem isChildren title="试用时间(小时)">
              {input('site', 'try_out_hour', '请输入')}
            </ConfigItem>
          )}
          <ConfigItem title="货币单位" description="仅用于展示使用，更改后系统中所有的货币单位都将发生变更。">
            {input('site', 'currency', 'CNY')}
          </ConfigItem>
          <ConfigItem title="货币符号" description="仅用于展示使用，更改后系统中所有的货币单位都将发生变更。">
            {input('site', 'currency_symbol', '¥')}
          </ConfigItem>
        </div>
      ),
    },
    {
      key: 'safe',
      label: '安全',
      children: (
        <div className="">
          <ConfigItem title="邮箱验证" description="开启后将会强制要求用户进行邮箱验证。">
            {toggle('safe', 'email_verify')}
          </ConfigItem>
          <ConfigItem title="禁止使用Gmail多别名" description="开启后Gmail多别名将无法注册。">
            {toggle('safe', 'email_gmail_limit_enable')}
          </ConfigItem>
          <ConfigItem title="qq.com邮箱只允许纯数字" description="开启后，使用 qq.com 注册时邮箱前缀只允许纯数字。">
            {toggle('safe', 'email_qq_numeric_only')}
          </ConfigItem>
          <ConfigItem title="安全模式" description="开启后除了站点URL以外的绑定本站点的域名访问都将会被403。">
            {toggle('safe', 'safe_mode_enable')}
          </ConfigItem>
          <ConfigItem title="后台路径" description="后台管理路径，修改后将会改变原有的admin路径">
            {input('safe', 'secure_path', 'admin')}
          </ConfigItem>
          <ConfigItem title="邮箱后缀白名单" description="开启后在名单中的邮箱后缀才允许进行注册。">
            {toggle('safe', 'email_whitelist_enable')}
          </ConfigItem>
          {safe.email_whitelist_enable ? (
            <ConfigItem isChildren title="白名单后缀" description="请使用逗号进行分割，如：qq.com,gmail.com。">
              {textarea('safe', 'email_whitelist_suffix', '请输入后缀域名，逗号分割 如：qq.com,gmail.com', '4', true)}
            </ConfigItem>
          ) : (
            ''
          )}
          <ConfigItem title="人机验证" description="开启后使用本地图片验证码防止机器人。">
            {toggle('safe', 'recaptcha_enable')}
          </ConfigItem>
          <ConfigItem title="登录人机验证" description="开启后，用户前端登录时需要完成本地图片验证码。">
            {toggle('safe', 'login_captcha_enable')}
          </ConfigItem>
          <ConfigItem
            title="IP注册限制"
            description="开启后如果IP注册账户达到规则要求将会被限制注册，请注意IP判断可能因为CDN或前置代理导致问题。"
          >
            {toggle('safe', 'register_limit_by_ip_enable')}
          </ConfigItem>
          {safe.register_limit_by_ip_enable ? (
            <>
              <ConfigItem isChildren title="次数" description="达到注册次数后开启惩罚。">
                {input('safe', 'register_limit_count', '请输入')}
              </ConfigItem>
              <ConfigItem isChildren title="惩罚时间(分钟)" description="需要等待惩罚时间过后才可以再次注册。">
                {input('safe', 'register_limit_expire', '请输入')}
              </ConfigItem>
            </>
          ) : (
            ''
          )}
          <ConfigItem title="防爆破限制" description="开启后如果该账户尝试登陆失败次数过多将会被限制。">
            {toggle('safe', 'password_limit_enable')}
          </ConfigItem>
          {safe.password_limit_enable ? (
            <>
              <ConfigItem isChildren title="次数" description="达到失败次数后开启惩罚。">
                {input('safe', 'password_limit_count', '请输入')}
              </ConfigItem>
              <ConfigItem isChildren title="惩罚时间(分钟)" description="需要等待惩罚时间过后才可以再次登陆。">
                {input('safe', 'password_limit_expire', '请输入')}
              </ConfigItem>
            </>
          ) : (
            ''
          )}
          <ConfigItem title="前端登录设备显示" description="开启后，将在用户前端显示登录设备记录。">
            {toggle('safe', 'show_active_sessions')}
          </ConfigItem>
        </div>
      ),
    },
    {
      key: 'subscribe',
      label: '订阅',
      children: (
        <div className="">
          <ConfigItem title="允许用户更改订阅" description="开启后用户将会可以对订阅计划进行变更。">
            {toggle('subscribe', 'plan_change_enable')}
          </ConfigItem>
          <ConfigItem
            title="月流量重置方式"
            description="全局流量重置方式，默认每月1号。可以在订阅管理为订阅单独设置。"
          >
            {select(
              'subscribe',
              'reset_traffic_method',
              [
                [0, '每月1号'],
                [1, '按月重置'],
                [2, '不重置'],
                [3, '每年1月1日'],
                [4, '按年重置'],
              ],
              '请选择订阅重置方式',
            )}
          </ConfigItem>
          <ConfigItem title="开启折抵方案" description="开启后用户更换订阅将会由系统对原有订阅进行折抵，方案参考文档。">
            {toggle('subscribe', 'surplus_enable')}
          </ConfigItem>
          <ConfigItem
            title="允许提前开启流量周期"
            description="开启后用户流量用尽时可以选择扣除订阅时长为代价重置流量，按月重置时扣除本周期剩余订阅时长，每月1号重置时扣除整月时间30天。"
          >
            {toggle('subscribe', 'allow_new_period')}
          </ConfigItem>
          <ConfigItem title="当订阅新购时触发事件" description="新购订阅完成时将触发该任务。">
            {select('subscribe', 'new_order_event_id', EVENTS, '请选择事件')}
          </ConfigItem>
          <ConfigItem title="当订阅续费时触发事件" description="续费订阅完成时将触发该任务。">
            {select('subscribe', 'renew_order_event_id', EVENTS, '请选择事件')}
          </ConfigItem>
          <ConfigItem title="当订阅变更时触发事件" description="变更订阅完成时将触发该任务。">
            {select('subscribe', 'change_order_event_id', EVENTS, '请选择事件')}
          </ConfigItem>
          <ConfigItem title="在订阅中展示订阅信息" description="开启后将会在用户订阅节点时输出订阅信息。">
            {toggle('subscribe', 'show_info_to_server_enable')}
          </ConfigItem>
          <ConfigItem title="订阅链接生效模式" description="用户获取订阅链接后的有效期。">
            {select(
              'subscribe',
              'show_subscribe_method',
              [
                [0, '永久有效'],
                [1, '一次性有效'],
                [2, '限时有效'],
              ],
              '请选择',
            )}
          </ConfigItem>
          {/* 原版用 == 2 判断：选择后是字符串 '2'，读取到的是数字 2 */}
          {Number(subscribe.show_subscribe_method) === 2 ? (
            <ConfigItem isChildren title="订阅链接有效时间(分钟)" description="订阅链接获取后经过该时间将失效。">
              <input
                type="text"
                className="form-control"
                placeholder="请输入"
                defaultValue={text(subscribe.show_subscribe_expire)}
                onChange={(e) => set('subscribe', 'show_subscribe_expire')(e.target.value)}
              />
            </ConfigItem>
          ) : (
            ''
          )}
        </div>
      ),
    },
    {
      key: 'deposit',
      label: '充值',
      children: (
        <div className="">
          <ConfigItem title="充值开关" description="关闭后，用户前端将禁用账户充值页面。">
            {toggle('deposit', 'deposit_enable', 1)}
          </ConfigItem>
          <ConfigItem
            isChildren
            title="充值预设金额"
            description="使用逗号分隔，单位为元，最多两位小数；每项须大于等于 1 且小于 99999.99。留空则不显示预设金额。"
          >
            {listInput('deposit', 'deposit_preset_amounts', '例如：10,50,100')}
          </ConfigItem>
          <ConfigItem title="充值奖励" description="充值一定金额可以获得的奖励。">
            {textarea(
              'deposit',
              'deposit_bounus',
              '请输入 充值金额:奖励金额,逗号分割\n如 50:18,100:38, 200:88',
              '2',
              true,
            )}
          </ConfigItem>
        </div>
      ),
    },
    {
      key: 'ticket',
      label: '工单',
      children: (
        <div className="">
          <ConfigItem title="工单设置" description="请选择工单的状态。">
            <select
              onChange={(e) => set('ticket', 'ticket_status')(e.target.value)}
              className="form-control"
              value={selected(ticket.ticket_status || 0)}
            >
              <option value={0}>完全开放工单</option>
              <option value={1}>仅限有付费订单用户</option>
              <option value={2}>完全禁止工单</option>
            </select>
          </ConfigItem>
          <ConfigItem
            title="开启工单图片上传"
            description="开启后，用户可在新建工单时上传图片，由面板转发到配置的图床。"
          >
            {toggle('ticket', 'ticket_image_upload_enable')}
          </ConfigItem>
          {on(ticket.ticket_image_upload_enable) && (
            <>
              <ConfigItem
                isChildren
                title="图床 API URL"
                description="填写支持 EasyImages 2.0 上传格式的 HTTPS 公网地址。"
              >
                {configInput(
                  'ticket',
                  'ticket_image_upload_api_url',
                  'https://images.example.com/api/index.php',
                  'url',
                )}
              </ConfigItem>
              <ConfigItem isChildren title="图床 Token" description="图床提供的上传 Token，可留空。">
                {configInput('ticket', 'ticket_image_upload_token', '请输入图床 Token（可选）', 'password')}
              </ConfigItem>
              <ConfigItem
                isChildren
                title="最大文件大小（字节）"
                description="单张图片的大小上限，默认 5242880 字节（5 MB）。"
              >
                <InputNumber
                  id="ticket_image_upload_max_file_size"
                  defaultValue={Number(ticket.ticket_image_upload_max_file_size ?? 5242880)}
                  min={1}
                  precision={0}
                  style={{ width: '100%' }}
                  onChange={(value) => {
                    if (value !== null && value >= 1) set('ticket', 'ticket_image_upload_max_file_size')(value)
                  }}
                />
              </ConfigItem>
              <ConfigItem
                isChildren
                title="允许的图片类型"
                description="使用逗号分隔 MIME 类型，如 image/jpeg,image/png,image/gif,image/webp；留空恢复默认类型。"
              >
                {listInput('ticket', 'ticket_image_upload_allowed_types', 'image/jpeg,image/png,image/gif,image/webp')}
              </ConfigItem>
              <ConfigItem
                isChildren
                title="图片地址响应字段"
                description="图床返回的图片 URL 字段，支持 data.url 这样的路径，留空使用 url。"
              >
                {configInput('ticket', 'ticket_image_upload_response_field', 'url')}
              </ConfigItem>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'invite',
      label: '邀请&佣金',
      children: (
        <div className="">
          <ConfigItem title="开启强制邀请" description="开启后只有被邀请的用户才可以进行注册。">
            {toggle('invite', 'invite_force')}
          </ConfigItem>
          <ConfigItem title="邀请佣金百分比" description="默认全局的佣金分配比例，你可以在用户管理单独配置单个比例。">
            <input
              type="text"
              className="form-control"
              placeholder="请输入"
              defaultValue={text(invite.invite_commission)}
              onChange={(e) => {
                const value = integer(e.target.value)
                if (value !== undefined) set('invite', 'invite_commission')(value)
              }}
            />
          </ConfigItem>
          <ConfigItem title="用户可创建邀请码上限">
            <input
              type="text"
              className="form-control"
              placeholder="请输入"
              defaultValue={text(invite.invite_gen_limit)}
              onChange={(e) => {
                const value = integer(e.target.value)
                if (value !== undefined) set('invite', 'invite_gen_limit')(value)
              }}
            />
          </ConfigItem>
          <ConfigItem title="邀请码永不失效" description="开启后邀请码被使用后将不会失效，否则使用过后即失效。">
            {toggle('invite', 'invite_never_expire')}
          </ConfigItem>
          <ConfigItem
            title="佣金仅首次发放"
            description="开启后被邀请人首次支付时才会产生佣金，可以在用户管理对用户进行单独配置。"
          >
            {toggle('invite', 'commission_first_time_enable')}
          </ConfigItem>
          <ConfigItem title="佣金自动确认" description="开启后佣金将会在订单完成3日后自动进行确认。">
            {toggle('invite', 'commission_auto_check_enable')}
          </ConfigItem>
          <ConfigItem title="提现单申请门槛(元)" description="小于门槛金额的提现单将不会被提交。">
            {input('invite', 'commission_withdraw_limit', '请输入')}
          </ConfigItem>
          <ConfigItem title="提现方式" description="可以支持的提现方式。">
            {textarea(
              'invite',
              'commission_withdraw_method',
              '请输入后缀域名，逗号分割 如：支付宝,USDT,贝宝',
              '4',
              true,
            )}
          </ConfigItem>
          <ConfigItem title="关闭提现" description="关闭后将禁止用户申请提现，且邀请佣金将会直接进入用户余额。">
            {toggle('invite', 'withdraw_close_enable')}
          </ConfigItem>
          <ConfigItem title="三级分销" description="开启后将佣金将按照设置的3成比例进行分成，三成比例合计请不要>100%。">
            {toggle('invite', 'commission_distribution_enable')}
          </ConfigItem>
          {on(invite.commission_distribution_enable) ? (
            <>
              <ConfigItem isChildren title="一级邀请人比例">
                {input('invite', 'commission_distribution_l1', '请输入比例如：50')}
              </ConfigItem>
              <ConfigItem isChildren title="二级邀请人比例">
                {input('invite', 'commission_distribution_l2', '请输入比例如：30')}
              </ConfigItem>
              <ConfigItem isChildren title="三级邀请人比例">
                {input('invite', 'commission_distribution_l3', '请输入比例如：20')}
              </ConfigItem>
            </>
          ) : (
            ''
          )}
        </div>
      ),
    },
    {
      key: 'frontend',
      label: '个性化',
      children: (
        <>
          <Alert>
            前后分离部署时本页配置同样生效：管理端在登录后和每次打开时读取这里的设置，登录页在首次登录前使用 config.js
            中的主题与背景。
          </Alert>
          <div className="">
            <ConfigItem title="边栏风格">
              <Switch
                checkedChildren="亮"
                unCheckedChildren="暗"
                checked={frontend.frontend_theme_sidebar === 'light'}
                onChange={(checked) => set('frontend', 'frontend_theme_sidebar')(checked ? 'light' : 'dark')}
              />
            </ConfigItem>
            <ConfigItem title="头部风格">
              <Switch
                checkedChildren="亮"
                unCheckedChildren="暗"
                checked={frontend.frontend_theme_header === 'light'}
                onChange={(checked) => set('frontend', 'frontend_theme_header')(checked ? 'light' : 'dark')}
              />
            </ConfigItem>
            <ConfigItem title="主题色">
              <select
                className="form-control"
                defaultValue={text(frontend.frontend_theme_color)}
                onChange={(e) => set('frontend', 'frontend_theme_color')(e.target.value)}
              >
                <option value="default">默认</option>
                <option value="black">黑色</option>
                <option value="darkblue">暗蓝色</option>
                <option value="green">奶绿色</option>
              </select>
            </ConfigItem>
            <ConfigItem title="背景" description="将会在后台登录页面进行展示。">
              {input('frontend', 'frontend_background_url', 'https://xxxxx.com/wallpaper.png')}
            </ConfigItem>
          </div>
        </>
      ),
    },
    {
      key: 'server',
      label: '节点',
      children: (
        <>
          <div className="">
            <ConfigItem title="节点对接API地址" description="v2node节点一键对接专用地址。">
              {configInput('server', 'server_api_url', '请输入节点通信地址')}
            </ConfigItem>
          </div>
          <div className="">
            <ConfigItem title="通讯密钥" description="V2board与节点通讯的密钥，以便数据不会被他人获取。">
              {input('server', 'server_token', '请输入')}
            </ConfigItem>
          </div>
          <div className="">
            <ConfigItem title="节点拉取动作轮询间隔" description="节点从面板获取数据的间隔频率。">
              {numberInput('server_pull_interval', '秒')}
            </ConfigItem>
          </div>
          <div className="">
            <ConfigItem title="节点推送动作轮询间隔" description="节点推送数据到面板的间隔频率。">
              {numberInput('server_push_interval', '秒')}
            </ConfigItem>
          </div>
          <div className="">
            <ConfigItem
              title="节点用户流量上报最低阈值"
              description="每次推送动作仅累计使用流量高于阈值的用户信息会被上报，未上报流量会累计"
            >
              {numberInput('server_node_report_min_traffic', 'Kb')}
            </ConfigItem>
          </div>
          <div className="">
            <ConfigItem
              title="节点用户设备数统计最低阈值"
              description="每次推送动作仅上报流量高于阈值的在线设备IP地址会被节点统计"
            >
              {numberInput('server_device_online_min_traffic', 'Kb')}
            </ConfigItem>
          </div>
          <ConfigItem title="全局设备数限制采用宽松模式" description="开启后同一IP地址使用多个节点只统计为一个设备">
            {toggle('server', 'device_limit_mode')}
          </ConfigItem>
        </>
      ),
    },
    {
      key: 'email',
      label: '邮件',
      children: (
        <>
          <Alert>如果你更改了本页配置，需要对队列服务进行重启。另外本页配置优先级高于.env中邮件配置。</Alert>
          <div className="">
            <ConfigItem title="SMTP服务器地址" description="由邮件服务商提供的服务地址">
              {input('email', 'email_host', '请输入')}
            </ConfigItem>
            <ConfigItem title="SMTP服务端口" description="常见的端口有25, 465, 587">
              {input('email', 'email_port', '请输入')}
            </ConfigItem>
            <ConfigItem title="SMTP加密方式" description="465端口加密方式一般为SSL，587端口加密方式一般为TLS">
              {input('email', 'email_encryption', '请输入')}
            </ConfigItem>
            <ConfigItem title="SMTP账号" description="由邮件服务商提供的账号">
              {input('email', 'email_username', '请输入')}
            </ConfigItem>
            <ConfigItem title="SMTP密码" description="由邮件服务商提供的密码">
              {input('email', 'email_password', '请输入')}
            </ConfigItem>
            <ConfigItem title="发件地址" description="由邮件服务商提供的发件地址">
              {input('email', 'email_from_address', '请输入')}
            </ConfigItem>
            <ConfigItem title="邮件模板" description="你可以在文档查看如何自定义邮件模板">
              <select
                onChange={(e) => set('email', 'email_template')(e.target.value)}
                className="form-control"
                value={selected(email.email_template)}
              >
                {config.emailTemplate.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </ConfigItem>
            <ConfigItem title="发送测试邮件" description="邮件将会发送到当前登陆用户邮箱">
              <Button loading={config.testSendMailLoading} type="primary" onClick={() => void config.testSendMail()}>
                发送测试邮件
              </Button>
            </ConfigItem>
          </div>
        </>
      ),
    },
    {
      key: 'telegram',
      label: 'Telegram',
      children: (
        <div className="">
          <ConfigItem
            title="Telegram通信域名"
            description="Telegram Webhook 使用的 HTTPS 通信域名，留空则使用站点网址。修改后需重新设置 Webhook。"
          >
            {configInput('telegram', 'telegram_webhook_domain', 'https://api.example.com', 'url')}
          </ConfigItem>
          <ConfigItem title="机器人Token" description="请输入由Botfather提供的token。">
            {input('telegram', 'telegram_bot_token', '0000000000:xxxxxxxxx_xxxxxxxxxxxxxxx')}
          </ConfigItem>
          {Boolean(telegram.telegram_bot_token) && (
            <ConfigItem title="设置Webhook" description="对机器人进行Webhook设置，不设置将无法收到Telegram通知。">
              <Button
                type="primary"
                onClick={() => void config.setTelegramWebhook()}
                loading={config.setTelegramWebhookLoading}
                disabled={config.setTelegramWebhookLoading}
              >
                一键设置
              </Button>
            </ConfigItem>
          )}
          <ConfigItem title="开启机器人通知" description="开启后bot将会对绑定了telegram的管理员和用户进行基础通知。">
            {toggle('telegram', 'telegram_bot_enable')}
          </ConfigItem>
          <ConfigItem title="显示绑定功能" description="是否在用户中心显示绑定 Telegram 的入口。">
            {toggle('telegram', 'telegram_show_bind', 1)}
          </ConfigItem>
          <ConfigItem title="群组地址" description="填写后将会在用户端展示，或者被用于需要的地方。">
            {input('telegram', 'telegram_discuss_link', 'https://t.me/xxxxxx')}
          </ConfigItem>
        </div>
      ),
    },
    {
      key: 'app',
      label: 'APP',
      children: (
        <>
          <Alert>用于自有客户端(APP)的版本管理及更新</Alert>
          <div className="">
            <ConfigItem title="Windows" description="Windows端版本号及下载地址">
              {input('app', 'windows_version', '1.0.0')}
              {input('app', 'windows_download_url', 'https://xxxx.com/xxx.exe', 'form-control mt-1')}
            </ConfigItem>
            <ConfigItem title="macOS" description="macOS端版本号及下载地址">
              {input('app', 'macos_version', '1.0.0')}
              {input('app', 'macos_download_url', 'https://xxxx.com/xxx.dmg', 'form-control mt-1')}
            </ConfigItem>
            <ConfigItem title="Android" description="Android端版本号及下载地址">
              {input('app', 'android_version', '1.0.0')}
              {input('app', 'android_download_url', 'https://xxxx.com/xxx.apk', 'form-control mt-1')}
            </ConfigItem>
          </div>
        </>
      ),
    },
  ]

  return (
    <AdminLayout title="系统配置">
      <div className={`mb-0 block border-bottom ${config.fetchLoading ? 'block-mode-loading' : ''}`}>
        <V2Tabs defaultActiveKey={config.tabs} size="large" items={items} />
      </div>
    </AdminLayout>
  )
}
