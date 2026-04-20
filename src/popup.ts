import "./styles/base.css";
import "./styles/popup.css";

import type { RuntimeRequest } from "./lib/messages";
import type { NavigationMode, PopupContext, RuleMode } from "./lib/types";
import { buildPermissionPatterns, isSupportedPageUrl } from "./lib/url";

interface PopupUiState {
  isSiteOverrideEnabled: boolean;
  isPageOverrideEnabled: boolean;
  siteSelection: NavigationMode;
  pageSelection: NavigationMode;
}

const statusCard = document.querySelector<HTMLElement>("#status-card");
const statusText = document.querySelector<HTMLParagraphElement>("#status-text");
const hostValue = document.querySelector<HTMLElement>("#host-value");
const pageValue = document.querySelector<HTMLElement>("#page-value");
const effectiveValue = document.querySelector<HTMLElement>("#effective-value");
const sourceValue = document.querySelector<HTMLElement>("#source-value");
const statusChip = document.querySelector<HTMLElement>("#status-chip");
const permissionCard = document.querySelector<HTMLElement>("#permission-card");
const grantAccessButton = document.querySelector<HTMLButtonElement>("#grant-access");
const openOptionsButton = document.querySelector<HTMLButtonElement>("#open-options");
const siteSection = document.querySelector<HTMLElement>("#site-section");
const advancedSection = document.querySelector<HTMLElement>("#advanced-section");
const siteOverrideToggle = document.querySelector<HTMLButtonElement>("#site-override-toggle");
const pageOverrideToggle = document.querySelector<HTMLButtonElement>("#page-override-toggle");
const siteModeGroup = document.querySelector<HTMLElement>("#site-mode-group");
const pageModeGroup = document.querySelector<HTMLElement>("#page-mode-group");
const globalModeGroup = document.querySelector<HTMLElement>("#global-mode-group");
const siteHelperText = document.querySelector<HTMLElement>("#site-helper-text");
const pageHelperText = document.querySelector<HTMLElement>("#page-helper-text");

let activeTabId: number | undefined;
let currentContext: PopupContext | null = null;
let permissionGranted = false;
let currentUiState: PopupUiState | null = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  void initializePopup();
});

async function initializePopup(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id;

  if (!tab?.url || !isSupportedPageUrl(tab.url)) {
    renderUnsupported();
    return;
  }

  permissionGranted = await chrome.permissions.contains({
    origins: buildPermissionPatterns(new URL(tab.url).hostname),
  });

  currentContext = (await chrome.runtime.sendMessage({
    type: "plm:get-popup-context",
    url: tab.url,
  } as RuntimeRequest)) as PopupContext;

  currentUiState = derivePopupUiState(currentContext);
  renderContext(currentContext, currentUiState);
}

function bindEvents(): void {
  grantAccessButton?.addEventListener("click", () => {
    void requestSitePermission();
  });
  openOptionsButton?.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
  siteOverrideToggle?.addEventListener("click", () => {
    void handleSiteOverrideToggle();
  });
  pageOverrideToggle?.addEventListener("click", () => {
    void handlePageOverrideToggle();
  });

  bindSegmentedGroup(globalModeGroup, (mode) => setGlobalMode(mode));
  bindSegmentedGroup(siteModeGroup, (mode) => setSiteExplicitMode(mode));
  bindSegmentedGroup(pageModeGroup, (mode) => setPageExplicitMode(mode));
}

function bindSegmentedGroup(
  group: HTMLElement | null,
  handler: (mode: NavigationMode) => void,
): void {
  group?.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode === "same-tab" || mode === "new-tab") {
        void handler(mode);
      }
    });
  });
}

function derivePopupUiState(context: PopupContext): PopupUiState {
  return {
    isSiteOverrideEnabled: context.siteMode !== "inherit",
    isPageOverrideEnabled: context.pageMode !== "inherit",
    siteSelection:
      context.siteMode === "inherit" ? getOppositeMode(context.globalMode) : context.siteMode,
    pageSelection:
      context.pageMode === "inherit"
        ? getOppositeMode(context.effectiveMode)
        : context.pageMode,
  };
}

function renderUnsupported(): void {
  statusCard?.classList.add("is-unsupported");
  hostValue!.textContent = "当前页面不可用";
  effectiveValue!.textContent = "无法接管";
  sourceValue!.textContent = "来源：浏览器受限页面";
  pageValue!.textContent = "请切换到普通网页后再使用。";
  statusChip!.textContent = "不支持";
  statusChip!.dataset.state = "muted";
  statusText!.textContent = "当前页面不支持接管，例如 chrome:// 页面、扩展页或商店页面。";
  permissionCard!.hidden = true;
  siteSection!.hidden = true;
  advancedSection!.hidden = true;
}

function renderContext(context: PopupContext, uiState: PopupUiState): void {
  siteSection!.hidden = false;
  advancedSection!.hidden = false;
  statusCard?.classList.remove("is-unsupported");

  hostValue!.textContent = context.hostname;
  pageValue!.textContent = context.pageKey;
  effectiveValue!.textContent = context.effectiveMode === "same-tab" ? "同标签页" : "新标签页";
  sourceValue!.textContent = `来源：${renderSourceText(context.effectiveSource)}`;
  statusChip!.textContent = context.effectiveMode === "same-tab" ? "当前页" : "新标签";
  statusChip!.dataset.state = context.effectiveMode === "same-tab" ? "same" : "new";

  statusText!.textContent = permissionGranted
    ? renderStatusDescription(context)
    : "规则已经准备好，但需要先授权当前站点，插件才能真正接管网页跳转。";

  permissionCard!.hidden = permissionGranted;

  updateSwitchState(siteOverrideToggle, uiState.isSiteOverrideEnabled, !permissionGranted);
  updateSwitchState(pageOverrideToggle, uiState.isPageOverrideEnabled, !permissionGranted);

  siteModeGroup!.hidden = !uiState.isSiteOverrideEnabled;
  pageModeGroup!.hidden = !uiState.isPageOverrideEnabled;

  setHelperText(
    siteHelperText,
    uiState.isSiteOverrideEnabled
      ? `当前站点固定为${renderModeLabel(uiState.siteSelection)}。`
      : `关闭时继承全局默认；启用后默认切到${renderModeLabel(uiState.siteSelection)}。`,
  );
  setHelperText(
    pageHelperText,
    uiState.isPageOverrideEnabled
      ? `当前页面固定为${renderModeLabel(uiState.pageSelection)}。`
      : `关闭时继承站点或全局规则；启用后默认切到${renderModeLabel(uiState.pageSelection)}。`,
  );

  setSegmentedSelection(globalModeGroup, context.globalMode, false);
  setSegmentedSelection(siteModeGroup, uiState.siteSelection, !permissionGranted);
  setSegmentedSelection(pageModeGroup, uiState.pageSelection, !permissionGranted);
}

function renderStatusDescription(context: PopupContext): string {
  if (context.pageMode === "inherit" && context.siteMode === "inherit") {
    return "当前页面正在继承全局默认模式。";
  }

  if (context.pageMode === "inherit" && context.siteMode !== "inherit") {
    return "当前页面正在继承当前站点规则。";
  }

  return "当前页面已启用独立规则，会优先覆盖站点和全局默认。";
}

function renderSourceText(source: PopupContext["effectiveSource"]): string {
  if (source === "page") {
    return "页面规则";
  }
  if (source === "site") {
    return "站点规则";
  }
  return "全局默认";
}

function renderModeLabel(mode: NavigationMode): string {
  return mode === "same-tab" ? "同标签页" : "新标签页";
}

function updateSwitchState(
  button: HTMLButtonElement | null,
  pressed: boolean,
  disabled: boolean,
): void {
  if (!button) {
    return;
  }

  button.setAttribute("aria-pressed", String(pressed));
  button.classList.toggle("is-on", pressed);
  button.disabled = disabled;
}

function setHelperText(target: HTMLElement | null, text: string): void {
  if (target) {
    target.textContent = text;
  }
}

function setSegmentedSelection(
  group: HTMLElement | null,
  value: NavigationMode,
  disabled: boolean,
): void {
  group?.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach((button) => {
    const selected = button.dataset.mode === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = disabled;
  });

  if (group) {
    group.classList.toggle("is-disabled", disabled);
  }
}

async function requestSitePermission(): Promise<void> {
  if (!currentContext) {
    return;
  }

  permissionGranted = await chrome.permissions.request({
    origins: buildPermissionPatterns(currentContext.hostname),
  });

  if (permissionGranted && activeTabId) {
    await chrome.tabs.reload(activeTabId);
  }

  await initializePopup();
}

async function handleSiteOverrideToggle(): Promise<void> {
  if (!currentContext || !currentUiState || !permissionGranted) {
    return;
  }

  await toggleSiteOverride(!currentUiState.isSiteOverrideEnabled);
}

async function handlePageOverrideToggle(): Promise<void> {
  if (!currentContext || !currentUiState || !permissionGranted) {
    return;
  }

  await togglePageOverride(!currentUiState.isPageOverrideEnabled);
}

async function toggleSiteOverride(enabled: boolean): Promise<void> {
  if (!currentContext || !currentUiState) {
    return;
  }

  const mode = enabled ? currentUiState.siteSelection : "inherit";
  await sendRuleUpdate("plm:set-site-rule", currentContext.hostname, mode);
  await refreshPopup();
}

async function togglePageOverride(enabled: boolean): Promise<void> {
  if (!currentContext || !currentUiState) {
    return;
  }

  const mode = enabled ? currentUiState.pageSelection : "inherit";
  await sendRuleUpdate("plm:set-page-rule", currentContext.pageKey, mode);
  await refreshPopup();
}

async function setSiteExplicitMode(mode: NavigationMode): Promise<void> {
  if (!currentContext || !permissionGranted) {
    return;
  }

  await sendRuleUpdate("plm:set-site-rule", currentContext.hostname, mode);
  await refreshPopup();
}

async function setPageExplicitMode(mode: NavigationMode): Promise<void> {
  if (!currentContext || !permissionGranted) {
    return;
  }

  await sendRuleUpdate("plm:set-page-rule", currentContext.pageKey, mode);
  await refreshPopup();
}

async function setGlobalMode(mode: NavigationMode): Promise<void> {
  await chrome.runtime.sendMessage({
    type: "plm:set-global-mode",
    mode,
  } as RuntimeRequest);
  await refreshPopup();
}

async function sendRuleUpdate(
  type: "plm:set-site-rule" | "plm:set-page-rule",
  value: string,
  mode: RuleMode,
): Promise<void> {
  if (type === "plm:set-site-rule") {
    await chrome.runtime.sendMessage({
      type,
      hostname: value,
      mode,
    } as RuntimeRequest);
    return;
  }

  await chrome.runtime.sendMessage({
    type,
    url: value,
    mode,
  } as RuntimeRequest);
}

async function refreshPopup(): Promise<void> {
  if (permissionGranted && activeTabId) {
    await chrome.tabs.reload(activeTabId);
  }
  await initializePopup();
}

function getOppositeMode(mode: NavigationMode): NavigationMode {
  return mode === "same-tab" ? "new-tab" : "same-tab";
}
