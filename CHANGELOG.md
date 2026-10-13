# Changelog

## 0.1.1

**English** — Removed the session-level mode and the `POST /highlightpin/api/mode` route: injection
behaviour is now expressed entirely by each pin's own `level`. Removed the `mode` configuration key
(including the `notice`/`strict` values and the "strict floors everything to resident" rule). Domain
records no longer carry a `mode` field; a leftover value in an existing record is stripped by the
schema on read.

**中文** — 移除会话级模式与 `POST /highlightpin/api/mode` 路由：注入行为完全由每枚钉子自己的 `level` 表达。
移除 `mode` 配置项（含 `notice`/`strict` 两个取值与"strict 至少按 resident 处理"的逻辑）。
domain 记录不再带 `mode` 字段；既有记录里的残留值在读取时由 schema 剥离。

## 0.1.0

**English** — First public release: three-level source-text pins (recall / resident / highlighted)
with per-level character pools, source-faithful alignment, compaction recall, slash commands, and a
fenced HTTP API.

**中文** — 首个公开发布版本：三档源文本钉子（按需补回 / 中性常驻 / 重点常驻），级别独立字符预算，
源文本保真对齐，压缩后补回，斜杠命令，以及带信任围栏的 HTTP 接口。
