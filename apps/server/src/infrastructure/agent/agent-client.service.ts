import { Inject, Injectable, Optional } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";

type AgentClientOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

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
    const url = this.resolvedBaseUrl ?? this.appConfig?.agentBaseUrl ?? "http://127.0.0.1:8000";
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
}
