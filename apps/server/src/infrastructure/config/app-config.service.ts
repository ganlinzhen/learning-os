import { Injectable } from "@nestjs/common";
import { join } from "node:path";

@Injectable()
export class AppConfigService {
  readonly appRootDir = process.env.LEARNING_OS_ROOT_DIR ?? join(process.cwd(), ".learning-os");
  readonly apiPort = Number(process.env.LEARNING_OS_API_PORT ?? "3000");
  readonly agentBaseUrl = process.env.LEARNING_OS_AGENT_URL ?? "http://127.0.0.1:8000";
  readonly databasePath = process.env.LEARNING_OS_DB_PATH ?? join(this.appRootDir, "data", "learning-os.db");
  readonly databaseUrl = process.env.DATABASE_URL ?? `file:${this.databasePath}`;
  readonly llmConfigPath = process.env.LEARNING_OS_LLM_CONFIG_PATH ?? join(this.appRootDir, "settings", "llm.json");
}
