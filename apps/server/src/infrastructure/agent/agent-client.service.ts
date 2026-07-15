import { Inject, Injectable, Optional } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";

type AgentClientOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export class AgentLlmConnectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AgentLlmConnectionError";
  }
}

@Injectable()
export class AgentClientService {
  private readonly fetchImpl: typeof fetch;
  private readonly resolvedBaseUrl?: string;
  private readonly appConfig?: AppConfigService;

  constructor(
    @Optional() @Inject(AppConfigService) config?: AppConfigService,
    @Optional() options?: AgentClientOptions,
  ) {
    this.appConfig = config;
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.resolvedBaseUrl = options?.baseUrl;
  }

  async generateCandidates(input: { title: string; content: string }) {
    const url = this.getBaseUrl();
    const response = await this.fetchImpl(`${url}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error("agent_request_failed");
    }

    return response.json();
  }

  async testLlmConnection(): Promise<void> {
    const response = await this.fetchImpl(`${this.getBaseUrl()}/test-connection`, { method: "POST" });

    if (!response.ok) {
      throw new AgentLlmConnectionError(await this.getErrorCode(response));
    }
  }

  private async getErrorCode(response: Pick<Response, "json">): Promise<string> {
    try {
      const body = await response.json() as { detail?: unknown };
      return typeof body.detail === "string" ? body.detail : "agent_request_failed";
    } catch {
      return "agent_request_failed";
    }
  }

  private getBaseUrl(): string {
    return this.resolvedBaseUrl ?? this.appConfig?.agentBaseUrl ?? "http://127.0.0.1:8000";
  }
}
