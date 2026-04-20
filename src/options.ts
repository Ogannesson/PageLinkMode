import "./styles/base.css";
import "./styles/options.css";

import type { RuntimeRequest } from "./lib/messages";
import type { ExtensionState, NavigationMode } from "./lib/types";

const globalModeSelect = document.querySelector<HTMLSelectElement>("#options-global-mode");
const siteRulesContainer = document.querySelector<HTMLElement>("#site-rules");
const pageRulesContainer = document.querySelector<HTMLElement>("#page-rules");
const siteCount = document.querySelector<HTMLElement>("#site-count");
const pageCount = document.querySelector<HTMLElement>("#page-count");

document.addEventListener("DOMContentLoaded", () => {
  void loadState();
  bindEvents();
});

function bindEvents(): void {
  globalModeSelect?.addEventListener("change", () => {
    void chrome.runtime.sendMessage({
      type: "plm:set-global-mode",
      mode: globalModeSelect.value as NavigationMode,
    } as RuntimeRequest);
  });
}

async function loadState(): Promise<void> {
  const state = (await chrome.runtime.sendMessage({
    type: "plm:get-state",
  } as RuntimeRequest)) as ExtensionState;

  renderState(state);
}

function renderState(state: ExtensionState): void {
  globalModeSelect!.value = state.globalMode;
  renderRuleGroup(
    siteRulesContainer!,
    siteCount!,
    Object.entries(state.siteRules),
    "site",
  );
  renderRuleGroup(
    pageRulesContainer!,
    pageCount!,
    Object.entries(state.pageRules),
    "page",
  );
}

function renderRuleGroup(
  container: HTMLElement,
  counter: HTMLElement,
  entries: Array<[string, NavigationMode]>,
  kind: "site" | "page",
): void {
  counter.textContent = `${entries.length} 条`;
  container.innerHTML = "";

  if (entries.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "暂无规则";
    container.appendChild(emptyState);
    return;
  }

  entries
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([key, mode]) => {
      container.appendChild(createRuleRow(kind, key, mode));
    });
}

function createRuleRow(
  kind: "site" | "page",
  key: string,
  mode: NavigationMode,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "rule-row";

  const title = document.createElement("span");
  title.className = "rule-key";
  title.textContent = key;

  const select = document.createElement("select");
  select.innerHTML = `
    <option value="same-tab">同标签页</option>
    <option value="new-tab">新标签页</option>
  `;
  select.value = mode;
  select.addEventListener("change", () => {
    void updateRule(kind, key, select.value as NavigationMode);
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "删除";
  removeButton.addEventListener("click", () => {
    void removeRule(kind, key);
  });

  const actions = document.createElement("div");
  actions.className = "rule-actions";
  actions.append(select, removeButton);

  row.append(title, actions);
  return row;
}

async function updateRule(
  kind: "site" | "page",
  key: string,
  mode: NavigationMode,
): Promise<void> {
  const message: RuntimeRequest =
    kind === "site"
      ? { type: "plm:set-site-rule", hostname: key, mode }
      : { type: "plm:set-page-rule", url: key, mode };

  await chrome.runtime.sendMessage(message);
  await loadState();
}

async function removeRule(kind: "site" | "page", key: string): Promise<void> {
  const message: RuntimeRequest =
    kind === "site"
      ? { type: "plm:remove-site-rule", hostname: key }
      : { type: "plm:remove-page-rule", url: key };

  await chrome.runtime.sendMessage(message);
  await loadState();
}
