import API_URL from "../config";

const ANALYZE_CACHE_TTL_MS = 2 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const analyzeCache = new Map<string, CacheEntry<unknown>>();
const analyzeInFlight = new Map<string, Promise<unknown>>();

function makeKey(target: string, language: string) {
  return `${language}:${target.trim().toLowerCase()}`;
}

function getFreshEntry<T>(key: string): T | null {
  const cached = analyzeCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    analyzeCache.delete(key);
    return null;
  }
  return cached.data as T;
}

async function fetchAnalyzePayload<T>(target: string, language: string): Promise<T> {
  const response = await fetch(
    `${API_URL}/api/analyze?target=${encodeURIComponent(target)}&lang=${language}`,
    { credentials: "include" },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || "Failed to analyze target");
  }

  return response.json() as Promise<T>;
}

export function peekAnalyzePayload<T>(target: string, language: string): T | null {
  return getFreshEntry<T>(makeKey(target, language));
}

export async function loadAnalyzePayload<T>(target: string, language: string): Promise<T> {
  const key = makeKey(target, language);
  const cached = getFreshEntry<T>(key);
  if (cached) {
    return cached;
  }

  const inFlight = analyzeInFlight.get(key) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const request = fetchAnalyzePayload<T>(target, language)
    .then((data) => {
      analyzeCache.set(key, {
        data,
        expiresAt: Date.now() + ANALYZE_CACHE_TTL_MS,
      });
      return data;
    })
    .finally(() => {
      analyzeInFlight.delete(key);
    });

  analyzeInFlight.set(key, request);
  return request;
}

export function primeAnalyzePayload(target: string, language: string) {
  void loadAnalyzePayload(target, language).catch(() => {
    // Prefetch is opportunistic; failures should not block navigation.
  });
}
