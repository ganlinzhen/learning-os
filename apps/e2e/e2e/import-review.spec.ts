import { expect, test } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const rootDir = join(process.cwd(), ".tmp", "learning-os-e2e");
const databasePath = join(rootDir, "data", "learning-os.db");

async function resetLocalState() {
  await mkdir(join(rootDir, "data"), { recursive: true });
  await mkdir(join(rootDir, "sources"), { recursive: true });

  try {
    const db = new DatabaseSync(databasePath);
    db.exec(`
      pragma foreign_keys = off;
      delete from review_logs;
      delete from review_cards;
      delete from notes;
      delete from concepts;
      delete from card_candidates;
      delete from concept_candidates;
      delete from ingestion_sessions;
      delete from sources;
      pragma foreign_keys = on;
    `);
    db.close();
  } catch {}

  const sourceFiles = await readdir(join(rootDir, "sources")).catch(() => []);
  await Promise.all(sourceFiles.map((file) => rm(join(rootDir, "sources", file), { force: true })));
}

test.beforeEach(async () => {
  await rm(join(rootDir, "sources"), { recursive: true, force: true }).catch(() => {});
  await resetLocalState();
});

test("user can import text and reach review page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("标题").fill("React Server Components");
  await page
    .getByLabel("正文")
    .fill("React Server Components 允许服务端参与组件渲染。它把数据获取前移，并减少客户端 JavaScript 负担。");
  await page.getByRole("button", { name: "开始整理" }).click();

  await expect(page.getByRole("heading", { name: "核心知识点" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "候选知识点" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "React Server Components" }).first()).toBeVisible();
  await page.getByRole("button", { name: "确认入库" }).click();

  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "知识库" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "React Server Components" })).toBeVisible();
});
