# highlightpin

[![Check](https://github.com/sbearbug/dsh-highlightpin/actions/workflows/check.yml/badge.svg)](https://github.com/sbearbug/dsh-highlightpin/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**划选任意片段钉住，压缩带不走。**

[English](README.md) · [设计](DESIGN.md) · [验证与评测](EVAL.md) · [探针证据](docs/PROBES.md)

这是一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件。你在对话里划选任意一段文字，比如一条约束、一个数字、一行公式或一段代码，点一下图钉把它钉住。之后无论上下文怎么压缩，模型拿到的都是这段**原文**，而不是摘要。

## 三档级别

每枚钉子可以单独选择一个级别：

| 级别 | 行为 | 适合 | 代价 |
|---|---|---|---|
| **pin**（默认） | 原文还在上下文里时什么都不做；一旦被压缩掉，就在下一次请求前从尾部逐字补回 | 大多数钉子 | 不改动系统提示词，不额外破坏前缀缓存 |
| **resident** | 常驻系统提示词，措辞中性："在相关时参考，不需要主动提及" | 重要背景：你一提到，模型马上能对上，但你不希望它每轮都主动提起 | 切换时前缀缓存失效一次 |
| **highlight** | 常驻系统提示词，措辞强调："在相关时优先遵循；若与你最新的明确要求冲突，以最新要求为准" | 需要模型持续遵守的约束和重点 | 同上；强调也会提高模型主动提及它的倾向 |

resident 和 highlight 被刻意设计成两档。"让模型随时找得到"和"让模型时刻记着"是两回事，强调本身就有副作用，所以选择权交给你。

## 安装

从 npm 安装（正式发布版）：

```sh
dsh plugin --profile desktop add dsh-highlightpin@0.1.2
```

也可以直接从 GitHub 源码安装：

```sh
dsh plugin --profile desktop add 'https://codeload.github.com/sbearbug/dsh-highlightpin/tar.gz/v0.1.2'
```

Web 版请把 `desktop` 换成 `web`。安装或升级后，请**完全退出并重启 DSH**，再刷新页面，这样宿主和前端才会同时加载新版本。已有的钉子不会丢失。

### 适配的 DSH 版本

`peerDependencies` 声明 `>=0.1.7-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0`。DSH 的插件管理器按 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 校验这些 peer，不匹配时会阻止安装与激活。

范围里之所以要写显式的预发布分支：在普通 semver 语义下，`>=0.1.7-rc.1 <0.3.0-0` 这种看似很宽的写法**匹配不到 `0.2.0-rc.*`**——node-semver 只有在范围里存在某个比较符与该版本 `major.minor.patch` 元组完全相同、且自身带预发布标签时，才会放行预发布版本。

| DSH 版本 | 状态 |
|---|---|
| 0.2.0-rc.2 | **实测**：开发与真机验证都在此版本 |
| 0.1.7-rc.1 / 0.1.7-rc.2 | **离线测试套件通过**；CI 每次推送都会在这条线上重跑同一套测试 |
| 0.2.x 其余版本 | 按所用 API 的兼容性推定，未逐一验证 |
| ≤ 0.1.6 | **不支持**：`CommandDefinitionId` 在 0.1.5 及以下不存在；0.1.6 线的会话事件校验也已不同 |
| ≥ 0.3.0 | 未声称 |

## 使用

1. 在**同一条**已经生成完毕的用户或助手消息里，划选一段文字。
2. 点击输入框上方的图钉。
3. 点旁边的箭头可以展开详情：在那里给每枚钉子切换"按需补回 / 中性常驻 / 重点常驻"，查看预算用量，或者解钉。

划选到公式时，选区会自动扩展到整条公式，存下来的是 TeX 源码。比如你划的是渲染后的 $\nabla_\theta J(\theta)$，存的就是源码 `$\nabla_\theta J(\theta)$`，而不是屏幕上那些渲染出来的字符。划选代码时会保留缩进和换行。

命令行同样可以完成所有操作：

| 命令 | 作用 |
|---|---|
| `/hlpin list` | 列出所有钉子、它们的级别和预算用量 |
| `/hlpin last` | 把最近一条助手回复整条钉住 |
| `/hlpin show <序号>` | 查看全文 |
| `/hlpin drop <序号>` | 解钉 |
| `/hlpin level <序号> pin\|resident\|highlight` | 切换级别 |

## 设计要点

- **存的是源文本，不是屏幕文字。** 前端先把选区序列化（公式还原为 TeX，去掉复制按钮、行号等界面元素），宿主再到会话日志里定位对应的源文本子串。对齐结果分三级：`source-exact`（精确命中）、`source-normalized`（经过空白和 Markdown 归一化后命中，但存的仍是源文本切片）、`rendered`（对不上，存的是显示文本，并会**明确告诉你**）。
- **pin 只在原文丢失后才补。** 刚钉住时原文本来就在上下文里，没必要重复注入。只有在压缩把它遮蔽之后才补回，而压缩那一刻前缀缓存本来就已经失效了。所以默认档位从构造上就不会额外破坏缓存。
- **判定是纯函数，不做记账。** 每一步都根据"当前上下文里还有没有这段原文"重新判断，不记录"已经补过"之类的状态。所以宿主拒绝某一步、插件重启、补回的注记再次被压缩，都不会让钉子丢失。
- **常驻段与补注互不重复。** 每一步都会记录这一步实际写进系统提示词的是哪几枚钉子，补注时排除它们。没有记录时就照常补注，原则是宁可重复，不可丢失。
- **超预算就拒绝，不截断。** pin、resident、highlight 三类各有独立的字符预算。新增或升级时如果超出预算，会直接拒绝并给出错误码；降级总是允许。插件不会偷偷截断、淘汰或降级任何钉子。
- **不碰会话日志格式。** 钉子存在官方的 `storageDomain` 里，补注用的也是宿主已有的消息类型，不会让会话因为出现未知事件而无法重新加载。HTTP 接口带来源校验，只接受来自本机页面的 JSON 请求。

完整的设计取舍见 [DESIGN.md](DESIGN.md)。

## 验证状态

- **真机**：在 DSH 中跑通了"钉住 → `/compact` → 下一条消息"。被压缩遮蔽的原文出现在下一次请求的输入里，与存储内容逐字节一致，SHA-256 也一致。证据见 [docs/PROBES.md](docs/PROBES.md) 和 [docs/m1-live-0.1.4.json](docs/m1-live-0.1.4.json)。
- **离线**：对齐、选区序列化、判定、三档注入路径、预算、路由、命令和 React 交互都有测试，CI 在每次推送时运行。


## 配置

```json
{ "maxPinChars": 16000, "maxResidentChars": 6000, "maxHighlightChars": 2000, "holdSubagents": false }
```

| 配置 | 默认 | 含义 |
|---|---|---|
| `maxPinChars` | 16000 | pin 类钉子原文合计字符数 |
| `maxResidentChars` | 6000 | resident 类钉子原文合计字符数 |
| `maxHighlightChars` | 2000 | highlight 类钉子原文合计字符数 |
| `holdSubagents` | `false` | 是否也对子代理会话生效（默认不生效，避免浪费 token） |

字符数按 UTF-16 单元计算。钉子的数量和单枚长度都不限，只受所属类别的总量限制。

## 限制

- 只能在单条消息内划选，不支持跨消息选区。
- 不支持流式输出中的消息、推理内容和工具输出。
- 钉子只属于当前会话，fork 出的会话不会继承。
- 每个 profile 只支持一个宿主进程写入。
- 这里的 highlight 指的是"模型输入中的强调级别"，不会在原消息上画出高亮。


## 开发

```sh
npm ci
npm run check   # 构建前端 + 全部测试 + loader 检查
npm run eval    # 受控夹具：验证三档路径的原文逐字节保留
```

## 许可

MIT
