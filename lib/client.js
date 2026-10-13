window.__ModuleLoader__.load({id:"dsh-highlightpin",factory:(require)=>{
var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  PinDock: () => PinDock,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);

// src/client/selection.js
var MESSAGE_SELECTOR = "[data-chat-node-key]";
var UI_SELECTOR = 'button, [role="button"], [data-code-block-banner], [data-line-number], .line-number, .hljs-ln-numbers, [data-variant="think"], [data-message-attachments], [aria-hidden="true"]';
var BLOCKS = /* @__PURE__ */ new Set(["P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE", "DIV", "UL", "OL", "TR"]);
var elementOf = (node) => node?.nodeType === 1 ? node : node?.parentElement;
function serialize(node) {
  if (node.nodeType === 3) return node.data;
  if (node.nodeType !== 1 && node.nodeType !== 11) return "";
  if (node.nodeType === 1) {
    if (node.matches(".katex-display, .katex")) {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (tex == null) throw new Error("\u516C\u5F0F\u7F3A\u5C11 TeX annotation\uFF0C\u65E0\u6CD5\u53EF\u9760\u4FDD\u5B58\u3002");
      const delimiter = node.matches(".katex-display") ? "$$" : "$";
      return delimiter + tex + delimiter;
    }
    if (node.matches(UI_SELECTOR)) return "";
    if (node.tagName === "BR") return "\n";
  }
  let text = "", previousBlock = false;
  for (const child of node.childNodes) {
    const value = serialize(child);
    if (!value) continue;
    const block = child.nodeType === 1 && (BLOCKS.has(child.tagName) || child.matches(".katex-display"));
    if ((block || previousBlock) && text && !text.endsWith("\n") && !value.startsWith("\n")) text += "\n";
    text += value;
    previousBlock = block;
  }
  return text;
}
function snapMath(range) {
  const snapped = range.cloneRange();
  const start = elementOf(range.startContainer)?.closest(".katex-display, .katex");
  const end = elementOf(range.endContainer)?.closest(".katex-display, .katex");
  const formula = (el) => el?.closest(".katex-display") ?? el;
  if (start) snapped.setStartBefore(formula(start));
  if (end) snapped.setEndAfter(formula(end));
  return snapped;
}
function captureSelection(selection, { sessionId, nodes }) {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return { empty: true };
  const original = selection.getRangeAt(0);
  const startEl = elementOf(original.startContainer), endEl = elementOf(original.endContainer);
  const root = startEl?.closest(MESSAGE_SELECTOR);
  if (!root || root !== endEl?.closest(MESSAGE_SELECTOR)) return { error: "\u8BF7\u5728\u540C\u4E00\u6761\u5DF2\u5B9A\u7A3F\u6D88\u606F\u5185\u5212\u9009\uFF0C\u4E0D\u80FD\u8DE8\u6D88\u606F\u3002" };
  const owner = root.closest("[data-conversation-session]");
  if (!owner || owner.getAttribute("data-conversation-session") !== sessionId) return { error: "\u9009\u533A\u4E0D\u5C5E\u4E8E\u5F53\u524D\u4F1A\u8BDD\uFF0C\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u91CD\u65B0\u5212\u9009\u3002" };
  const chrome = (el) => el.closest('button, [role="button"], [data-code-block-banner], [data-line-number], .line-number, .hljs-ln-numbers, [data-variant="think"], [data-message-attachments]');
  if (chrome(startEl) || chrome(endEl)) return { error: "\u8BF7\u9009\u62E9\u6D88\u606F\u6B63\u6587\uFF0C\u4E0D\u80FD\u9489\u4F4F\u64CD\u4F5C\u6309\u94AE\u6216\u63A8\u7406\u8282\u70B9\u3002" };
  const node = nodes.get(root.getAttribute("data-chat-node-key"));
  let messageId;
  if (["user", "steering"].includes(node?.kind) && node.data?.source?.kind === "user") messageId = node.data.messageId ?? node.id;
  if (node?.kind === "assistant-step" && node.data?.status !== "running" && node.data?.finalNode?.kind === "assistant") messageId = node.data.finalNode.messageId;
  if (!messageId || root.getAttribute("data-chat-group-part") === "reasoning") return { error: "\u4EC5\u652F\u6301\u5DF2\u5B9A\u7A3F\u7684\u7528\u6237\u548C\u52A9\u624B\u6B63\u6587\uFF1B\u6D41\u5F0F\u56DE\u590D\u3001\u5DE5\u5177\u8F93\u51FA\u6682\u4E0D\u652F\u6301\u3002" };
  try {
    const range = snapMath(original);
    const text = serialize(range.cloneContents());
    if (!text.trim()) return { empty: true };
    const beforeRange = root.ownerDocument.createRange();
    beforeRange.selectNodeContents(root);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const afterRange = root.ownerDocument.createRange();
    afterRange.selectNodeContents(root);
    afterRange.setStart(range.endContainer, range.endOffset);
    return { value: { sessionId, messageId, text, before: serialize(beforeRange.cloneContents()).slice(-64), after: serialize(afterRange.cloneContents()).slice(0, 64) } };
  } catch (error) {
    return { error: error.message };
  }
}

// src/client/material.js
function composerMaterial(dock) {
  const card = dock?.closest("[data-composer-seat]")?.querySelector("[data-composer-card]");
  if (!card) return {};
  const style = card.ownerDocument.defaultView.getComputedStyle(card);
  return {
    "--hlpin-material-bg": style.backgroundColor,
    "--hlpin-material-image": style.backgroundImage || "none",
    "--hlpin-material-shadow": style.boxShadow || "none",
    "--hlpin-material-border": `${style.borderTopWidth || "0px"} ${style.borderTopStyle || "none"} ${style.borderTopColor || "transparent"}`,
    "--hlpin-material-radius": style.borderRadius || "var(--dsw-radius-panel)",
    "--hlpin-material-blur": style.backdropFilter || style.webkitBackdropFilter || "none"
  };
}

// src/client/index.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var API = "/highlightpin/api";
var headers = { "content-type": "application/json" };
var CSS = `
.hlpin-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));max-width:var(--dsh-composer-card-max-width,840px);margin:0 auto;padding:0 12px 6px;color:var(--dsw-alias-label-primary);font-size:12px}
.hlpin-tools{display:flex;align-items:center;gap:10px;min-height:32px;min-width:0}
.hlpin-controls{display:inline-flex;align-items:center;gap:2px;flex:none;padding:2px 4px}
.hlpin-controls,.hlpin-panel{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);border:var(--hlpin-material-border,0);border-radius:var(--hlpin-material-radius,var(--dsw-radius-panel));background-color:var(--hlpin-material-bg,var(--dsw-specific-input-major));background-image:var(--hlpin-material-image,none);box-shadow:var(--hlpin-material-shadow,var(--dsw-elevation-soft));backdrop-filter:var(--hlpin-material-blur,none);-webkit-backdrop-filter:var(--hlpin-material-blur,none)}
.hlpin-feedback{min-width:0;margin:0;color:var(--dsw-alias-label-secondary);line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hlpin-dock button{font:inherit;color:inherit;cursor:pointer;box-sizing:border-box}
.hlpin-icon{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;padding:4px 6px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary)!important}
.hlpin-icon:hover{background:var(--dsw-alias-interactive-bg-hover)}
.hlpin-icon[data-ready=true]{color:var(--dsw-alias-label-primary)!important;background:var(--dsw-alias-interactive-bg-hover)}
.hlpin-dock button:disabled{opacity:.45;cursor:default}
.hlpin-dock button:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.hlpin-count{font-size:11px;font-variant-numeric:tabular-nums;min-width:10px}
.hlpin-arrow svg{transition:transform .15s}.hlpin-arrow[aria-expanded=true] svg{transform:rotate(180deg)}
.hlpin-panel{margin:8px 0 2px;padding:12px}
.hlpin-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.hlpin-panel-actions{display:flex;gap:2px}
.hlpin-panel-title{font-weight:600}.hlpin-modes{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.hlpin-mode,.hlpin-remove{border:1px solid var(--dsw-alias-border-l3);border-radius:7px;padding:5px 8px;background:transparent}
.hlpin-mode[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-secondary)}
.hlpin-muted{color:var(--dsw-alias-label-secondary);line-height:1.6}.hlpin-list{display:flex;flex-direction:column;gap:10px;max-height:260px;overflow:auto;margin-top:10px}
.hlpin-item{display:flex;gap:8px;align-items:flex-start;border-top:1px solid var(--dsw-alias-border-l3);padding-top:10px}.hlpin-item>div{flex:1;min-width:0}
.hlpin-item pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;max-height:160px;overflow:auto;font:inherit;line-height:1.6}
.hlpin-hint{margin-top:8px;white-space:pre-wrap;line-height:1.6}.hlpin-live{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.hlpin-arrow svg{transition:none}}
`;
async function request(path, body) {
  const response = await fetch(API + path, body === void 0 ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message ?? result.code ?? `HTTP ${response.status}`);
  return result;
}
function PinIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m16 3 5 5-4 2-3 5-2 1-4-4 1-2 5-3zM8 16l-5 5M6 10l8 8" }) });
}
var fidelityLabel = { "source-exact": "\u6E90\u6587\u672C\u7CBE\u786E", "source-normalized": "\u5DF2\u5BF9\u9F50\u6E90\u6587\u672C", rendered: "\u663E\u793A\u6587\u672C" };
function PinDock({ session, sessionId: explicitId, useChat }) {
  const sessionId = explicitId ?? session?.sessionId;
  const nodes = useChat((state) => state.nodes);
  const panelId = (0, import_react.useId)();
  const dockRef = (0, import_react.useRef)(null);
  const pinPress = (0, import_react.useRef)(false);
  const [material, setMaterial] = (0, import_react.useState)({});
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [selection, setSelection] = (0, import_react.useState)(null);
  const [pins, setPins] = (0, import_react.useState)([]);
  const [usage, setUsage] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)(null);
  const [hint, setHint] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const currentSession = (0, import_react.useRef)(sessionId);
  const pending = (0, import_react.useRef)(false);
  const refreshId = (0, import_react.useRef)(0);
  currentSession.current = sessionId;
  (0, import_react.useEffect)(() => {
    const dock = dockRef.current;
    const update = () => {
      const next = composerMaterial(dock);
      setMaterial((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update();
    const observer = new window.MutationObserver(update);
    for (const target of [document.documentElement, document.body]) observer.observe(target, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    const seat = dock?.closest("[data-composer-seat]");
    if (seat) observer.observe(seat, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", update);
    };
  }, [sessionId]);
  const refresh = (0, import_react.useCallback)(async () => {
    const id = ++refreshId.current;
    try {
      const result = await request(`/pins?session=${encodeURIComponent(sessionId)}`);
      if (currentSession.current !== sessionId || id !== refreshId.current) return;
      setPins(result.pins);
      setUsage(result.usage);
      setStatus(result.status);
    } catch (error) {
      if (currentSession.current === sessionId && id === refreshId.current) throw error;
    }
  }, [sessionId]);
  (0, import_react.useEffect)(() => {
    setExpanded(false);
    setSelection(null);
    setPins([]);
    setUsage(null);
    setStatus(null);
    setHint("");
    refresh().catch((error) => {
      if (currentSession.current === sessionId) setHint(error.message);
    });
    return () => {
      refreshId.current++;
    };
  }, [sessionId, refresh]);
  (0, import_react.useEffect)(() => {
    let releaseTimer;
    const finishPress = () => {
      pinPress.current = false;
      if (window.getSelection()?.isCollapsed) setSelection(null);
    };
    const releasePress = () => {
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(finishPress, 0);
    };
    const onChange = () => {
      const result = captureSelection(window.getSelection(), { sessionId, nodes });
      if (result.value) {
        setSelection(result.value);
        setHint("");
      } else if (result.error) {
        pinPress.current = false;
        setSelection(null);
        setHint(result.error);
      } else if (!pinPress.current) setSelection(null);
    };
    document.addEventListener("selectionchange", onChange);
    document.addEventListener("pointerup", releasePress);
    document.addEventListener("mouseup", releasePress);
    document.addEventListener("pointercancel", finishPress);
    document.addEventListener("keydown", finishPress);
    window.addEventListener("blur", finishPress);
    return () => {
      window.clearTimeout(releaseTimer);
      pinPress.current = false;
      document.removeEventListener("selectionchange", onChange);
      document.removeEventListener("pointerup", releasePress);
      document.removeEventListener("mouseup", releasePress);
      document.removeEventListener("pointercancel", finishPress);
      document.removeEventListener("keydown", finishPress);
      window.removeEventListener("blur", finishPress);
    };
  }, [sessionId, nodes]);
  const mutate = async (path, body) => {
    if (pending.current) return;
    pending.current = true;
    refreshId.current++;
    setBusy(true);
    try {
      const result = await request(path, body);
      if (currentSession.current !== sessionId) return;
      if (path === "/level") {
        setHint(`\u5DF2\u8BBE\u7F6E\u4E3A ${result.pin.level}\u3002${result.pin.level !== "pin" ? "\u4F1A\u8FDB\u5165\u7CFB\u7EDF\u63D0\u793A\u8BCD\uFF0C\u5207\u6362\u65F6\u524D\u7F00\u7F13\u5B58\u4F1A\u5931\u6548\u4E00\u6B21\u3002" : ""}`);
      } else {
        setHint(result.warning ?? (result.already ? "\u8FD9\u6BB5\u5DF2\u7ECF\u9489\u8FC7\u4E86\u3002" : path === "/pin" ? `\u5DF2\u9489\u4F4F ${result.pin.text.length} \u5B57\u7B26\u3002` : "\u5DF2\u89E3\u9489\u3002"));
        if (path === "/pin") setSelection(null);
      }
      await refresh();
    } catch (error) {
      if (currentSession.current === sessionId) setHint(error.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const pinReady = Boolean(selection && selection.sessionId === sessionId);
  const pinTitle = pinReady ? `\u9489\u4F4F\u9009\u533A\uFF08${selection.text.length} \u5B57\u7B26\uFF09\uFF1A${selection.text}` : hint || "\u5728\u540C\u4E00\u6761\u5DF2\u5B9A\u7A3F\u6D88\u606F\u4E2D\u5212\u9009\u6B63\u6587\u540E\u9489\u4F4F";
  const toggleDetails = () => {
    if (!expanded) refresh().catch((error) => setHint(error.message));
    setExpanded((value) => !value);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-dock", ref: dockRef, style: material, onKeyDown: (event) => {
    if (event.key === "Escape" && expanded) {
      setExpanded(false);
      event.stopPropagation();
    }
  }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-tools", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-controls", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "hlpin-icon", type: "button", "aria-label": "\u9489\u4F4F\u9009\u533A", "data-ready": pinReady, disabled: busy || !pinReady, onPointerDown: () => {
          pinPress.current = true;
        }, onMouseDown: (e) => {
          pinPress.current = true;
          e.preventDefault();
        }, onClick: () => {
          pinPress.current = false;
          mutate("/pin", selection);
        }, title: pinTitle, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PinIcon, {}),
          pins.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hlpin-count", children: pins.length })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hlpin-icon hlpin-arrow", type: "button", "aria-label": expanded ? "\u6536\u8D77\u9489\u5B50\u8BE6\u60C5" : "\u5C55\u5F00\u9489\u5B50\u8BE6\u60C5", "aria-expanded": expanded, "aria-controls": panelId, onMouseDown: (e) => e.preventDefault(), onClick: toggleDetails, title: `\u9489\u5B50\u8BE6\u60C5\u4E0E\u7EA7\u522B\u8BBE\u7F6E${hint ? ` \xB7 ${hint}` : ""}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4 6 4 4 4-4" }) }) })
      ] }),
      !expanded && hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hlpin-feedback", title: hint, children: hint })
    ] }),
    expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "hlpin-panel", id: panelId, "aria-label": "\u9489\u5B50\u8BE6\u60C5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-panel-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hlpin-panel-title", children: "\u5F53\u524D\u4F1A\u8BDD\u7684\u9489\u5B50" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-panel-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hlpin-icon", type: "button", disabled: busy, onClick: () => refresh().catch((error) => setHint(error.message)), "aria-label": "\u5237\u65B0\u9489\u5B50", title: "\u5237\u65B0\u9489\u5B50", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "15", height: "15", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 7a6 6 0 1 0 .1 6M16 3v4h-4" }) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hlpin-icon", type: "button", onClick: () => setExpanded(false), "aria-label": "\u5173\u95ED\u9489\u5B50\u8BE6\u60C5", title: "\u5173\u95ED", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4 4 8 8M12 4l-8 8" }) }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hlpin-muted", children: "pin \u6309\u9700\u8865\u56DE \xB7 resident \u4E2D\u6027\u5E38\u9A7B \xB7 highlight \u91CD\u70B9\u5E38\u9A7B\u3002\u6BCF\u679A\u9489\u5B50\u72EC\u7ACB\u9009\u62E9\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-muted", children: [
        usage ? `${usage.count} \u679A \xB7 pin ${usage.pinChars ?? 0}/${usage.limits.maxPinChars ?? 16e3} \u5B57\u7B26 \xB7 resident ${usage.residentChars ?? 0}/${usage.limits.maxResidentChars ?? 6e3} \u5B57\u7B26 \xB7 highlight ${usage.highlightChars ?? 0}/${usage.limits.maxHighlightChars ?? 2e3} \u5B57\u7B26` : "\u52A0\u8F7D\u9489\u5B50\u2026",
        status?.compacted ? ` \xB7 \u4E0A\u6B21\u538B\u7F29\u540E\u5DF2\u8865\u6CE8 ${status.recalled} \u679A` : ""
      ] }),
      pins.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hlpin-list", children: pins.map((pin, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "hlpin-item", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            i + 1,
            ". ",
            pin.level ?? "pin",
            " \xB7 ",
            pin.role === "assistant" ? "\u52A9\u624B" : "\u7528\u6237",
            " \xB7 ",
            fidelityLabel[pin.fidelity],
            " \xB7 ",
            pin.text.length,
            " \u5B57\u7B26"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: pin.text }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hlpin-modes", role: "group", "aria-label": `\u9489\u5B50 ${i + 1} \u7684\u7EA7\u522B`, children: [["pin", "\u6309\u9700\u8865\u56DE"], ["resident", "\u4E2D\u6027\u5E38\u9A7B"], ["highlight", "\u91CD\u70B9\u5E38\u9A7B"]].map(([level, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "hlpin-mode", type: "button", "aria-pressed": (pin.level ?? "pin") === level, disabled: busy, onClick: () => mutate("/level", { sessionId, pinId: pin.id, level }), children: [
            level,
            " \xB7 ",
            label
          ] }, level)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "hlpin-remove", type: "button", disabled: busy, onClick: () => mutate("/unpin", { sessionId, pinId: pin.id }), children: "\u89E3\u9489" })
      ] }, pin.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hlpin-muted", children: "\u8FD8\u6CA1\u6709\u9489\u5B50\u3002\u5212\u9009\u6B63\u6587\u540E\uFF0C\u70B9\u51FB\u4E0A\u65B9\u7684\u56FE\u9489\u6309\u94AE\u3002" }),
      hint && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "hlpin-hint", children: hint })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "hlpin-live", role: "status", children: hint })
  ] });
}
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "highlightpin", order: 100, label: "\u5212\u9009\u5B9A\u9489" }, PinDock));
}

return module.exports;
}});
