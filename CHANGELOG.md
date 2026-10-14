# Changelog

## 0.1.2

**English** — Fixed the `peerDependencies` ranges for the official `@deepseek-ai/dsh-*` packages. They now carry an explicit prerelease branch, `>=0.1.7-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0`, instead of a single `>=0.1.7-rc.1 <0.3.0-0`. Under ordinary semver semantics a plain range does not match the `0.2.0-rc.*` builds, because node-semver admits a prerelease only when some comparator in the range shares its exact `major.minor.patch` tuple and itself carries a prerelease tag. The DSH compatibility gate was never affected — it evaluates with `includePrerelease: true` — and no plugin behaviour changed.

**中文** — 修正官方 `@deepseek-ai/dsh-*` 的 `peerDependencies` 范围：由 `>=0.1.7-rc.1 <0.3.0-0` 改为带显式预发布分支的 `>=0.1.7-rc.1 <0.2.0-0 || >=0.2.0-rc.1 <0.3.0-0`。在普通 semver 语义下，原先的范围匹配不到 `0.2.0-rc.*`——node-semver 只有在范围里存在同 `major.minor.patch` 元组、且自身带预发布标签的比较符时才会放行预发布版本。DSH 的兼容门禁不受影响（它以 `includePrerelease: true` 求值），插件行为没有任何变化。

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
