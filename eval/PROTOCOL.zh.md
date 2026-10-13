# L2 真机评测协议

## 前提

先完成 docs/PROBES.md 的安装与选区验收。不要在个人历史会话上实验，四个条件分别使用新建评测会话和相同模型参数。测试配置由 DSH 的插件管理机制设置，不手改 profile 安装清单。记录 DSH/插件版本、模型 id、压缩设置与每次压缩遮蔽范围。

## 事实与过程

1. 建立固定事实集，包含数字、约束、中文、源代码、行内及独立 TeX；为每条分配 factId、expected 原文和 pinned 布尔值。
2. 多个固定随机种子改变事实在长对话中的位置，背景填充保持相同。钉住的事实数量、每枚长度和总长度满足 highlightpin 预算。
3. 实验组为无插件 / pin / resident / highlight，dsh-bite 可选。无插件条件不钉住；bite 条件通过整轮 pin 钉同一事实所在回合；pin/resident/highlight 条件通过选区钉对应子串，并用 /hlpin level 设置对应级别。记下整轮与子串的额外内容量，不能将粒度差异藏起来。
4. 在每个条件触发同样的 `/compact`，并另外测试自动压力压缩与溢出恢复。保存输入请求中事实是否仍完整出现的证据。
5. 在独立分支或重建的同种子会话里逐条询问事实原文，避免第一条答案重新把事实带进后续题的上下文。要求输出对应事实的原文，不让多个问答相互污染。
6. 至少 3 个种子；每组对每条事实只记录一次对应测量。保留 raw answer，不做归一化。
7. 对实际 fact-query 请求记录 usage.prompt_cache_hit_tokens、prompt_cache_miss_tokens。每条问答计量一次；不要把同一请求的 usage 重复摊给多条事实。
8. 注入 tokens 需使用模型 tokenizer 或提供方的真实计量；不可用时省略该字段，不能把字符数/2 填成 measured tokens。只计 highlightpin/bite 原文注记或 resident/highlight section 的增量，并说明格式开销。

缓存比较应分别记录「钉子不变的后续请求」与「增加/删除钉子后的下一请求」。原始数据中可以保留额外字段进行分组分析；基础 scorer 只按 condition 聚合，不擅自解释因果。

## 主动提及率

除了逐字召回，增加独立的 unprompted 探针：用户本轮不提某条钉子、不要求复述事实，询问中性的其他问题，保存提示词与原始回答。每个条件、种子、事实记录一次，分母为合格探针数，分子为回答主动引用该事实的次数。与召回探针使用独立分支，避免事实询问本身提高提及倾向；所有组保持提示、上下文与事实一致。

字段设 `probeType: "unprompted"`、`promptMentionsFact: false`。默认按原文包含关系计数；若衡量转述，人工标注 `mentionsFact: true/false`，记录判定规则与复核结果，各组使用相同规则。召回探针仍按逐字原文计分，不能混用两个指标。主动提及率衡量强调可能带来的过度引用，并不代表正确率。

## 采集格式

以下是字段示意，answer 必须替换为真实输出，不能把本示例当评测结果。

```json
{
  "facts": [
    {"id":"fact_1","expected":"实验温度为 25.0°C。","pinned":true},
    {"id":"fact_2","expected":"编号 9821。","pinned":false}
  ],
  "runs": [
    {
      "condition":"pin",
      "seed":"seed-1",
      "factId":"fact_1",
      "probeType":"recall",
      "answer":"这里填真实模型输出",
      "modelInputText":"这里可保留最终请求的原文输入以供审计"
    }
  ]
}
```

condition 取 none/pin/resident/highlight，bite 可选。仅在确有数据时加上 usage 和 injectedTokens。重复 condition/seed/factId/probeType 会报错。expected 原文出现在 raw answer 中即命中；附带解释不会让正确原文失分，但每个事实只允许一种固定原文。无钉事实使用完全相同评分方式。

unprompted 样本示意（必须替换为真实记录）：

```json
{"condition":"highlight","seed":"seed-1","factId":"fact_1","probeType":"unprompted","promptMentionsFact":false,"prompt":"请给这篇无关短文起个标题。","answer":"真实回答","mentionsFact":false}
```

## 报告

生成 results.json，将各组 pinned/unpinned hits/total 及比率、activeMention 的 mentions/total 和 activeMentionRate 填入 EVAL.md。报告测量样本数、未完成样本、缺失遥测和 bite 粒度差异。另核对输入原文完整存在而模型仍答错的样本，以区分输入保留与回答能力。不要根据单次命中声称缓存收益。
