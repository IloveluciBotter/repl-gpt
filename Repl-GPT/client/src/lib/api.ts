import { captureError } from "./sentry";

const API_BASE = "";

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    const requestId = res.headers.get("x-request-id") || errorBody.requestId;
    const errorMessage = errorBody.message || errorBody.error || "Request failed";
    
    const error = new Error(errorMessage);
    captureError(error, {
      requestId,
      extra: { endpoint, status: res.status, errorBody },
    });
    
    throw error;
  }

  return res.json();
}

export const api = {
  auth: {
    getNonce: (wallet: string) =>
      fetchApi<{ nonce: string; message: string; expiresAt: string }>(
        `/api/auth/nonce?wallet=${wallet}`
      ),

    getChallenge: (publicKey: string) =>
      fetchApi<{ nonce: string; message: string; expiresAt: string }>(
        `/api/auth/challenge?publicKey=${publicKey}`
      ),

    verify: (wallet: string, signature: string, nonce: string) =>
      fetchApi<{ ok: boolean; expiresAt: string }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ wallet, signature, nonce }),
      }),

    logout: () =>
      fetchApi<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
      }),

    session: () =>
      fetchApi<{ authenticated: boolean; walletAddress: string; domain: string }>(
        "/api/auth/session"
      ),

    isCreator: () => fetchApi<{ isCreator: boolean }>("/api/auth/is-creator"),
  },

  gate: {
    status: () =>
      fetchApi<{
        hasAccess: boolean;
        hiveAmount: number;
        requiredHiveAmount: number;
        hiveUsd: number | null;
        priceUsd: number | null;
        priceMissing: boolean;
      }>("/api/gate/status"),

    checkBalance: (walletAddress: string) =>
      fetchApi<{
        hasAccess: boolean;
        hiveAmount: number;
        requiredHiveAmount: number;
        hiveUsd: number | null;
        priceUsd: number | null;
        priceMissing: boolean;
      }>(`/api/balance/${walletAddress}`),
  },

  tracks: {
    getAll: () =>
      fetchApi<
        Array<{ id: string; name: string; description: string | null }>
      >("/api/tracks"),

    getQuestions: (trackId: string) =>
      fetchApi<
        Array<{
          id: string;
          text: string;
          options: string[];
          correctIndex: number;
          complexity: number;
        }>
      >(`/api/tracks/${trackId}/questions`),
  },

  corpus: {
    getAll: (params?: {
      trackId?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.trackId) searchParams.set("trackId", params.trackId);
      if (params?.search) searchParams.set("search", params.search);
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const query = searchParams.toString();
      return fetchApi<{
        items: Array<{
          id: string;
          trackId: string;
          cycleId: string;
          normalizedText: string;
          createdAt: string;
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/api/corpus${query ? `?${query}` : ""}`);
    },

    getStats: () =>
      fetchApi<{
        totalItems: number;
        itemsThisCycle: number;
        lastUpdated: string | null;
        currentCycleNumber: number | null;
      }>("/api/corpus/stats"),

    create: (trackId: string, text: string, sourceAttemptId?: string) =>
      fetchApi<{ id: string }>("/api/corpus", {
        method: "POST",
        body: JSON.stringify({ trackId, text, sourceAttemptId }),
      }),

    update: (id: string, data: { text?: string; trackId?: string }) =>
      fetchApi<{ id: string }>(`/api/corpus/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/api/corpus/${id}`, {
        method: "DELETE",
      }),
  },

  chat: {
    send: (message: string, aiLevel: number, track?: string) =>
      fetchApi<{
        id: string;
        response: string;
        corpusItemsUsed: number;
        aiLevel: number;
        track?: string;
      }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, aiLevel, track }),
      }),

    getHistory: (limit?: number) =>
      fetchApi<
        Array<{
          id: string;
          userMessage: string;
          aiResponse: string;
          aiLevel: number;
          createdAt: string;
        }>
      >(`/api/ai/chat/history${limit ? `?limit=${limit}` : ""}`),
  },

  train: {
    submit: (data: {
      trackId: string;
      difficulty: string;
      content: string;
      answers: number[];
      correctAnswers: number[];
      startTime: number;
    }) =>
      fetchApi<{
        id: string;
        status: string;
        autoReview: {
          decision: "approved" | "rejected" | "pending";
          message: string;
          scorePct: number;
          attemptDurationSec: number;
          styleCreditsEarned: number;
          intelligenceGain: number;
        };
      }>("/api/train-attempts/submit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  health: {
    check: () => fetchApi<{ status: string }>("/api/health"),
    ollamaCheck: () =>
      fetchApi<{ ok: boolean; baseUrl: string; model?: string; error?: string }>(
        "/api/health/ollama"
      ),
  },

  cycles: {
    getCurrent: () =>
      fetchApi<{ id: string; cycleNumber: number; isActive: boolean } | null>(
        "/api/cycles/current"
      ),
  },
};
