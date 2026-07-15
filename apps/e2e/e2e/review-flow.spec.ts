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

test.beforeEach(async ({ request }) => {
  await rm(join(rootDir, "sources"), { recursive: true, force: true }).catch(() => {});
  await resetLocalState();

  const created = await request.post("http://127.0.0.1:3001/ingestions", {
    data: {
      type: "text",
      title: "React Server Components",
      content: "React Server Components 允许服务端参与组件渲染。它把数据获取前移，并减少客户端 JavaScript 负担。",
    },
  });
  const session = await created.json();
  const detail = await request.get(`http://127.0.0.1:3001/ingestions/${session.sessionId}`);
  const payload = await detail.json();
  await request.post(`http://127.0.0.1:3001/ingestions/${session.sessionId}/confirm`, {
    data: {
      selectedCandidateIds: payload.coreConcepts.map((item: { id: string }) => item.id),
      selectedCardIds: payload.coreConcepts.flatMap((item: { cards: Array<{ id: string; isSelected: boolean }> }) =>
        item.cards.filter((card) => card.isSelected).map((card) => card.id),
      ),
    },
  });
});

test("user can review imported card and find concept by keyword", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "今日复习" })).toBeVisible();
  await expect(page.getByText("React Server Components 是什么？")).toBeVisible();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByText("今天没有待复习卡片")).toBeVisible();

  await page.goto("/search");
  await page.getByLabel("搜索知识点").fill("React");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByRole("heading", { name: "React Server Components" })).toBeVisible();
});
