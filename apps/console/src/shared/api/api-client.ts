import type { ConfirmIngestionDto, CreateImportDto, IngestionDetailDto, LlmSettingsDto, ReviewRating, UpdateLlmSettingsDto } from "@learning-os/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`request_failed:${path}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getLlmSettings() {
    return request<LlmSettingsDto>("/settings/llm");
  },
  saveLlmSettings(input: UpdateLlmSettingsDto) {
    return request<LlmSettingsDto>("/settings/llm", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  testLlmSettings(input: UpdateLlmSettingsDto) {
    return request<LlmSettingsDto>("/settings/llm/test", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  clearLlmApiKey() {
    return request<LlmSettingsDto>("/settings/llm/api-key", { method: "DELETE" });
  },
  createImport(input: CreateImportDto) {
    return request<{ sourceId: string; sessionId: string; status: string }>("/ingestions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getIngestionDetail(sessionId: string) {
    return request<IngestionDetailDto>(`/ingestions/${sessionId}`);
  },
  retryIngestion(sessionId: string) {
    return request<{ sessionId: string; status: "processing" }>(`/ingestions/${sessionId}/retry`, {
      method: "POST",
    });
  },
  confirmIngestion(sessionId: string, input: ConfirmIngestionDto) {
    return request<{ importedConceptCount: number }>(`/ingestions/${sessionId}/confirm`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listConcepts() {
    return request<Array<{ id: string; title: string; summary: string }>>("/concepts");
  },
  getConceptDetail(id: string) {
    return request<any>(`/concepts/${id}`);
  },
  getTodayCards() {
    return request<Array<any>>("/review/today");
  },
  submitReview(cardId: string, rating: ReviewRating) {
    return request(`/review/${cardId}`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    });
  },
  search(query: string) {
    return request<Array<{ id: string; title: string; summary: string }>>(`/search?q=${encodeURIComponent(query)}`);
  },
};
