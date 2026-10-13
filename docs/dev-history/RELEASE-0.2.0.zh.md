# highlightpin 0.2.0 交付报告

1. 【真机验证】先于源码修改，0.1.4 的 last → compact → 下一条消息 M1 门槛通过。
2. 【离线】每枚钉子的 pin / resident / highlight 已实现，默认 pin，后两者分段常驻。
3. 【离线】domain version 1 不变，旧 strict 缺省级别映射 resident，level 能回写保留。
4. 【离线】preStep 与 requestError 都排除实际 section 快照；无快照保守补注。
5. 【离线】三层预算提升超限拒绝，降级允许，不截断、不淘汰、不增日志类型。
6. 【离线】命令、HTTP、每枚三档 UI、sessionId 兜底、刷新竞争与有限重试已完成。
7. 【离线】npm run check 全绿：78/78；受控三档输入保真均为 6/6。
8. 【待真机】0.2.0 三档真机联调、L2 召回/主动提及率与 cache usage 尚未测量。

## 前置证据

【真机验证】通过 DSH 原生界面，在隔离会话 session-543de7d2-15a3-4070-8e3a-3f958b9f5b53 执行。首次短历史压缩失败后添加测试填充，再次压缩成功（seq 44）。原消息 seq 18 被 replacement 遮蔽；seq 52 补注的原文块与存储原文 53 UTF-8 字节相同，seq 53 的请求前 surface 包含它，之后完成实际模型请求。SHA-256 与 caveat 保存在 [m1-live-0.1.4.json](m1-live-0.1.4.json)，过程见 [PROBES.md](PROBES.md)。这是实际输入保真证据，不是召回率评测。

## 实现与约束

| 项目 | 当前实现证据 | 类型 |
|---|---|---|
| 可选 level 与 version 1 | src/store.js:9、:14、:16；src/levels.js:2 | 【离线】 |
| 串行 setLevel 与预算拒绝 | src/store.js:25、:28、:53；src/config.js:5 | 【离线】 |
| 纯函数判定及 excludeIds | src/decide.js:3 | 【离线】 |
| 新旧 notice 兼容、pinBlock 保留、两段标题 | src/notice.js:4、:9、:23、:31 | 【离线】 |
| actual section id 快照，两条路径共用 | src/index.js:19、:46、:62、:80 | 【离线】 |
| level 命令与列表 | src/index.js:111、:122 | 【离线】 |
| level 路由与 GET 用量 | src/routes.js:48、:52 | 【离线】 |
| SessionSnapshot.sessionId 与刷新代号 | src/client/index.jsx:46、:61、:79 | 【离线】 |
| 每枚三档 UI 与缓存提示 | src/client/index.jsx:114、:146 | 【离线】 |
| domain 有限重试 | src/store.js:36 | 【离线】 |

常驻段先 resident 后 highlight，空段不输出；稳定排序与原文块没有动态时间戳。section order=9500，interpolate=false；默认豁免子代理。正在执行的一步中升级的钉子仍补注，降级的钉子仍按已渲染快照排除，下步重组采用新级别。

预算错误码：resident-budget-exceeded、too-many-highlight-pins、highlight-budget-exceeded。旧数据或调低预算不会自动删除原文。旧 POST /mode 保留为兼容端点，新 UI 不使用；其批量行为和 profile strict 最低 resident 规则均在 README 说明。

## 验证与交付

【离线】npm run check 退出码 0，78 测试通过；客户端 build、loader 工厂执行和 dock 注册通过。测试包含旧普通/strict 数据回写重开、混合常驻预算、highlight 两层限制、降级、并发/失败原子性、三档路径、同一步切换、retry 快照、缺失快照、路由/命令/真实 React 交互及过期刷新回归。

【离线】npm run eval 退出码 0，原始结果见 eval/deterministic-results.json；pin/resident/highlight 各 6/6 原文字节完整保留。eval/PROTOCOL.zh.md 已改为无插件 / pin / resident / highlight（bite 可选），加入主动提及率独立探针；score.mjs 单独统计 activeMentionRate，缺失数据为 null。

交付包：dsh-highlightpin-0.2.0.tgz。完整安装命令见 README.zh.md。DESIGN.md 更新三档动机、缓存代价与快照；README 中英文更新用法。0.1.4 状态报告保留为历史基线。

本次不声称已将 0.2.0 安装进正在运行的 desktop profile；真机 M1 使用的是 0.1.4 基线。0.2.0 真实界面点击、两种常驻标题进入系统提示词及 cache hit/miss 的对照仍需升级后验证。没有填造 L2 数字或向 GitHub/npm/市场发布。
