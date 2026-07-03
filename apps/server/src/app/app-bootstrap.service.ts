import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export class AppBootstrapService {
  constructor(private readonly rootDir: string) {}

  async ensureDirectories() {
    const dirs = ["config", "data", "sources", "notes", "vectors", "exports", "logs", "backups"];
    await Promise.all(dirs.map((dir) => mkdir(join(this.rootDir, dir), { recursive: true })));
  }
}
