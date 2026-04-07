const DEFAULT_API_BASE_URL = "http://localhost:5000/api";
const LEGACY_HARDCODED_API_BASE_URL = "http://localhost:5000/api";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
);

function rewriteApiUrl(url: string) {
  if (!url.startsWith(LEGACY_HARDCODED_API_BASE_URL)) {
    return url;
  }

  const suffix = url.slice(LEGACY_HARDCODED_API_BASE_URL.length);
  return `${API_BASE_URL}${suffix}`;
}

export function installApiBaseUrlInterceptor() {
  if (typeof window === "undefined") {
    return;
  }

  const markerKey = "__loopaccFetchWrapped__";
  const markedWindow = window as Window & { [key: string]: boolean };

  if (markedWindow[markerKey]) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return originalFetch(rewriteApiUrl(input), init);
    }

    if (input instanceof URL) {
      return originalFetch(new URL(rewriteApiUrl(input.toString())), init);
    }

    if (input instanceof Request) {
      const rewrittenUrl = rewriteApiUrl(input.url);
      if (rewrittenUrl !== input.url) {
        return originalFetch(new Request(rewrittenUrl, input), init);
      }
    }

    return originalFetch(input, init);
  };

  markedWindow[markerKey] = true;
}
