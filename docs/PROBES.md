# 平台核实与真机探针

记录日期：2026-10-13（Asia/Shanghai）。基准源码：DeepSeek Harness 0.2.0-rc.2。下文引用官方源码时，路径的根是从该版本 `app.asar` 解包出的 `dsh/node_modules/@deepseek-ai/`。

## 0.1.x 初始离线调查（历史记录）

- 读取已解包的官方源码；未修改这些参考目录。
- 导入真实官方 Session、DomainFacility、createUserMessage、Config 与命令品牌类型。
- 用真实 Session.append 的合法 replacement/provenance 操作验证遮蔽、source/id 保留、日志恢复和重复补注。
- 用真实 DomainFacility 的写链与内存后端验证并发、提交顺序、失败回滚及 close/open。
- jsdom 验证选区 Range、KaTeX 外扩、TeX annotation、块换行、代码片段与会话归属。
- 构建浏览器产物，并实际执行 ModuleLoader 工厂、确认导出和 dock 注册。
- 对 `http://127.0.0.1:19387` 的普通及沙盒外只读连接检查均失败（curl exit 7）。浏览器控制初始化也超时。本轮无运行中 DSH 页面可验证。

## 已核实契约

| 问题 | 结果与证据 |
|---|---|
| DOM 是否直接给出 messageId | 源码给出 `data-chat-node-key`，没有据此宣称 DOM 有直接 messageId。`dsh-client-ui-chat/lib/client.js:1763` |
| 如何拿源消息 id | 标准 `useChat(s => s.nodes)`，`:5137`；user 的节点 id 是 source message id，`:9270` 起的 messageDefinition；assistant 的 finalNode.messageId，`:7550` |
| 如何区分已定稿 | assistant `data.finalNode` 指向已提交助手消息，`:7543` 起；renderer streaming 检查 data.status === running，`:6008` |
| 如何防止跨会话捕获 | `data-conversation-session`，`dsh-client-ui-conversation/lib/client.js:16333` |
| dock 合约 | `dsh-cordis-client-runner/lib/client.js:3004–3059`：list/session、ownerProps session/input、standardProps useChat/sessionId |
| KaTeX 与 UI chrome | `dsh-client-ui-primitives/lib/index.js:11007` 调用 KaTeX；`:10894` 代码工具栏属性，`:10911` 代码内容；`:11814` MarkdownText |
| pre-step.messages | `dsh-agent-loop/lib/index.js:905–919`：inbox claim，不是完整历史。下游 decision.messages 是本步最终待追加消息 |
| 模型历史与 source | `dsh-session/lib/index.js:214–225` deriveEventMessage 返回原数据；`:1554` deriveMessages。官方 Session 离线测试证实 id/source 保留 |
| 消息字段 | user 为 event.data；assistant 为 event.data.message。`dsh-session/lib/index.js:218–225` |
| 原消息与 notice 的部分改写 | 即使 id 保留，content 也可能改变，因此判定额外核对完整原文／notice block |
| compaction/end 成败 | `dsh-compaction-basic/lib/index.js:484` 成功；`:495–498` 失败带 data.error。仅用于展示 |
| 自动压力压缩 | `dsh-compaction-basic/lib/index.js:839–855`，发生在 pre-step waterfall 内 |
| 同一步溢出重试 | `dsh-compaction-basic/lib/index.js:861–889` request-error 压缩并返回 retry；`dsh-agent-loop/lib/index.js:1124–1134` continue 不重新调用 preStep |
| 重试后追加的合法事件 | `dsh-session/lib/index.js:1441` append，user/message 是已知类型。正常 agent loop 自己也于 `:1061` 追加同类型 |
| 系统提示词严格保留 | `dsh-system-prompt/lib/index.js:240` section、`:342` 函数求值；`:114` interpolate=false 原样保留 |
| section order | `dsh-system-prompt/lib/index.js:10–40`，9500 位于官方 9000 与 9900 之间 |
| 系统节点更新 | `dsh-agent-loop/lib/index.js:263–286`：普通路径头节点替换，in-history 能力下可能追加节点 |
| 写入并发语义 | `dsh-storage-domain/lib/index.js:215` 每域写链、`:257` put、`:278` update；跨进程安全不能由此推出 |
| domain name | `dsh-storage-domain/lib/index.js:61` defineDomain；使用无连字符的 highlightpin |
| 命令与调用字段 | `dsh-commands/lib/index.js:266` register、`:379` invocation；`lib/types/brand.js:16` CommandDefinitionId |
| 活会话读取 | `dsh-session/lib/index.js:1861` sessions.get |
| 冷会话读取 | `dsh-session-persistence-jsonl/lib/index.js:2454` open、`:2536` stat；read/close 用法与参考 dsh-bite 的 resolveEvents 一致 |
| 现有 agent 与清理 | `dsh-agent/lib/index.js:579` agent/created、`:550` agent/disposed、`:612` agents.list |
| HTTP 路由 | `dsh-host-webserver/lib/index.js:177` register、`:235` handler(req,res) |

参考材料里曾有一份 `web-server.README.md`，实为 dsh-web 的搜索/抓取文档，不能用它证明 `webServer.register`；该证据见上表。信任围栏是本地函数，不是官方 API。

## 初始真机清单（历史记录，最新 M1 结论见末尾）

- [ ] 安装到 desktop profile，确认宿主激活与页面客户端加载，空跑无报错。
- [ ] 用实时 Slot 树确认 dock 的标准属性与节点 lookup 行为。
- [ ] 验证当前页面实际存在上述 DOM 属性与 KaTeX annotation。
- [ ] 滚到顶部／底部统计实际消息节点，确认分页或虚拟化的行为；源码中导航轨有虚拟化，但不能据此断言正文列表也虚拟化。
- [ ] 在普通文本、加粗、行内代码、公式、独立公式、代码片段、中文上完成划选→钉住→检查源文本。
- [ ] 验证跨消息、跨会话、工具、推理、流式选区拒绝提示。
- [ ] 真实 `/compact`、自动压力压缩以及 provider 溢出 retry 后，检查最终模型请求原文字节。
- [ ] DSH 重启后列表一致；多个 GUI 窗口连接同一宿主时更新无丢失。
- [ ] notice/strict 切换与插件卸载清理；明暗主题、键盘焦点、dock 交互无 crash。
- [ ] 核实 schema 是否自动生成可用设置页；本实现未另造设置页面。
- [ ] 获取真实 usage 的 cache hit/miss 字段并运行四组 L2。

该清单记录初始调查时的状态；2026-10-13 后续 M1 真机结果见末尾，未执行项仍不宣称通过。

## 0.1.1 增量验证

已通过 60 项离线测试，包括真实 React + jsdom 中的图钉/箭头折叠、展开、模式按钮、选区清空后的缓存钉住、切换会话，以及模式存储恢复、写失败、HTTP 围栏、已有 agent 的 section 动态切换。客户端产物重新构建并验证。布局沿用宿主 composer 的宽度变量（dsh-client-ui-conversation/lib/client.js:15215、:16298–16310）。这些交互测试不能代替 DSH 当前页面的视觉验证；紧凑布局的真机截图仍待确认。

## 0.1.2：收起回归修复

在旧 0.1.1 产物上复现：首次加载的异步错误会将刚关闭的详情重新展开。已移除请求结果对展开状态的修改，收起时条件渲染移除面板，不再依赖 hidden 样式；提供面板关闭按钮和 Esc。新增测试覆盖迟到错误、宿主 hidden 样式干扰以及多次展开/收起。61 项离线测试、构建与 loader 检查通过；当前 DSH 页面视觉仍待验证。

## 0.1.3：新客户端与旧宿主响应兼容

用户截图显示列表已加载但模式按钮都禁用。旧客户端用 !mode 禁用按钮，旧宿主 pins 响应恰好没有 mode 字段，能够复现这种状态。现在缺少 mode 时明确提示宿主可能未更新；加载列表后允许发起模式请求，旧版 mode 路由 404 会提示完全退出重启，不虚报切换成功。health/pins 提供运行中宿主 version，便于后续定位。React 回归测试模拟旧版列表响应与路由 404，61 项离线测试及构建检查通过。实际宿主版本尚未从用户运行环境读取，因此版本混用是依据截图和代码的判断。

## 0.1.4：横向反馈与输入框材质

操作反馈移至按钮组右侧，窄空间使用省略号并提供完整 title。按钮组与详情面板共用输入框背景/阴影/边框/圆角材质；通过当前 composer seat 的 data-composer-card 读取实际 computed style，同时跟踪主题样式和系统配色变化，同步透明背景、背景图和 backdrop-filter。data-composer-card 出处为 dsh-client-ui-conversation/lib/client.js:17444，标准材质定义见 :17172。62 项离线测试、构建和 loader 检查通过；当前 DSH 主题中的实际视觉仍需用户页面确认。

## 0.2.0 前置门槛：M1【真机验证】已通过

验证先于任何 0.2.0 源码改动，日期 2026-10-13（Asia/Shanghai）。运行中 desktop profile 的已安装包为 0.1.4；通过 DSH 原生界面新建隔离测试会话 `session-543de7d2-15a3-4070-8e3a-3f958b9f5b53`，未压缩已有研究会话。

步骤：生成短测试回复 → `/hlpin last` → `/compact` → 在压缩成功后发送不含原文的验收消息。首次极短历史压缩失败，seq 26 的 error 明确为摘要不比原历史短（535 >= 160 estimated framed tokens）；添加重复测试填充并再次执行 `/hlpin last` 和 `/compact` 后，seq 44 成功结束。

硬证据：原消息 seq 18 被 replacement seq 43 的范围 [9,32] 遮蔽；由真实日志恢复的请求前 surface 不再含原 messageId。seq 52 的 `user/message` source 为 `{kind:'highlightpin',form:'notice',pinIds:['p_1004cc2f548043b4986a27275a2ce843']}`；其中原文块与存储的 48 UTF-16 单元／53 UTF-8 字节逐字一致，SHA-256 为 `51c690fc4d35ba3ec37ae11b3ec26588a09bb40bfec56c4ec7c2f3cd713bc5a9`。恢复至 request/header seq 53 的 surface 含该补注，真实请求随后产生 assistant/message seq 55。

边界：本测试另有一枚相同文本的较新钉子，其原消息 seq 34 位于保留尾部，插件没有重复补注该 pin。这里证明被遮蔽来源的补注机制及字节保真，不声称模型回答召回率。证据摘要见 `docs/m1-live-0.1.4.json`。原日志由系统 `zstd -dc` 读取全部追加帧；Node 的默认单帧解压不适用于该多帧日志。


## 0.2.0 三档级别【离线】

前置 M1 真机门槛通过后才开始源码修改。npm run check：78/78 通过，build 和 loader/dock 验证通过。npm run eval：pin / resident / highlight 三条路径均为 6/6 原文字节完整保留；这不是模型召回率。

覆盖：version-1 旧 schema 兼容与 level 持久化、旧 strict 映射、profile strict 最低 resident；三层预算提升拒绝与任意降级；两段标题、空段省略、旧 pinBlock 不变、新旧 notice 识别；实际 section id 快照及常规/requestError 排除，同一步切换和无快照 fallback；level API 围栏、命令、React 每枚三档切换；SessionSnapshot.sessionId 兜底、旧 refresh 不能覆盖新状态；域打开失败最多三次。

0.2.0 三档 UI 的真机点击、系统提示词实际重渲染与提供方缓存 usage 对照尚未验证。本次真机证明限定于上节 0.1.4 基线的 M1，不将离线矩阵声称为真机三档验收。此前清单与版本段落保留为历史记录，最新结论以本节及 M1 证据为准。


## 0.2.1：取消选区后禁用图钉【离线】

旧实现遇到空选区时无条件保留序列化缓存，取消选择后按钮仍黑色、可点击。改为普通空选区立即清除缓存；仅在图钉 pointerdown/mousedown 到 click 的短暂激活过程保留。pointercancel、松开后未点击、键盘事件与失焦均释放保护，组件卸载清理监听器和定时器。

真实 React + jsdom 回归覆盖 removeAllRanges、折叠选区、取消后点击不产生 pin 请求、pointercancel、拖出按钮后松开及 mousedown→空选区→mouseup→click 仍保存原文。npm run check 78/78 和 loader 验证通过。这是离线交互测试，尚未在更新后的 DSH 真机上复验。


## 0.2.2：三类独立字符预算【离线】

按用户最新要求移除钉子数量限制，pin/resident/highlight 各自累计原文字符，默认 maxPinChars=16000、maxResidentChars=6000、maxHighlightChars=2000。resident 不再包含 highlight。移除单枚和会话合计上限；数量仍显示为统计值。

新增与升级仅检查目标有效类型，错误码为 pin-budget-exceeded / resident-budget-exceeded / highlight-budget-exceeded。沿用降级总允许的约定；降级或旧数据造成类型超额时保留原文，拒绝继续向该类型新增或升级，其他类型不受影响。profile strict 按有效 resident 级别计量。移除的 maxPins/maxHighlightPins/maxTotalChars 配置被忽略；旧 maxPinChars 数值改为 pin 合计预算，兼容说明已写入 README。

npm run check 78/78、客户端 loader/dock 检查通过；npm run eval 三档各 6/6。回归覆盖超过 20 枚总钉子、超过 5 枚 highlight、单枚超过旧 4000 字符、每类独立满额、目标类型拒绝与原文不变、并发升级、旧超额类型不阻塞其他类型、profile strict 有效预算、HTTP 返回独立用量与 UI 三类预算。尚未在安装后的 DSH 真机复验本次预算变更。

## 当前状态

- 【真机】M1 已通过：隔离会话完成 last → /compact → 下一条消息，请求前 surface 含逐字一致的被遮蔽原文补注（证据 m1-live-0.1.4.json，见上文 M1 一节）。
- 【真机】highlight 常驻系统提示词通道已在本机 DSH 上确认收到注入。
- 【真机·未完成】三档级别的完整真机联调未执行：notice 按需补回通道、明暗主题下的 dock 与详情面板均未在真机上验证。
- 【离线】npm run check 与 npm run eval 全绿；真实模型召回率、主动提及率、dsh-bite 对照与提供方缓存测量未执行。
