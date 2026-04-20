import { classifyWindowOpen } from "../lib/navigation";
import type { NavigationMode } from "../lib/types";

(() => {
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const mode = currentScript?.dataset.mode as NavigationMode | undefined;

  if (mode !== "same-tab" && mode !== "new-tab") {
    return;
  }

  const originalOpen = window.open.bind(window);
  const patchedFlag = "__pagelinkmode_open_patched__";

  if ((window as typeof window & Record<string, boolean>)[patchedFlag]) {
    return;
  }

  (window as typeof window & Record<string, boolean>)[patchedFlag] = true;

  window.open = function patchedWindowOpen(
    url?: string | URL,
    target?: string,
    features?: string,
  ): Window | null {
    if (!url) {
      return originalOpen(url, target, features);
    }

    const resolvedUrl = resolveTargetUrl(url);
    if (!resolvedUrl || !/^https?:$/.test(resolvedUrl.protocol)) {
      return originalOpen(url, target, features);
    }

    const decision = classifyWindowOpen(resolvedUrl, target, features, mode);
    console.debug("[PageLinkMode] window.open", {
      url: resolvedUrl.toString(),
      target,
      features,
      disposition: decision.disposition,
      reason: decision.reason,
    });

    if (decision.disposition === "preserve-native") {
      return originalOpen(url, target, features);
    }

    if (decision.disposition === "same-tab") {
      window.location.assign(resolvedUrl.toString());
      return window;
    }

    window.postMessage(
      {
        source: "pagelinkmode-bridge",
        type: "window-open",
        url: resolvedUrl.toString(),
      },
      window.location.origin,
    );

    return null;
  };
})();

function resolveTargetUrl(url: string | URL): URL | null {
  try {
    return new URL(url.toString(), window.location.href);
  } catch {
    return null;
  }
}
