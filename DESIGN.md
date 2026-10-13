# 设计说明

包名 `dsh-highlightpin`，命令 `/hlpin`。每枚钉子有三档级别：`pin` 按需补回、`resident` 中性常驻、`highlight` 重点常驻。

## 原文与源文本对齐

客户端读 `data-chat-node-key`，通过 dock 的 `useChat(state => state.nodes)` 找到真实消息 id。会话归属由 `data-conversation-session` 检查，避免并排会话中相同 Chat key 串线。用户消息用节点 id，助手消息用 `data.finalNode.messageId`；只有真实用户和已定稿助手正文可钉。

Range 在 selectionchange 时立即序列化为普通字符串；不会缓存可能随分页卸载的 DOM Range。KaTeX 内部边界扩展到整条公式，annotation 转回 TeX。块边界补换行，按钮、代码工具栏、行号、附件和推理区域被剔除。选择代码块部分时不外扩。

宿主读取源会话日志，最后一条同 id 事件为准。先精确匹配，再对空白、NFC 和有限 Markdown 语法做带索引映射的投影。所有成功匹配都保存 source.slice(start,end)，不把投影字符串作为原文。重复匹配通过 64 字符邻近上下文评分；至少 0.6 的匹配分数且领先第二名 0.15 才接受。复杂语法不猜测，返回 rendered 与明确警告。

范围跨过 Markdown 标记时，外扩平衡标记，可能包含邻近源文本。存储预算因此以最终源文本长度计算。多 part 的 last 命令是显式例外：全文按 text part 顺序以换行连接，fidelity=rendered、范围字段 −1；不同 part 的选区去重包含 partIndex。

## 默认按需补注

判定输入是钉子与当前模型历史，输出缺失钉子的稳定排序。原消息 id 仍在时还要验证钉子全文确实存在，避免保留 id 的部分替换误判；完整历史注记也可证明原文在场。注记标记与全文块必须同时匹配，不能仅凭 pinIds 判断截断后的注记仍完整。已知其他 source 不能冒充本插件；source 丢失时允许识别有确定性首行和完整原文块的文本。

判定不记录 digestedSeq，也不消耗压缩触发。reject、未提交决策、重启、再次遮蔽注记都无需补偿。注记正文无时间戳，按 createdAt/id 稳定排序；定界符冲突使用 hash 并确定性追加后缀，原文完整保留。

### 两个容易误判的宿主行为

1. `pre-step.messages` 实际是 inbox claim，不是整个模型历史。实现使用 `session.deriveMessages()` 与下游放行的 decision.messages 合并判定。监听器 prepend 并先 await next，确保下游压力压缩已执行；保留 decision 的其他字段。
2. 溢出压缩发生在 `agent/request-error` 内；同一步 retry 不再执行 pre-step。实现也在此 waterfall 的下游 retry 决定后检查缺失项，并追加宿主已有的 `user/message` 类型，随后由宿主重建请求。未决定 retry 时不追加。这里不新增日志类型，也不改写原始会话。

默认 notice 不改系统提示词，因此添加仍在上下文中的 source pin 不会改请求前缀。压缩后的补注并不能保证提供方缓存实际命中；需要真实 usage 对照评测。

## 三档级别与系统提示词

pin 维持原有按需补注，避免仍在历史中的原文改变系统前缀。resident 保留中性背景，相关时参考、不主动提及；highlight 使用强调措辞，相关时优先遵循，明确最新用户要求优先。两者分别渲染标题，先 resident 后 highlight，空段省略；不能合并，否则用户无法选择主动提及倾向。

每个非豁免 agent 注册 systemPrompt.section（agent/created 及已有 agents），order=9500、interpolate=false，避免原文花括号被解释。text 从 store.list(agent.session.id) 读取有效级别，筛选常驻钉子，再按 createdAt/id 稳定排序渲染。pinBlock 的结构与原文保持不变，notice 标题为「已不在当前上下文」。

改变常驻段的内容、增删或级别会改变系统前缀；provider 缓存实际失效范围需要真实 usage 对照，不能由字符数推断。宿主常规路径重写系统节点，in-history 适配器可能追加历史系统节点；重试采用已经组装的系统文本。注册由 agent 作用域持有，卸载显式 dispose fiber，子代理默认豁免。

### 快照一致性

WeakMap 按 agent 保存本步 section.text 实际渲染的 pin id 集合；它记录实际进入输入的原文，而不是当前级别。preStep 与 requestError 都把该集合传给纯函数 decide(pins,messages,excludeIds=[])，仅排除已在本步 section 中的 id。无快照时排除空集合，宁可补注重复，也不丢原文。

同一步中 pin→resident：旧 section 没包含它，仍须补注。resident→pin：旧 section 已包含它，仍排除，避免双注入。下一次组装重建快照，并采用新级别。此集合不用于永久 recall 记账；释放 agent 时清理。测试覆盖常规和 retry 两条路径、缺失快照以及同一步升降级。

## 存储、预算与副作用

domain=highlightpin，版本 1，sessionId 对应 pins 数组。open 异步，未就绪 HTTP 503，pre-step 放行。所有修改在插件级写链上串行，首次建记录与 update 在同一串行任务内。预算检查与去重也在此任务内，避免并发读改写超额。官方 domain 的写链保证后端确认后才更新内存；调用方 await 完成后才报告成功。读取返回复制的 pin 记录，避免调用者修改 domain 内存。

pin/resident/highlight 是三个独立原文字符池，默认 16000/6000/2000。取消数量、单枚和会话总量限制，resident 不再包含 highlight。三个配置均要求正安全整数。setLevel 与增删共用串行链，新增和升级只检查目标有效类型，其他超额旧数据不阻塞它；超限明确拒绝，降级总允许。降级导致目标池超额时继续保留完整原文，拒绝向该池进一步新增或升级，允许删除或继续降级。旧 maxPins/maxHighlightPins/maxTotalChars 忽略；显式旧 maxPinChars 继续生效但改为 pin 合计预算。缺省 level 为 `pin`。domain version 仍为 1，schema 显式声明可选 level 避免 Zod 剥离。domain 首次打开最多尝试三次。超限拒绝新 pin，不淘汰旧 pin，不在注入时截断。不同 text part 的相同范围不是重复；rendered 的 −1 范围额外比较文本，避免全部 fallback 被误合并。已接受 pin 的保护不随调低预算而消失，新 pin 受新预算限制。

仅支持单个宿主写进程。同一宿主内并发安全不等于跨进程安全；官方 domain 的内存变更推送也只在单进程内可见。

## HTTP 与 UI

webServer/webRuntime 懒注入，headless 不依赖 web。会话读取服务同样可选注入；命令直接读活跃 agent.session。所有端点要求 JSON Content-Type，并检查 Host、Origin（包括端口）和跨站 Fetch Metadata。64 KiB 请求体按 UTF-8 字节计数；超限释放已收集内容并返回 413，不 destroy 请求而让响应无法送达。

只向 dock 注册一个新条目，不替换宿主 renderer。React 由 loader 提供，bundle 不导入任何 Harness Client 包。样式使用宿主已核实的 --dsw-alias-* token。选区、提示、请求结果带会话检查，防止切换会话后把旧请求结果显示到新会话。刷新使用递增请求序号，并在会话切换和修改前使旧请求失效，过期响应不写状态。SessionSnapshot 兜底取 session.sessionId。状态计数只根据已提交事件更新，绝不参与 recall 判定。刷新按钮读取最新列表与展示计数，不后台轮询。

## 限制与后续验证

公开源码与离线测试不足以证明当前页面的 DOM、完整插件挂载或主题视觉正确。必须完成 PROBES 的真机清单，再做 L2 模型召回与缓存测量。没有声称模型必定在回答中逐字输出：插件保证的是对应注入路径保留原文输入。


## 材质跟随

收起时操作提示与图钉/箭头在同一 flex 行。按钮容器和详情面板首先使用宿主输入框专用材质 token，然后以当前 data-composer-card 的 computed background、border、radius、shadow 和 backdrop-filter 覆盖局部变量，从而跟随用户对输入卡片的主题修改。MutationObserver 和系统配色监听器只读宿主样式，不修改宿主 DOM；组件卸载时清理。
