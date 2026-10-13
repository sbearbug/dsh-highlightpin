# dsh-highlightpin 0.1.0

Pin source text in DeepSeek Harness, with an independent level for each pin.

[中文](README.zh.md) · [Design](DESIGN.md) · [Evaluation](EVAL.md) · [Live evidence](docs/PROBES.md)

> **0.1.0 is the first public release.** Revision numbers that appear in `DESIGN.md`, `EVAL.md` and `docs/` (0.1.0–0.2.2) are dated development records from before the public release, kept as written.

## Installation

```sh
# From GitHub
dsh plugin --profile desktop add 'https://codeload.github.com/sbearbug/dsh-highlightpin/tar.gz/v0.1.0'

# From a local checkout
npm ci && npm run check && npm pack
dsh plugin --profile desktop add /absolute/path/to/dsh-highlightpin-0.1.0.tgz
```

Installing the source directory itself is also supported. Fully quit and restart DSH after upgrading, then refresh the page so host and client both reload. Existing pins survive. `npm run build` rebuilds the client.

## Usage

Select text in one finalized user/assistant message and click the pin icon above the composer. The adjacent chevron opens details, where **each pin** has three buttons. Close with the chevron, close button, or Escape. Controls and details follow the current composer's material.

| Level | Behavior |
|---|---|
| `pin` (default) | Restore missing original text through a tail notice; do nothing while the original or complete notice is present |
| `resident` | Keep verbatim text in a neutral system section; refer to it when relevant without proactively mentioning it |
| `highlight` | Keep verbatim text in an emphasized system section; prioritize it when relevant, with latest explicit user requests taking precedence |

Resident and highlight have separate headings. Changing a resident system section changes the prefix and can invalidate cache reuse on that transition; real provider cache behavior has not been measured. An in-flight step retains its assembled snapshot and the next step adopts new levels.

| Command | Action |
|---|---|
| `/hlpin list` | List levels and budget usage |
| `/hlpin last` | Pin the latest assistant text, default pin |
| `/hlpin show 1` | Show original text |
| `/hlpin drop 1` | Remove pin |
| `/hlpin level 1 pin` | Restore only when missing |
| `/hlpin level 1 resident` | Neutral system background |
| `/hlpin level 1 highlight` | Emphasized system background |

Source alignment reports source-exact, source-normalized, or an explicit rendered fallback. KaTeX selections snap to formula boundaries and preserve TeX annotations; code selections preserve whitespace. Multi-part last joins text parts with newlines and reports rendered fidelity. Cross-message, streaming, reasoning, tool and global pins are unsupported. Highlight is an injection level, not visual highlighting of original messages.

## Configuration and compatibility

```json
{"mode":"notice","maxPinChars":16000,"maxResidentChars":6000,"maxHighlightChars":2000,"holdSubagents":false}
```

Limits count UTF-16 units and must be positive safe integers. pinChars, residentChars and highlightChars are independent pools: resident no longer includes highlight. There are no pin-count, individual-pin or combined-session caps. Adding or promoting checks only the target effective type, returning pin-budget-exceeded, resident-budget-exceeded or highlight-budget-exceeded. No truncation, eviction or automatic demotion occurs.

Demotions remain always allowed, including when they exceed the destination pool. Legacy or demoted data can therefore exceed a limit; further additions/promotions into that pool are rejected while other pools remain independent. Profile strict counts stored pin records against their effective resident type.

The development revision 0.2.2 — already included in the first public release 0.1.0 — ignores removed maxPins, maxHighlightPins and maxTotalChars settings. maxPinChars now means the pin-type total rather than an individual-pin cap; its default increases from 4000 to 16000. An explicitly configured old value remains effective with the new meaning. Existing pins need no migration.

Storage domain highlightpin remains version 1. Missing level means pin, except missing levels in legacy strict sessions become resident. Explicit levels override legacy session mode. Configuration mode is retained for compatibility/evaluation: profile strict floors all effective levels to resident, including an explicitly stored pin, while preserving highlight. No session mode switch appears in the new UI.

Writes are serialized and confirmed durable before success. One writer host per profile is supported; pins do not automatically follow forks. Unpinning does not erase historical notices. Domain opening retries up to three times (100/200 ms delays); persistent failure needs a plugin reload or host restart.

Routes under /highlightpin/api: GET pins?session=... and health; POST pin, unpin and level. The level body is {sessionId,pinId,level}; pins returns effective levels and budget usage. All routes, including GET, require JSON Content-Type and Host, Origin/port and Fetch Metadata checks; bodies are limited to 64 KiB.

POST mode remains **only for old clients**: strict sets existing non-highlight pins to resident after budget checks; notice sets existing pins to pin. Profile strict still floors effective levels. Refresh after command/other-window edits; stale refresh responses cannot overwrite newer state.

## Verification

```sh
npm run check
npm run eval
node eval/score.mjs real-captures.json results.json
```

Before any 0.2.0 code changes, live 0.1.4 passed last → compact → next-message verification: the shadowed source was restored byte-for-byte in the real input surface. See PROBES for evidence and caveats. Three-level paths, persistence, snapshot consistency, retry exclusion, budgets, routes, commands and React interactions are tested offline. Controlled fixtures do not measure model recall. Live comparisons of none / pin / resident / highlight, proactive mention rates, and cache usage remain pending.

Thanks to the public MIT dsh-bite implementation for its offline-test ideas. This implementation is independent; no dsh-anchor code was read or copied. Publishing remains pending.

MIT License.
