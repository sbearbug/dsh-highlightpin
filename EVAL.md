# 验证与评测

## 当前结论

【真机验证】修改前的 0.1.4 基线已在隔离会话中完成 last → compact → 下一条消息，实际请求前 surface 包含逐字一致的被遮蔽原文补注，见 docs/PROBES.md 和 docs/m1-live-0.1.4.json。

【离线】0.2.2 的 npm run check 全绿，78 项测试通过，客户端 loader 工厂与 dock 注册通过。三档真实模型召回、主动提及率、dsh-bite 对照和提供方缓存测量尚未执行。

## L1 覆盖

```sh
npm run check
```

新增 version-1 旧记录读取、旧 strict 映射、level 回写及重开；profile strict 下限；三类字符预算拒绝、降级与并发/落盘失败；三档分段渲染、空段省略、字节稳定、新旧 notice 标题兼容；decide excludeIds 纯函数、同一步升降级快照和两条请求路径无快照保守补注；有限存储重试；level 路由围栏、命令及真实 React 三档按钮；过期 refresh 竞争回归与正确 SessionSnapshot 字段；主动提及率评分。

保留对齐、选择、KaTeX/代码、官方 Session/DomainFacility、retry、子代理、HTTP 413/503 等既有覆盖。官方运行时测试采用内存后端和受控 replacement；React 交互使用 jsdom，不能代表真机主题视觉。

## 受控输入保留

```sh
npm run eval
```

原始结果见 eval/deterministic-results.json。固定 8 条事实，其中 6 条钉住；受控摘要不保留原事实。

| 路径 | 原文字节完整保留 |
|---|---|
| pin 尾部 notice | 6/6 |
| resident 常驻段 | 6/6 |
| highlight 重点段 | 6/6 |
| 原消息/完整 notice 在场时额外补注 | 0 |
| notice 再被遮蔽后需补注 | 6 |

0.2.2 取消数量上限，三类原文各自受字符预算限制。受控夹具的 6 枚 highlight 已不受原 5 枚限制；预算准入与拒绝由 L1 另测，真实 L2 仍须记录所用字符预算。

本 fixture notice 为 533 UTF-16 单元 / 716 UTF-8 字节，resident 为 527 单元，highlight 为 553 单元。旧 notice/strict 字段保留用于历史脚本兼容。这些是格式成本，不是实测 tokens、模型召回或缓存指标。

## L2 待执行

协议见 eval/PROTOCOL.zh.md。新实验组：无插件 / pin / resident / highlight，dsh-bite 可选。独立新会话、至少三个种子、同模型/压缩设置；测量钉住/未钉事实逐字召回、主动提及率、真实注入 tokens 与 cache hit/miss。

```sh
node eval/score.mjs real-captures.json results.json
```

unprompted 探针单独计分，不进入 recall 分母；人工 mentionsFact 可记录转述，否则采用逐字包含。缺失遥测返回 null。重复 condition/seed/factId/probeType 拒绝。

| 条件 | 召回 | 主动提及率 | 注入 tokens | cache 命中 |
|---|---|---|---|---|
| 无插件 | 未测 | 未测 | 未测 | 未测 |
| pin | 未测 | 未测 | 未测 | 未测 |
| resident | 未测 | 未测 | 未测 | 未测 |
| highlight | 未测 | 未测 | 未测 | 未测 |
| dsh-bite（可选） | 未测 | 未测 | 未测 | 未测 |

不以受控数据填充真实模型表；bite 整轮与本插件子串的粒度差异需报告原文字符/字节量。
