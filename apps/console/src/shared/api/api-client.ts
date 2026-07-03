import type { ConfirmIngestionDto, CreateImportDto, IngestionDetailDto, ReviewRating } from "@learning-os/contracts";

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
  createImport(input: CreateImportDto) {
    return request<{ sourceId: string; sessionId: string; status: string }>("/ingestions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getIngestionDetail(sessionId: string) {
    return request<IngestionDetailDto>(`/ingestions/${sessionId}`);
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
