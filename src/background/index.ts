import { updateBadge } from "./badge";
import type { RuntimeRequest, RuntimeResponse } from "../lib/messages";
import { resolveContext, buildUnsupportedPopupContext } from "../lib/rules";
import {
  ensureState,
  readState,
  writeGlobalMode,
  writePageRule,
  writeSiteRule,
} from "../lib/storage";
import { isSupportedPageUrl } from "../lib/url";

chrome.runtime.onInstalled.addListener(() => {
  void ensureState();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message as RuntimeRequest, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("runtime message failed", error);
      sendResponse({ ok: true });
    });
  return true;
});

async function handleMessage(
  message: RuntimeRequest,
  sender: chrome.runtime.MessageSender,
): Promise<RuntimeResponse> {
  switch (message.type) {
    case "plm:get-context":
      return getResolvedContext(message.url);
    case "plm:get-popup-context":
      return getPopupContext(message.url);
    case "plm:get-state":
      return readState();
    case "plm:open-url":
      await openUrl(message.url, message.mode, sender.tab?.id);
      return { ok: true };
    case "plm:set-global-mode":
      return writeGlobalMode(message.mode);
    case "plm:set-site-rule":
      return writeSiteRule(message.hostname, message.mode);
    case "plm:set-page-rule":
      return writePageRule(message.url, message.mode);
    case "plm:remove-site-rule":
      return writeSiteRule(message.hostname, "inherit");
    case "plm:remove-page-rule":
      return writePageRule(message.url, "inherit");
    case "plm:set-badge":
      await updateBadge(message.payload);
      return { ok: true };
    default:
      return { ok: true };
  }
}

async function getResolvedContext(url: string) {
  const state = await readState();
  return resolveContext(url, state);
}

async function getPopupContext(url: string) {
  if (!isSupportedPageUrl(url)) {
    return buildUnsupportedPopupContext(url);
  }
  const state = await readState();
  return {
    ...resolveContext(url, state),
    supported: true,
  };
}

async function openUrl(
  url: string,
  mode: "same-tab" | "new-tab",
  sourceTabId?: number,
): Promise<void> {
  if (mode === "same-tab" && sourceTabId) {
    await chrome.tabs.update(sourceTabId, { url });
    return;
  }

  await chrome.tabs.create({
    url,
    active: true,
    openerTabId: sourceTabId,
  });
}
