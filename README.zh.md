# dsh-highlightpin 0.1.0

在 DeepSeek Harness 中钉住已定稿消息的原文，每枚钉子独立选择按需补回、中性常驻或重点常驻。

[English](README.md) · [设计](DESIGN.md) · [验证与评测](EVAL.md) · [探针证据](docs/PROBES.md) · [0.2.0 交付报告](docs/RELEASE-0.2.0.zh.md)

> **0.1.0 是首个公开发布版本。** `DESIGN.md`、`EVAL.md` 与 `docs/` 中出现的修订号（0.1.0–0.2.2）是公开发布前的开发期记录，按当时写法保留。

## 安装

```sh
# 从 GitHub 安装
dsh plugin --profile desktop add 'https://codeload.github.com/sbearbug/dsh-highlightpin/tar.gz/v0.1.0'

# 从本地检出安装
npm ci && npm run check && npm pack
dsh plugin --profile desktop add /绝对路径/dsh-highlightpin-0.1.0.tgz
```

也可直接安装源码目录。升级后完全退出并重新启动 DSH，再刷新页面，以同时加载新宿主和新客户端。已有钉子保留。不要直接编辑 profile 的安装清单；客户端产物通过 `npm run build` 重建。

## 使用

在同一条已定稿的用户或助手消息中划选正文，点击输入框上方的小图钉。旁边的箭头展开详情，箭头、关闭按钮或 Esc 收起；操作提示在按钮右侧。详情面板为每枚钉子提供三个级别按钮、预算、刷新和解钉，按钮与面板材质跟随当前输入框。

| 级别 | 注入行为 | 适用情况 |
|---|---|---|
| `pin`（默认） | 原文或完整旧注记仍在上下文时不动；缺失时尾部逐字补注 | 大多数资料，避免改动系统前缀 |
| `resident` | 常驻系统提示词，中性标题，相关时参考，不需要主动提及 | 重要背景 |
| `highlight` | 常驻系统提示词，重点标题，相关时优先遵循；最新明确要求优先 | 重点和约束 |

resident 与 highlight 分段渲染，互不合并。切换到常驻级别会显示「会进入系统提示词，切换时前缀缓存会失效一次」。这是提示前缀变化的代价；实际缓存命中由提供方决定，尚未测量。正在执行的步骤保留已经组装的原文快照，下步采用新级别。

| 命令 | 操作 |
|---|---|
| `/hlpin list` | 显示每枚级别与预算用量 |
| `/hlpin last` | 钉住最近一条有正文的助手回复，默认 pin |
| `/hlpin show 1` | 查看第 1 枚全文 |
| `/hlpin drop 1` | 解钉第 1 枚 |
| `/hlpin level 1 pin` | 设置按需补回 |
| `/hlpin level 1 resident` | 设置中性常驻 |
| `/hlpin level 1 highlight` | 设置重点常驻 |

## 精度与边界

`source-exact` 精确定位源子串；`source-normalized` 通过有限 Markdown、Unicode 与空白投影定位，但保存的仍是源切片。对齐失败或歧义时明确降为 `rendered`，保存显示文本，不伪称源文本精确。公式选区吸附到整条公式并读取 KaTeX TeX annotation；部分代码保留缩进与换行。多 text part 的 last 按源顺序以换行连接、标为 rendered，范围为 −1。推理和工具块不属于助手正文。

不支持跨消息选区、流式消息、工具输出、全局钉子或原文处的视觉高亮。这里的 highlight 指模型输入的强调级别。

## 配置与兼容

| 配置 | 默认 | 含义 |
|---|---|---|
| `mode` | `notice` | 仅兼容/评测；strict 将此 profile 所有钉子至少按 resident 处理 |
| `maxPinChars` | 16000 | pin 类型原文合计字符数 |
| `maxResidentChars` | 6000 | resident 类型原文合计字符数 |
| `maxHighlightChars` | 2000 | highlight 类型原文合计字符数 |
| `holdSubagents` | false | 默认豁免子代理 |

三个数值必须是正安全整数；字符按 UTF-16 单元计数。每种类型独立计算，不限制钉子数量、单枚长度或会话总量；resident 不包含 highlight。新增和升级只检查目标有效类型，超限错误码为 `pin-budget-exceeded`、`resident-budget-exceeded`、`highlight-budget-exceeded`，不截断、不淘汰、不自动降级。

保留降级总是允许的约定：降级或旧数据可能使某一类型暂时超预算，这时显示实际用量，拒绝继续向该类型新增或升级，其他类型不受影响。profile strict 的最低 resident 规则仍生效，按有效级别计费。

开发期 0.2.2 修订（已包含在首个公开版 0.1.0 中）移除并忽略旧配置 `maxPins`、`maxHighlightPins`、`maxTotalChars`；`maxPinChars` 由单枚上限改为 pin 类型合计上限，默认从 4000 改为 16000。若旧 profile 显式设置了 maxPinChars，其数值继续生效，但含义改为 pin 合计预算，可按需要重新设置。已有钉子无需迁移。

官方 storageDomain 为 `highlightpin`，version 保持 1。旧记录没有 level 默认 pin；旧会话 `mode=strict` 且没有 level 的钉子映射为 resident。显式 level 优先于旧会话 mode；profile strict 仍强制最低 resident。写入等待落盘后才成功，同一宿主内串行，单 profile 仅支持一个写进程。钉子不自动随 fork 继承；解钉不删除历史注记。

域首次打开失败最多尝试 3 次，间隔 100/200 ms；仍失败显示存储未就绪，需要重载插件或重启宿主，不无限重试。

## HTTP

前缀 `/highlightpin/api`：GET `/pins?session=...`、`/health`；POST `/pin`、`/unpin`、`/level`。level 请求为 `{sessionId,pinId,level}`，pins 响应含有效级别与所有预算用量。GET 和 POST 都要求 JSON Content-Type，沿用 Host、Origin/端口、Fetch Metadata 围栏与 64 KiB 请求体限制。

POST `/mode` **仅为旧客户端保留**：strict 将现有非 highlight 钉子改为 resident（受预算限制），notice 将现有钉子改为 pin。新客户端不使用它。profile strict 下有效级别仍最低 resident。命令或其他窗口修改后点击刷新；过期刷新响应不会覆盖新状态。

## 验证

```sh
npm run check
npm run eval
node eval/score.mjs real-captures.json results.json
```

0.1.4 基线的真实 `/hlpin last → /compact → 下一条消息` 已先于修改验证：被遮蔽原文在真实下一步输入中逐字补回，证据见 PROBES。0.2.0 的三档、快照、预算、路由、命令和 React 交互通过离线测试。三档真实模型召回、主动提及率与缓存对照尚未执行，协议见 `eval/PROTOCOL.zh.md`。

感谢 MIT 项目 [dsh-bite](https://github.com/wobenshiwomu/dsh-bite) 的公开实现与离线测试思路。本项目独立实现，未读取或复制 dsh-anchor 代码。GitHub/npm/市场发布尚未执行。

MIT License.
