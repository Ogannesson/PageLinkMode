import type { ExtensionState, NavigationMode, RuleMode } from "./types";
import { normalizePageUrl } from "./url";

const DEFAULT_STATE: ExtensionState = {
  globalMode: "same-tab",
  siteRules: {},
  pageRules: {},
};

export async function ensureState(): Promise<ExtensionState> {
  const state = await readState();
  await chrome.storage.sync.set(state);
  return state;
}

export async function readState(): Promise<ExtensionState> {
  const stored = await chrome.storage.sync.get([
    "globalMode",
    "siteRules",
    "pageRules",
  ]);
  const globalMode = stored.globalMode;
  const siteRules = stored.siteRules;
  const pageRules = stored.pageRules;
  return {
    globalMode:
      globalMode === "same-tab" || globalMode === "new-tab"
        ? globalMode
        : DEFAULT_STATE.globalMode,
    siteRules: isRuleMap(siteRules) ? siteRules : {},
    pageRules: isRuleMap(pageRules) ? pageRules : {},
  };
}

export async function writeGlobalMode(mode: NavigationMode): Promise<ExtensionState> {
  const state = await readState();
  const nextState = { ...state, globalMode: mode };
  await chrome.storage.sync.set(nextState);
  return nextState;
}

function isRuleMap(value: unknown): value is Record<string, NavigationMode> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => entry === "same-tab" || entry === "new-tab");
}

export async function writeSiteRule(
  hostname: string,
  mode: RuleMode,
): Promise<ExtensionState> {
  const state = await readState();
  const nextRules = { ...state.siteRules };
  if (mode === "inherit") {
    delete nextRules[hostname];
  } else {
    nextRules[hostname] = mode;
  }
  const nextState = { ...state, siteRules: nextRules };
  await chrome.storage.sync.set(nextState);
  return nextState;
}

export async function writePageRule(
  rawUrl: string,
  mode: RuleMode,
): Promise<ExtensionState> {
  const state = await readState();
  const pageKey = normalizePageUrl(rawUrl);
  const nextRules = { ...state.pageRules };
  if (mode === "inherit") {
    delete nextRules[pageKey];
  } else {
    nextRules[pageKey] = mode;
  }
  const nextState = { ...state, pageRules: nextRules };
  await chrome.storage.sync.set(nextState);
  return nextState;
}
