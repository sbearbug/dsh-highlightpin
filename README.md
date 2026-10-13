# highlightpin

[![Check](https://github.com/sbearbug/dsh-highlightpin/actions/workflows/check.yml/badge.svg)](https://github.com/sbearbug/dsh-highlightpin/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Pin any selected passage; compaction cannot take it away.**

[中文](README.zh.md) · [Design](DESIGN.md) · [Evaluation](EVAL.md) · [Live evidence](docs/PROBES.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin. Select any stretch of text in a conversation — a constraint, a number, a formula, a piece of code — and pin it with one click. From then on, no matter how the context is compacted, what the model receives is that **source text**, not a summary.

## Three levels

Each pin carries its own level:

| Level | Behaviour | Good for | Cost |
|---|---|---|---|
| **pin** (default) | Does nothing while the text is still in context; once compaction drops it, the extract text is re-inserted verbatim near the tail before the next request | Most pins | Never touches the system prompt, so it does not break the prefix cache on its own |
| **resident** | Lives in the system prompt with neutral wording: "consult it when relevant; no need to bring it up" | Important background: you want the model to match on it the moment it matters, without you mentioning it every turn | Costs one prefix-cache invalidation when you switch levels |
| **highlight** | Lives in the system prompt with emphatic wording: "follow it when relevant; if it conflicts with your latest explicit instruction, the latest instruction wins" | Constraints and priorities the model must keep honouring | Same as above; emphasis also raises how often the model brings it up on its own |

`resident` and `highlight` are deliberately two separate levels. "The model can always find it" and "the model always keeps it in mind" are different things, and emphasis has side effects of its own — so the choice is yours.

## Installation

From npm (published releases):

```sh
dsh plugin --profile desktop add dsh-highlightpin@0.1.1
```

Or straight from the GitHub source:

```sh
dsh plugin --profile desktop add 'https://codeload.github.com/sbearbug/dsh-highlightpin/tar.gz/v0.1.1'
```

On the web profile, replace `desktop` with `web`. After installing or upgrading, **fully quit and restart DSH**, then refresh the page, so that host and client both load the new version. Existing pins survive.

### Compatible DSH versions

`peerDependencies` declares `>=0.1.7-rc.1 <0.3.0-0`. The DSH plugin manager checks these peers with `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` and blocks installation and activation on a mismatch.

| DSH version | Status |
|---|---|
| 0.2.0-rc.2 | **Verified live** — development and real-machine checks both ran on this version |
| 0.1.7-rc.1 / 0.1.7-rc.2 | **Offline suite passes**; CI re-runs the same suite against this line on every push |
| Other 0.2.x | Inferred from the APIs used, not verified individually |
| ≤ 0.1.6 | **Unsupported**: `CommandDefinitionId` does not exist at 0.1.5 and below, and the 0.1.6 line's session-event validation already differs |
| ≥ 0.3.0 | Not claimed |

## Usage

1. Select text inside **one** finished user or assistant message.
2. Click the pin above the composer.
3. Click the arrow beside it to open the details panel: switch each pin between "recall / resident / highlight", check budget usage, or unpin.

When you select inside a formula, the selection is expanded to the whole formula and what gets stored is the TeX source. Select the rendered $\nabla_\theta J(\theta)$ and the plugin stores `$\nabla_\theta J(\theta)$` — not the glyphs on screen. Selections inside code keep their indentation and line breaks.

Everything is also available from the command line:

| Command | Effect |
|---|---|
| `/hlpin list` | List every pin, its level and budget usage |
| `/hlpin last` | Pin the most recent assistant reply in full |
| `/hlpin show <n>` | Show one pin's full text |
| `/hlpin drop <n>` | Unpin |
| `/hlpin level <n> pin\|resident\|highlight` | Change a pin's level |

## Design notes

- **What is stored is source text, not screen text.** The client serialises the selection first (formulas back to TeX, copy buttons and line numbers stripped out), and the host then locates the matching source substring in the session log. Alignment reports one of three fidelities: `source-exact` (a clean hit), `source-normalized` (matched after whitespace and Markdown normalisation, but still storing a source slice), or `rendered` (no match — it stores the display text and **tells you so**).
- **`pin` only re-inserts after the original is gone.** Right after pinning, the text is already in context, so re-injecting it would be pointless. It comes back only once compaction has shadowed it — and at that moment the prefix cache was already invalidated. So the default level cannot break caching by construction.
- **The decision is a pure function that keeps no ledger.** Every step re-decides from "is this text still in context", and records nothing like "already re-inserted". A rejected step, a plugin restart, or the recall notice itself being compacted later therefore cannot lose a pin.
- **The resident section and the recall notice never duplicate each other.** Each step records which pins actually went into the system prompt for that step, and the recall path excludes them. With no such record it re-inserts as usual: better to duplicate than to lose.
- **Over budget means rejection, not truncation.** `pin`, `resident` and `highlight` each have their own character pool. Adding or promoting past a pool's budget is rejected outright with an error code; demotion is always allowed. The plugin never quietly truncates, evicts, or demotes a pin.
- **The session log format is left alone.** Pins live in the official `storageDomain`, and recall uses a message type the host already has, so a session can never become unloadable from an unknown event. The HTTP API is origin-checked and accepts JSON only from the local page.

The full set of trade-offs is in [DESIGN.md](DESIGN.md).

## Verification status

- **Live**: "pin → `/compact` → next message" has been run end-to-end in DSH. The shadowed source text appeared in the next request's input, byte-identical to what was stored, with a matching SHA-256. Evidence: [docs/PROBES.md](docs/PROBES.md) and [docs/m1-live-0.1.4.json](docs/m1-live-0.1.4.json).
- **Offline**: alignment, selection serialisation, the decision function, all three injection paths, budgets, routes, commands and React interaction are covered by tests, run by CI on every push.


## Configuration

```json
{ "maxPinChars": 16000, "maxResidentChars": 6000, "maxHighlightChars": 2000, "holdSubagents": false }
```

| Setting | Default | Meaning |
|---|---|---|
| `maxPinChars` | 16000 | Total source characters across `pin` pins |
| `maxResidentChars` | 6000 | Total source characters across `resident` pins |
| `maxHighlightChars` | 2000 | Total source characters across `highlight` pins |
| `holdSubagents` | `false` | Whether subagent sessions are covered too (off by default, to avoid wasting tokens) |

Characters are counted in UTF-16 units. Neither the number of pins nor the length of a single pin is capped; only the total per level is.

## Limitations

- Selections must stay within a single message; cross-message selections are not supported.
- Streaming messages, reasoning content and tool output are not supported.
- Pins belong to one session; forked sessions do not inherit them.
- One writer host per profile is supported.
- "Highlight" here is an emphasis level in the model input; it does not draw a visual highlight on the original message.


## Development

```sh
npm ci
npm run check   # build the client + run all tests + loader check
npm run eval    # controlled fixture: byte-exact preservation through all three levels
```

## License

MIT
