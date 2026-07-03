# Learning OS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地优先的 Learning OS MVP，支持导入内容、生成候选知识点、用户确认入库、今日复习和关键词搜索的完整浅闭环。

**Architecture:** 使用 Electron 承载 React 前端与本地 NestJS API，SQLite 负责结构化数据持久化，本地文件系统负责保存原始材料与笔记。Python Agent 先以可替换的本地 HTTP worker 形式提供候选知识点与卡片生成能力，导入流程通过 `IngestionSession + Candidate` 层隔离候选结果与正式知识库。

**Tech Stack:** Electron、React、Vite、NestJS、Prisma、SQLite、Python、Vitest、Playwright、ts-fsrs

---

## 文件结构

### 新建目录与主要职责

- `apps/shell/`
  - Electron 主进程、预加载脚本、窗口与子进程管理
- `apps/console/`
  - React + Vite 渲染层，负责导入、确认页、知识库、复习与搜索页面
- `apps/server/`
  - NestJS 本地 API，负责导入流程、数据库读写、复习、搜索与本地目录初始化
- `apps/generator/`
  - Python Agent worker，负责将原始内容转换为候选知识点与候选卡片
- `packages/shared/`
  - 前后端共享类型、导入状态枚举、DTO、API 响应模型
- `apps/e2e/e2e/`
  - 面向用户流程的端到端测试
- `doc/`
  - PRD、设计稿、实现计划与后续说明文档

### 计划中将新增或修改的核心文件

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/shell/package.json`
- Create: `apps/shell/src/main.ts`
- Create: `apps/shell/src/preload.ts`
- Create: `apps/shell/src/process-manager.ts`
- Create: `apps/console/package.json`
- Create: `apps/console/src/main.tsx`
- Create: `apps/console/src/App.tsx`
- Create: `apps/console/src/router.tsx`
- Create: `apps/console/src/pages/import-page.tsx`
- Create: `apps/console/src/pages/ingestion-review-page.tsx`
- Create: `apps/console/src/pages/library-page.tsx`
- Create: `apps/console/src/pages/concept-detail-page.tsx`
- Create: `apps/console/src/pages/review-page.tsx`
- Create: `apps/console/src/pages/search-page.tsx`
- Create: `apps/console/src/lib/api-client.ts`
- Create: `apps/server/package.json`
- Create: `apps/server/src/main.ts`
- Create: `apps/server/src/app.module.ts`
- Create: `apps/server/src/health/health.controller.ts`
- Create: `apps/server/src/bootstrap/app-bootstrap.service.ts`
- Create: `apps/server/src/config/app-config.service.ts`
- Create: `apps/server/src/storage/storage.service.ts`
- Create: `apps/server/src/ingestion/ingestion.module.ts`
- Create: `apps/server/src/ingestion/ingestion.controller.ts`
- Create: `apps/server/src/ingestion/ingestion.service.ts`
- Create: `apps/server/src/ingestion/agent-client.service.ts`
- Create: `apps/server/src/ingestion/dto/create-import.dto.ts`
- Create: `apps/server/src/ingestion/dto/confirm-ingestion.dto.ts`
- Create: `apps/server/src/library/library.module.ts`
- Create: `apps/server/src/library/library.controller.ts`
- Create: `apps/server/src/library/library.service.ts`
- Create: `apps/server/src/review/review.module.ts`
- Create: `apps/server/src/review/review.controller.ts`
- Create: `apps/server/src/review/review.service.ts`
- Create: `apps/server/src/search/search.module.ts`
- Create: `apps/server/src/search/search.controller.ts`
- Create: `apps/server/src/search/search.service.ts`
- Create: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/seed.ts`
- Create: `apps/generator/requirements.txt`
- Create: `apps/generator/app.py`
- Create: `apps/generator/models.py`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/ingestion.ts`
- Create: `packages/shared/src/review.ts`
- Create: `apps/e2e/e2e/import-review.spec.ts`
- Create: `apps/e2e/e2e/review-flow.spec.ts`

## Task 1: 建立 Monorepo 与工具链骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/shell/package.json`
- Create: `apps/console/package.json`
- Create: `apps/server/package.json`
- Test: `pnpm install`

- [ ] **Step 1: 写工作区根配置**

```json
{
  "name": "learning-os",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev:web": "pnpm --filter @learning-os/console dev",
    "dev:api": "pnpm --filter @learning-os/server start:dev",
    "dev:desktop": "pnpm --filter @learning-os/shell dev",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  }
}
```

- [ ] **Step 2: 写 workspace 与基础 tsconfig**

```yaml
packages:
  - apps/*
  - packages/*
  - tests
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@learning-os/shared": ["packages/shared/src/index.ts"]
    }
  }
}
```

- [ ] **Step 3: 写三个应用的 package.json**

```json
{
  "name": "@learning-os/console",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  }
}
```

```json
{
  "name": "@learning-os/server",
  "private": true,
  "scripts": {
    "start:dev": "nest start --watch",
    "test": "vitest run",
    "lint": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  }
}
```

```json
{
  "name": "@learning-os/shell",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: 安装依赖并确认工作区可解析**

Run: `pnpm install`
Expected: 成功生成 `pnpm-lock.yaml`，没有 workspace 解析错误

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json apps
git commit -m "chore: initialize learning os workspace"
```

## Task 2: 搭建 NestJS API 基础服务与健康检查

**Files:**
- Create: `apps/server/src/main.ts`
- Create: `apps/server/src/app.module.ts`
- Create: `apps/server/src/health/health.controller.ts`
- Test: `apps/server/src/health/health.controller.spec.ts`

- [ ] **Step 1: 写健康检查失败测试**

```ts
import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok payload", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.getHealth()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- health.controller.spec.ts`
Expected: FAIL，提示 `Cannot find module './health.controller'`

- [ ] **Step 3: 写最小实现**

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return { status: "ok" };
  }
}
```

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";

@Module({
  controllers: [HealthController],
})
export class AppModule {}
```

```ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- health.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat: add api health check"
```

## Task 3: 初始化本地数据目录与配置服务

**Files:**
- Create: `apps/server/src/bootstrap/app-bootstrap.service.ts`
- Create: `apps/server/src/config/app-config.service.ts`
- Create: `apps/server/src/storage/storage.service.ts`
- Test: `apps/server/src/bootstrap/app-bootstrap.service.spec.ts`

- [ ] **Step 1: 写目录初始化测试**

```ts
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppBootstrapService } from "./app-bootstrap.service";

describe("AppBootstrapService", () => {
  it("creates required learning os directories", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-"));
    const service = new AppBootstrapService(rootDir);

    await service.ensureDirectories();

    expect(existsSync(join(rootDir, "sources"))).toBe(true);
    expect(existsSync(join(rootDir, "notes"))).toBe(true);
    expect(existsSync(join(rootDir, "logs"))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- app-bootstrap.service.spec.ts`
Expected: FAIL，提示 `AppBootstrapService` 未定义

- [ ] **Step 3: 写最小目录初始化实现**

```ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export class AppBootstrapService {
  constructor(private readonly rootDir: string) {}

  async ensureDirectories() {
    const dirs = [
      "config",
      "sources",
      "notes",
      "vectors",
      "exports",
      "logs",
      "backups",
    ];

    await Promise.all(
      dirs.map((dir) => mkdir(join(this.rootDir, dir), { recursive: true })),
    );
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- app-bootstrap.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/bootstrap apps/server/src/config apps/server/src/storage
git commit -m "feat: initialize local storage layout"
```

## Task 4: 定义 Prisma 数据模型与迁移

**Files:**
- Create: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/seed.ts`
- Test: `pnpm --filter @learning-os/server prisma:generate`

- [ ] **Step 1: 写 Prisma schema**

```prisma
model Source {
  id          String   @id @default(cuid())
  type        String
  title       String
  url         String?
  localPath   String
  contentHash String
  status      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  sessions    IngestionSession[]
}

model IngestionSession {
  id                String             @id @default(cuid())
  sourceId          String
  latestAgentTaskId String?
  status            String
  domainHint        String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  confirmedAt       DateTime?
  importedAt        DateTime?
  source            Source             @relation(fields: [sourceId], references: [id])
  candidates        ConceptCandidate[]
  cards             CardCandidate[]
}
```

- [ ] **Step 2: 补齐正式知识库与复习模型**

```prisma
model Concept {
  id            String       @id @default(cuid())
  title         String
  summary       String
  explanation   String?
  status        String
  masteryScore  Int          @default(0)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  notes         Note[]
  reviewCards   ReviewCard[]
}

model ReviewCard {
  id             String      @id @default(cuid())
  conceptId      String
  type           String
  question       String
  answer         String
  dueAt          DateTime
  reps           Int         @default(0)
  lapses         Int         @default(0)
  concept        Concept     @relation(fields: [conceptId], references: [id])
  reviewLogs     ReviewLog[]
}
```

- [ ] **Step 3: 生成客户端确认 schema 合法**

Run: `pnpm --filter @learning-os/server prisma:generate`
Expected: PASS，生成 Prisma Client

- [ ] **Step 4: 写 seed 初始化默认领域**

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.domain.createMany({
    data: [
      { name: "前端技术", slug: "frontend", sortOrder: 1 },
      { name: "后端技术", slug: "backend", sortOrder: 2 },
      { name: "通用知识", slug: "general", sortOrder: 99 },
    ],
    skipDuplicates: true,
  });
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma
git commit -m "feat: add prisma schema for ingestion and learning flow"
```

## Task 5: 补共享类型与导入状态枚举

**Files:**
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/ingestion.ts`
- Create: `packages/shared/src/review.ts`
- Test: `packages/shared/src/ingestion.spec.ts`

- [ ] **Step 1: 写共享状态测试**

```ts
import { ingestionSessionStatuses } from "./ingestion";

describe("ingestion status list", () => {
  it("contains reviewable state", () => {
    expect(ingestionSessionStatuses).toContain("reviewable");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- ingestion.spec.ts`
Expected: FAIL，提示 `./ingestion` 不存在

- [ ] **Step 3: 写共享类型**

```ts
export const ingestionSessionStatuses = [
  "created",
  "processing",
  "reviewable",
  "confirmed",
  "imported",
  "failed",
  "discarded",
] as const;

export type IngestionSessionStatus =
  (typeof ingestionSessionStatuses)[number];

export interface ConceptCandidateDto {
  id: string;
  title: string;
  summary: string;
  isCore: boolean;
  isSelected: boolean;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- ingestion.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat: add shared ingestion and review types"
```

## Task 6: 实现 Python Agent 最小候选输出服务

**Files:**
- Create: `apps/generator/requirements.txt`
- Create: `apps/generator/models.py`
- Create: `apps/generator/app.py`
- Test: `apps/generator/tests/test_app.py`

- [ ] **Step 1: 写 Agent 输出结构测试**

```python
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_generate_candidates_returns_core_and_candidate_items():
    response = client.post(
        "/generate",
        json={"title": "React Server Components", "content": "RSC allows server rendering."},
    )

    payload = response.json()
    assert response.status_code == 200
    assert payload["coreConcepts"][0]["title"] == "React Server Components"
    assert "candidateConcepts" in payload
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/generator && pytest tests/test_app.py -q`
Expected: FAIL，提示 `app` 不存在

- [ ] **Step 3: 写最小 FastAPI 实现**

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class GenerateRequest(BaseModel):
    title: str
    content: str

@app.post("/generate")
def generate(request: GenerateRequest):
    return {
        "coreConcepts": [
            {
                "title": request.title,
                "summary": request.content[:80],
                "isCore": True,
                "cards": [
                    {
                        "type": "qa",
                        "question": f"{request.title} 是什么？",
                        "answer": request.content[:120],
                    }
                ],
            }
        ],
        "candidateConcepts": [],
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/generator && pytest tests/test_app.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/generator
git commit -m "feat: add minimal agent candidate generator"
```

## Task 7: 实现导入 API 与 Source / Session 创建

**Files:**
- Create: `apps/server/src/ingestion/dto/create-import.dto.ts`
- Create: `apps/server/src/ingestion/ingestion.controller.ts`
- Create: `apps/server/src/ingestion/ingestion.service.ts`
- Test: `apps/server/src/ingestion/ingestion.service.spec.ts`

- [ ] **Step 1: 写导入创建测试**

```ts
describe("IngestionService", () => {
  it("creates source and ingestion session for text import", async () => {
    const prisma = {
      source: { create: vi.fn().mockResolvedValue({ id: "src_1" }) },
      ingestionSession: {
        create: vi.fn().mockResolvedValue({ id: "session_1", status: "created" }),
      },
    } as any;

    const service = new IngestionService(prisma, {} as any, {} as any);
    const result = await service.createImport({
      type: "text",
      title: "RSC",
      content: "server components",
    });

    expect(result.sessionId).toBe("session_1");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- ingestion.service.spec.ts`
Expected: FAIL，提示 `IngestionService` 不存在

- [ ] **Step 3: 写最小导入服务**

```ts
export class IngestionService {
  constructor(
    private readonly prisma: any,
    private readonly storageService: any,
    private readonly agentClient: any,
  ) {}

  async createImport(input: {
    type: "text" | "url" | "markdown";
    title: string;
    content: string;
  }) {
    const source = await this.prisma.source.create({
      data: {
        type: input.type,
        title: input.title,
        localPath: `/tmp/${input.title}.md`,
        contentHash: "pending",
        status: "pending",
      },
    });

    const session = await this.prisma.ingestionSession.create({
      data: {
        sourceId: source.id,
        status: "created",
      },
    });

    return { sourceId: source.id, sessionId: session.id, status: session.status };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- ingestion.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ingestion
git commit -m "feat: add ingestion session creation flow"
```

## Task 8: 打通 Agent 调用与候选结果落库

**Files:**
- Create: `apps/server/src/ingestion/agent-client.service.ts`
- Modify: `apps/server/src/ingestion/ingestion.service.ts`
- Test: `apps/server/src/ingestion/agent-client.service.spec.ts`

- [ ] **Step 1: 写 Agent client 测试**

```ts
describe("AgentClientService", () => {
  it("returns normalized candidate payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coreConcepts: [{ title: "RSC", summary: "summary", cards: [] }],
        candidateConcepts: [],
      }),
    });

    const service = new AgentClientService(fetchMock as any, "http://localhost:8000");
    const result = await service.generateCandidates({ title: "RSC", content: "body" });
    expect(result.coreConcepts[0].title).toBe("RSC");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- agent-client.service.spec.ts`
Expected: FAIL，提示 `AgentClientService` 不存在

- [ ] **Step 3: 写最小 Agent client 与候选落库逻辑**

```ts
export class AgentClientService {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly baseUrl: string,
  ) {}

  async generateCandidates(input: { title: string; content: string }) {
    const response = await this.fetchImpl(`${this.baseUrl}/generate`, {
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
```

```ts
const candidateResult = await this.agentClient.generateCandidates({
  title: input.title,
  content: input.content,
});

await this.prisma.conceptCandidate.createMany({
  data: candidateResult.coreConcepts.map((concept: any) => ({
    sessionId: session.id,
    title: concept.title,
    summary: concept.summary,
    isCore: true,
    isSelected: true,
  })),
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- agent-client.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ingestion
git commit -m "feat: persist agent candidate results"
```

## Task 9: 实现整理结果查询与确认入库 API

**Files:**
- Create: `apps/server/src/ingestion/dto/confirm-ingestion.dto.ts`
- Modify: `apps/server/src/ingestion/ingestion.controller.ts`
- Modify: `apps/server/src/ingestion/ingestion.service.ts`
- Test: `apps/server/src/ingestion/confirm-ingestion.spec.ts`

- [ ] **Step 1: 写确认入库测试**

```ts
describe("confirmIngestion", () => {
  it("imports selected concept candidates into concept table", async () => {
    const prisma = {
      conceptCandidate: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cand_1", title: "RSC", summary: "summary", isSelected: true },
        ]),
      },
      concept: { create: vi.fn().mockResolvedValue({ id: "concept_1" }) },
      ingestionSession: { update: vi.fn() },
    } as any;

    const service = new IngestionService(prisma, {} as any, {} as any);
    const result = await service.confirmIngestion("session_1", {
      selectedCandidateIds: ["cand_1"],
    });

    expect(result.importedConceptCount).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- confirm-ingestion.spec.ts`
Expected: FAIL，提示 `confirmIngestion` 不存在

- [ ] **Step 3: 写最小确认入库实现**

```ts
async confirmIngestion(
  sessionId: string,
  input: { selectedCandidateIds: string[] },
) {
  const candidates = await this.prisma.conceptCandidate.findMany({
    where: { sessionId, id: { in: input.selectedCandidateIds } },
  });

  for (const candidate of candidates) {
    await this.prisma.concept.create({
      data: {
        title: candidate.title,
        summary: candidate.summary,
        status: "new",
        masteryScore: 0,
      },
    });
  }

  await this.prisma.ingestionSession.update({
    where: { id: sessionId },
    data: { status: "imported", importedAt: new Date() },
  });

  return { importedConceptCount: candidates.length };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- confirm-ingestion.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ingestion
git commit -m "feat: confirm ingestion into library"
```

## Task 10: 构建 React 基础路由与导入页

**Files:**
- Create: `apps/console/src/main.tsx`
- Create: `apps/console/src/App.tsx`
- Create: `apps/console/src/router.tsx`
- Create: `apps/console/src/pages/import-page.tsx`
- Test: `apps/console/src/pages/import-page.test.tsx`

- [ ] **Step 1: 写导入页渲染测试**

```tsx
import { render, screen } from "@testing-library/react";
import { ImportPage } from "./import-page";

describe("ImportPage", () => {
  it("renders import form heading", () => {
    render(<ImportPage />);
    expect(screen.getByRole("heading", { name: "导入中心" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/console test -- import-page.test.tsx`
Expected: FAIL，提示 `ImportPage` 不存在

- [ ] **Step 3: 写最小页面与路由**

```tsx
export function ImportPage() {
  return (
    <main>
      <h1>导入中心</h1>
      <form>
        <label htmlFor="title">标题</label>
        <input id="title" name="title" />
        <label htmlFor="content">正文</label>
        <textarea id="content" name="content" />
        <button type="submit">开始整理</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/console test -- import-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src
git commit -m "feat: add import page shell"
```

## Task 11: 构建整理结果确认页

**Files:**
- Create: `apps/console/src/pages/ingestion-review-page.tsx`
- Create: `apps/console/src/lib/api-client.ts`
- Test: `apps/console/src/pages/ingestion-review-page.test.tsx`

- [ ] **Step 1: 写确认页渲染测试**

```tsx
import { render, screen } from "@testing-library/react";
import { IngestionReviewPage } from "./ingestion-review-page";

describe("IngestionReviewPage", () => {
  it("renders core and candidate sections", () => {
    render(
      <IngestionReviewPage
        data={{
          title: "React Server Components",
          coreConcepts: [{ id: "1", title: "RSC", summary: "summary" }],
          candidateConcepts: [],
        }}
      />,
    );

    expect(screen.getByText("核心知识点")).toBeInTheDocument();
    expect(screen.getByText("候选知识点")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/console test -- ingestion-review-page.test.tsx`
Expected: FAIL，提示 `IngestionReviewPage` 不存在

- [ ] **Step 3: 写最小确认页**

```tsx
export function IngestionReviewPage({
  data,
}: {
  data: {
    title: string;
    coreConcepts: Array<{ id: string; title: string; summary: string }>;
    candidateConcepts: Array<{ id: string; title: string; summary: string }>;
  };
}) {
  return (
    <main>
      <h1>{data.title}</h1>
      <section>
        <h2>核心知识点</h2>
        {data.coreConcepts.map((item) => (
          <article key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
          </article>
        ))}
      </section>
      <section>
        <h2>候选知识点</h2>
        {data.candidateConcepts.map((item) => (
          <article key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/console test -- ingestion-review-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/pages apps/console/src/lib
git commit -m "feat: add ingestion review page"
```

## Task 12: 构建知识库列表与详情页

**Files:**
- Create: `apps/console/src/pages/library-page.tsx`
- Create: `apps/console/src/pages/concept-detail-page.tsx`
- Create: `apps/server/src/library/library.controller.ts`
- Create: `apps/server/src/library/library.service.ts`
- Test: `apps/console/src/pages/library-page.test.tsx`

- [ ] **Step 1: 写知识库页测试**

```tsx
import { render, screen } from "@testing-library/react";
import { LibraryPage } from "./library-page";

describe("LibraryPage", () => {
  it("renders imported concept list", () => {
    render(<LibraryPage concepts={[{ id: "1", title: "RSC", summary: "summary" }]} />);
    expect(screen.getByText("RSC")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/console test -- library-page.test.tsx`
Expected: FAIL，提示 `LibraryPage` 不存在

- [ ] **Step 3: 写最小实现**

```tsx
export function LibraryPage({
  concepts,
}: {
  concepts: Array<{ id: string; title: string; summary: string }>;
}) {
  return (
    <main>
      <h1>知识库</h1>
      {concepts.map((concept) => (
        <article key={concept.id}>
          <h2>{concept.title}</h2>
          <p>{concept.summary}</p>
        </article>
      ))}
    </main>
  );
}
```

```ts
@Controller("concepts")
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  @Get()
  listConcepts() {
    return this.service.listConcepts();
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/console test -- library-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/pages apps/server/src/library
git commit -m "feat: add library list and detail shell"
```

## Task 13: 构建今日复习 API 与页面

**Files:**
- Create: `apps/server/src/review/review.controller.ts`
- Create: `apps/server/src/review/review.service.ts`
- Create: `apps/console/src/pages/review-page.tsx`
- Test: `apps/server/src/review/review.service.spec.ts`

- [ ] **Step 1: 写今日复习测试**

```ts
describe("ReviewService", () => {
  it("returns due cards ordered by dueAt", async () => {
    const prisma = {
      reviewCard: {
        findMany: vi.fn().mockResolvedValue([{ id: "card_1", question: "RSC 是什么？" }]),
      },
    } as any;

    const service = new ReviewService(prisma);
    const cards = await service.getTodayCards();
    expect(cards[0].id).toBe("card_1");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- review.service.spec.ts`
Expected: FAIL，提示 `ReviewService` 不存在

- [ ] **Step 3: 写最小复习服务**

```ts
export class ReviewService {
  constructor(private readonly prisma: any) {}

  async getTodayCards() {
    return this.prisma.reviewCard.findMany({
      where: { dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
    });
  }

  async submitAnswer(cardId: string, rating: "again" | "hard" | "good" | "easy") {
    return { cardId, rating };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- review.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/review apps/console/src/pages/review-page.tsx
git commit -m "feat: add daily review flow"
```

## Task 14: 接入 FSRS 并记录 ReviewLog

**Files:**
- Modify: `apps/server/src/review/review.service.ts`
- Create: `apps/server/src/review/fsrs-adapter.ts`
- Test: `apps/server/src/review/review-submit.spec.ts`

- [ ] **Step 1: 写提交答案测试**

```ts
describe("submitAnswer", () => {
  it("updates due date and creates review log", async () => {
    const prisma = {
      reviewCard: {
        findUnique: vi.fn().mockResolvedValue({ id: "card_1", dueAt: new Date(), reps: 0, lapses: 0 }),
        update: vi.fn().mockResolvedValue({ id: "card_1" }),
      },
      reviewLog: { create: vi.fn() },
    } as any;

    const service = new ReviewService(prisma);
    await service.submitAnswer("card_1", "good");

    expect(prisma.reviewLog.create).toHaveBeenCalled();
    expect(prisma.reviewCard.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- review-submit.spec.ts`
Expected: FAIL，提示缺少 `reviewLog.create` 调用

- [ ] **Step 3: 写最小 FSRS 适配实现**

```ts
import { Rating, fsrs } from "ts-fsrs";

const scheduler = fsrs();

export function scheduleNextReview(card: {
  dueAt: Date;
  stability?: number;
  difficultyFsrs?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps: number;
  lapses: number;
}, rating: "again" | "hard" | "good" | "easy") {
  const mappedRating =
    rating === "again" ? Rating.Again :
    rating === "hard" ? Rating.Hard :
    rating === "easy" ? Rating.Easy :
    Rating.Good;

  return scheduler.next(card as any, new Date(), mappedRating);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- review-submit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/review
git commit -m "feat: add fsrs scheduling and review logs"
```

## Task 15: 实现关键词搜索 API 与页面

**Files:**
- Create: `apps/server/src/search/search.controller.ts`
- Create: `apps/server/src/search/search.service.ts`
- Create: `apps/console/src/pages/search-page.tsx`
- Test: `apps/server/src/search/search.service.spec.ts`

- [ ] **Step 1: 写搜索测试**

```ts
describe("SearchService", () => {
  it("returns imported concepts by keyword", async () => {
    const prisma = {
      concept: {
        findMany: vi.fn().mockResolvedValue([{ id: "1", title: "RSC", summary: "summary" }]),
      },
    } as any;

    const service = new SearchService(prisma);
    const results = await service.search("RSC");
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/server test -- search.service.spec.ts`
Expected: FAIL，提示 `SearchService` 不存在

- [ ] **Step 3: 写最小搜索实现**

```ts
export class SearchService {
  constructor(private readonly prisma: any) {}

  async search(query: string) {
    return this.prisma.concept.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { summary: { contains: query } },
        ],
      },
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/server test -- search.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/search apps/console/src/pages/search-page.tsx
git commit -m "feat: add keyword search flow"
```

## Task 16: 实现 Electron 主进程与本地服务编排

**Files:**
- Create: `apps/shell/src/main.ts`
- Create: `apps/shell/src/preload.ts`
- Create: `apps/shell/src/process-manager.ts`
- Test: `apps/shell/src/process-manager.spec.ts`

- [ ] **Step 1: 写子进程管理测试**

```ts
describe("ProcessManager", () => {
  it("starts api and agent commands", async () => {
    const spawnMock = vi.fn().mockReturnValue({ on: vi.fn() });
    const manager = new ProcessManager(spawnMock as any);

    manager.startAll();

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/shell test -- process-manager.spec.ts`
Expected: FAIL，提示 `ProcessManager` 不存在

- [ ] **Step 3: 写最小实现**

```ts
export class ProcessManager {
  constructor(private readonly spawnImpl: any) {}

  startAll() {
    this.spawnImpl("pnpm", ["--filter", "@learning-os/server", "start:dev"]);
    this.spawnImpl("python", ["apps/generator/app.py"]);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/shell test -- process-manager.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src
git commit -m "feat: orchestrate local api and agent from desktop shell"
```

## Task 17: 写端到端导入与确认流程测试

**Files:**
- Create: `apps/e2e/e2e/import-review.spec.ts`
- Modify: `apps/console/src/pages/import-page.tsx`
- Modify: `apps/console/src/pages/ingestion-review-page.tsx`
- Test: `apps/e2e/e2e/import-review.spec.ts`

- [ ] **Step 1: 写导入到确认页 e2e 测试**

```ts
import { test, expect } from "@playwright/test";

test("user can import text and reach review page", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("标题").fill("React Server Components");
  await page.getByLabel("正文").fill("RSC allows server rendering.");
  await page.getByRole("button", { name: "开始整理" }).click();

  await expect(page.getByText("核心知识点")).toBeVisible();
  await expect(page.getByText("React Server Components")).toBeVisible();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec playwright test apps/e2e/e2e/import-review.spec.ts`
Expected: FAIL，导入提交后未跳转到确认页

- [ ] **Step 3: 写最小联调实现**

```tsx
const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const session = await apiClient.createImport({
    type: "text",
    title: String(formData.get("title")),
    content: String(formData.get("content")),
  });

  navigate(`/ingestions/${session.sessionId}`);
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec playwright test apps/e2e/e2e/import-review.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/e2e apps/console/src/pages
git commit -m "test: cover import to review flow"
```

## Task 18: 写端到端复习与搜索流程测试

**Files:**
- Create: `apps/e2e/e2e/review-flow.spec.ts`
- Modify: `apps/server/src/review/review.service.ts`
- Modify: `apps/server/src/search/search.service.ts`
- Test: `apps/e2e/e2e/review-flow.spec.ts`

- [ ] **Step 1: 写复习与搜索 e2e 测试**

```ts
import { test, expect } from "@playwright/test";

test("user can review imported card and find concept by keyword", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByText("今日复习")).toBeVisible();
  await page.getByRole("button", { name: "Good" }).click();
  await page.goto("/search");
  await page.getByPlaceholder("搜索知识点").fill("RSC");
  await expect(page.getByText("RSC")).toBeVisible();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec playwright test apps/e2e/e2e/review-flow.spec.ts`
Expected: FAIL，复习结果与搜索结果链路未打通

- [ ] **Step 3: 完成最小联调修复**

```ts
await this.prisma.reviewLog.create({
  data: {
    cardId,
    conceptId: card.conceptId,
    rating,
    reviewedAt: new Date(),
    timeSpentSeconds: 0,
    nextDueAt: scheduled.card.due,
  },
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec playwright test apps/e2e/e2e/review-flow.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/e2e apps/server/src/review apps/server/src/search
git commit -m "test: cover review and search flow"
```

## Task 19: 补文档与运行说明

**Files:**
- Create: `README.md`
- Modify: `doc/2026-07-02-learning-os-mvp-design.md`
- Test: `pnpm test`

- [ ] **Step 1: 写 README 运行说明**

```md
# Learning OS

## 本地开发

1. `pnpm install`
2. `pnpm --filter @learning-os/server prisma:generate`
3. `pnpm dev:web`
4. `pnpm dev:api`
5. `cd apps/generator && uvicorn app:app --reload`
6. `pnpm dev:desktop`
```

- [ ] **Step 2: 在设计稿中补计划入口说明**

```md
## 实施入口

对应实现计划见：

- `doc/2026-07-02-learning-os-implementation-plan.md`
```

- [ ] **Step 3: 跑完整测试**

Run: `pnpm test`
Expected: PASS，所有 workspace 单元测试通过

- [ ] **Step 4: 记录 e2e 运行命令**

Run: `pnpm exec playwright test`
Expected: PASS，两个端到端用例通过

- [ ] **Step 5: Commit**

```bash
git add README.md doc/2026-07-02-learning-os-mvp-design.md doc/2026-07-02-learning-os-implementation-plan.md
git commit -m "docs: add implementation handoff"
```

## 自检

### Spec coverage

- 导入内容：Task 7、Task 8、Task 17
- 候选知识点与候选卡片：Task 6、Task 8、Task 11
- 用户确认入库：Task 9、Task 17
- 知识库展示：Task 12
- 今日复习：Task 13、Task 14、Task 18
- 关键词搜索：Task 15、Task 18
- 本地目录初始化与本地优先：Task 3
- Electron + 本地服务架构：Task 16

### Placeholder scan

- 计划中没有 `TBD`、`TODO`、`implement later`
- 每个任务都包含明确文件路径、测试命令、预期结果和提交命令

### Type consistency

- 导入流程统一使用 `IngestionSession`、`ConceptCandidate`、`ReviewCard`
- 前后端页面统一使用“导入中心 / 核心知识点 / 候选知识点 / 今日复习 / 搜索”命名
- 复习评分统一使用 `again | hard | good | easy`
