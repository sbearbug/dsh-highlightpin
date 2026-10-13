# 当前状态的真机证据边界

记录日期：2026-10-13。以下图片来自用户在本聊天中上传的 DSH 截图，不是本轮代理重新运行的真机验收。

- E1：`status-evidence/01-initial-dock.png` 显示早期宽版 dock、1 枚钉子、12 字符预算与会话底部“缓存命中 99%”。它只证明 UI 已显示；99% 为会话界面统计，无法归因于本插件、某次钉住或 strict。
- E2：`status-evidence/02-mode-disabled.png` 显示详情面板、1 枚助手钉子、“已对齐源文本”、29 字符和“已钉住 29 字符”，两个模式按钮灰色。源码 label 映射表明“已对齐源文本”对应 source-normalized，但没有最终模型请求、持久化文件或 DOM 控制台采样。
- E3：`status-evidence/03-compact-feedback.png` 显示图钉、数量 2、详情箭头及下方“已钉住 8 字符”。证明紧凑按钮区域在某版本真实页面出现，不能确认用户已装入 0.1.4，也不能证明材质跟随的最终效果。
- E4：用户在本聊天报告“展开之后就没法关上”；没有附带事件日志。异步失败重新展开在离线 React 测试中被复现；用户真机的具体触发路径未被采样确认。

尚无证据：当前进程 plugin health/version；严格模式成功切换；公式 annotation 控制台采样；顶部/底部正文节点计数；压缩前后原始模型请求；系统提示词逐字比对；重启后的磁盘恢复；各条件 prompt_cache_hit_tokens/prompt_cache_miss_tokens。
