export interface LlmSettingsDto {
  provider: "deepseek";
  apiKeyConfigured: boolean;
  baseUrl: string;
  model: string;
}

export interface UpdateLlmSettingsDto {
  apiKey?: string;
  baseUrl: string;
  model: string;
}
