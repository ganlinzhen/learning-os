# Learning OS 成长工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Learning OS 的默认入口重构为「今日行动优先」的动能蓝紫成长工作台，并让导入、复习、知识库和搜索在统一应用框架中衔接。

**Architecture:** 新增 `GET /dashboard` 聚合接口，以单次查询返回首页所需的待复习、知识沉淀、待确认导入与七日复习轨迹。Console 新增工作台页面作为根路由，并在应用壳中提供统一的导航与搜索入口；现有业务页保留路由与业务逻辑，只替换视觉层级和完成反馈。

**Tech Stack:** React 19、React Router 7、TypeScript、Vite、Vitest、NestJS、node:sqlite、Playwright。

## Global Constraints

- 默认首页必须是工作台；导入页迁移至 `/import`，原有导入、确认入库、知识库、复习和搜索能力不能回归。
- 使用深墨蓝 `#131C38`、主蓝 `#5868F2`、成长紫 `#8764F5`、薄荷绿 `#32BA86`、画布灰白 `#F7F8FC` 与边界灰 `#E4E7EF`。
- 使用系统无衬线字体栈；卡片最大圆角为 12px，输入框和按钮圆角为 8px。
- 不实现排行榜、积分、金币、惩罚式连续打卡、复杂表格或多级数据筛选。
- 常规状态过渡为 150–200ms；所有数据加载用骨架占位，不使用全页居中旋转图标。
- 新增或修改的测试、注释、界面文案统一使用简体中文；设计与说明文档放在 `doc/`。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `packages/contracts/src/dashboard.ts` | 定义 Console 与 Server 共用的工作台 DTO。 |
| `apps/server/src/infrastructure/persistence/prisma.service.ts` | 在本地 SQLite 层提供单次工作台指标聚合。 |
| `apps/server/src/modules/dashboard/*` | 将持久化指标映射为 HTTP `GET /dashboard` 响应。 |
| `apps/console/src/features/dashboard/dashboard-page.tsx` | 渲染今日行动、学习轨迹、知识库概览与快捷操作。 |
| `apps/console/src/app/app-shell.tsx` | 渲染带当前态的侧栏、顶部全局搜索和内容容器。 |
| `apps/console/src/app/router.tsx` | 将根路由切换为工作台，并新增 `/import`。 |
| `apps/console/src/app/styles.css` | 提供动能蓝紫的全局令牌、布局和组件状态。 |
| `apps/console/src/features/search/search-page.tsx` | 接收 `q` 查询参数并保留完整搜索结果页。 |
| `apps/console/src/features/review/review-page.tsx` | 显示复习完成摘要并提供回到工作台的入口。 |
| `apps/e2e/e2e/*.spec.ts` | 覆盖新首页、导入入口、复习完成和搜索回归。 |

## 接口契约

`GET /dashboard` 返回如下稳定结构。`reviewTrend` 始终包含从六天前到今天的七项，缺少记录时 `completedCount` 为 `0`。

```ts
export interface DashboardTrendPointDto {
  date: string;
  completedCount: number;
}

export interface DashboardDto {
  dueReviewCount: number;
  completedTodayCount: number;
  estimatedReviewMinutes: number;
  weeklyGoal: number;
  weeklyCompletedCount: number;
  weeklyProgressPercent: number;
  knowledgeCount: number;
  newKnowledgeThisWeekCount: number;
  reviewableIngestionCount: number;
  reviewTrend: DashboardTrendPointDto[];
}
```

第一版固定每周复习目标为 `25` 张、每张预计复习时长为 `40` 秒。该值由服务端返回，Console 不自行写死目标或时长。

### Task 1: 建立工作台契约与服务端聚合接口

**Files:**

- Create: `packages/contracts/src/dashboard.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/server/src/infrastructure/persistence/prisma.service.ts`
- Create: `apps/server/src/modules/dashboard/dashboard.service.ts`
- Create: `apps/server/src/modules/dashboard/dashboard.controller.ts`
- Create: `apps/server/src/modules/dashboard/dashboard.module.ts`
- Create: `apps/server/src/modules/dashboard/dashboard.service.spec.ts`
- Modify: `apps/server/src/app/app.module.ts`

**Interfaces:**

- Consumes: `review_cards.due_at`、`review_logs.reviewed_at`、`concepts.created_at`、`ingestion_sessions.status`。
- Produces: `DashboardDto` 与不带请求参数的 `GET /dashboard`。

- [ ] **Step 1: 写入共享 DTO 与失败测试**

在 `packages/contracts/src/dashboard.ts` 写入接口契约，并在 `dashboard.service.spec.ts` 先断言服务会透传完整字段。

```ts
import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  it("返回工作台所需的汇总指标", async () => {
    const prisma = {
      getDashboardMetrics: vi.fn().mockResolvedValue({
        dueReviewCount: 12,
        completedTodayCount: 3,
        knowledgeCount: 126,
        newKnowledgeThisWeekCount: 8,
        reviewableIngestionCount: 2,
        weeklyCompletedCount: 18,
        reviewTrend: [{ date: "2026-07-15", completedCount: 3 }],
      }),
    } as any;

    await expect(new DashboardService(prisma).getDashboard()).resolves.toEqual({
      dueReviewCount: 12,
      completedTodayCount: 3,
      estimatedReviewMinutes: 8,
      weeklyGoal: 25,
      weeklyCompletedCount: 18,
      weeklyProgressPercent: 72,
      knowledgeCount: 126,
      newKnowledgeThisWeekCount: 8,
      reviewableIngestionCount: 2,
      reviewTrend: [{ date: "2026-07-15", completedCount: 3 }],
    });
  });
});
```

- [ ] **Step 2: 运行服务测试，确认其因缺少模块而失败**

Run: `pnpm --filter @learning-os/server test -- dashboard.service.spec.ts`

Expected: FAIL，提示找不到 `./dashboard.service`。

- [ ] **Step 3: 实现持久化聚合、服务、控制器与模块**

在 `PrismaService` 的公共方法区域新增 `getDashboardMetrics(now = new Date())`。使用一个数据库连接读取计数与七日趋势；不要在 Console 中从列表拼装这些数据。

```ts
async getDashboardMetrics(now = new Date()) {
  const db = await this.getDb();
  const today = now.toISOString().slice(0, 10);
  const weekStart = new Date(`${today}T00:00:00.000Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartIso = weekStart.toISOString();
  const scalar = db.prepare(`
    select
      (select count(*) from review_cards where due_at <= ?) as due_review_count,
      (select count(*) from review_logs where substr(reviewed_at, 1, 10) = ?) as completed_today_count,
      (select count(*) from concepts) as knowledge_count,
      (select count(*) from concepts where created_at >= ?) as new_knowledge_this_week_count,
      (select count(*) from ingestion_sessions where status = 'reviewable') as reviewable_ingestion_count,
      (select count(*) from review_logs where reviewed_at >= ?) as weekly_completed_count
  `).get(now.toISOString(), today, weekStartIso, weekStartIso) as QueryRow;
  const rows = db.prepare(`
    select substr(reviewed_at, 1, 10) as date, count(*) as completed_count
    from review_logs
    where reviewed_at >= ?
    group by substr(reviewed_at, 1, 10)
  `).all(weekStartIso) as QueryRow[];
  const counts = new Map(rows.map((row) => [String(row.date), Number(row.completed_count)]));
  const reviewTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    return { date, completedCount: counts.get(date) ?? 0 };
  });
  return {
    dueReviewCount: Number(scalar.due_review_count),
    completedTodayCount: Number(scalar.completed_today_count),
    knowledgeCount: Number(scalar.knowledge_count),
    newKnowledgeThisWeekCount: Number(scalar.new_knowledge_this_week_count),
    reviewableIngestionCount: Number(scalar.reviewable_ingestion_count),
    weeklyCompletedCount: Number(scalar.weekly_completed_count),
    reviewTrend,
  };
}
```

在服务中固定业务常量并映射百分比，避免向页面暴露数据库格式。

```ts
const WEEKLY_REVIEW_GOAL = 25;
const REVIEW_SECONDS_PER_CARD = 40;

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | any) {}

  async getDashboard(): Promise<DashboardDto> {
    const metrics = await this.prisma.getDashboardMetrics();
    return {
      ...metrics,
      estimatedReviewMinutes: metrics.dueReviewCount === 0 ? 0 : Math.ceil((metrics.dueReviewCount * REVIEW_SECONDS_PER_CARD) / 60),
      weeklyGoal: WEEKLY_REVIEW_GOAL,
      weeklyProgressPercent: Math.min(100, Math.round((metrics.weeklyCompletedCount / WEEKLY_REVIEW_GOAL) * 100)),
    };
  }
}
```

控制器与模块采用现有 `ReviewModule` 的依赖注入形式。

```ts
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly service: DashboardService) {}

  @Get()
  getDashboard() {
    return this.service.getDashboard();
  }
}
```

```ts
@Module({
  controllers: [DashboardController],
  providers: [AppConfigService, DashboardService, PrismaService],
})
export class DashboardModule {}
```

将 `DashboardModule` 添加到 `AppModule.imports`，并在 `packages/contracts/src/index.ts` 添加 `export * from "./dashboard";`。

- [ ] **Step 4: 运行服务端单元测试与构建**

Run: `pnpm --filter @learning-os/server test -- dashboard.service.spec.ts && pnpm --filter @learning-os/server build`

Expected: 测试通过，NestJS 编译完成且命令退出码为 0。

- [ ] **Step 5: 提交服务端契约与接口**

```bash
git add packages/contracts/src/dashboard.ts packages/contracts/src/index.ts apps/server/src/infrastructure/persistence/prisma.service.ts apps/server/src/modules/dashboard apps/server/src/app/app.module.ts
git commit -m "feat: add dashboard summary endpoint"
```

### Task 2: 新增工作台页面与 API 客户端

**Files:**

- Modify: `apps/console/src/shared/api/api-client.ts`
- Create: `apps/console/src/features/dashboard/dashboard-page.tsx`
- Create: `apps/console/src/features/dashboard/dashboard-page.test.tsx`

**Interfaces:**

- Consumes: `apiClient.getDashboard(): Promise<DashboardDto>` 与 `DashboardDto.reviewTrend`。
- Produces: 工作台页面的「开始复习」「导入内容」「继续整理」链接及确定的加载、空任务和有任务状态。

- [ ] **Step 1: 写入页面失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./dashboard-page";

vi.mock("../../shared/api/api-client", () => ({ apiClient: { getDashboard: vi.fn() } }));

it("展示今日复习任务与快捷操作", async () => {
  const { apiClient } = await import("../../shared/api/api-client");
  vi.mocked(apiClient.getDashboard).mockResolvedValue({
    dueReviewCount: 12, completedTodayCount: 3, estimatedReviewMinutes: 8,
    weeklyGoal: 25, weeklyCompletedCount: 18, weeklyProgressPercent: 72,
    knowledgeCount: 126, newKnowledgeThisWeekCount: 8, reviewableIngestionCount: 2,
    reviewTrend: [
      { date: "2026-07-09", completedCount: 1 }, { date: "2026-07-10", completedCount: 2 },
      { date: "2026-07-11", completedCount: 0 }, { date: "2026-07-12", completedCount: 3 },
      { date: "2026-07-13", completedCount: 4 }, { date: "2026-07-14", completedCount: 5 },
      { date: "2026-07-15", completedCount: 3 },
    ],
  });
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "今天，完成 12 张复习卡片" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "开始复习" })).toHaveAttribute("href", "/review");
  expect(screen.getByRole("link", { name: "导入内容" })).toHaveAttribute("href", "/import");
  expect(screen.getByText("126")).toBeInTheDocument();
});
```

增加第二个测试，传入 `dueReviewCount: 0` 时断言标题为「今天的复习已完成」且主链接为 `/import`。

- [ ] **Step 2: 运行页面测试，确认其因文件不存在而失败**

Run: `pnpm --filter @learning-os/console test -- dashboard-page.test.tsx`

Expected: FAIL，提示找不到 `./dashboard-page`。

- [ ] **Step 3: 实现 API 客户端和页面**

在 `apiClient` 增加以下方法，并从契约包导入 `DashboardDto`。

```ts
getDashboard() {
  return request<DashboardDto>("/dashboard");
},
```

页面只在挂载时请求一次。加载时渲染 `dashboard-skeleton`，请求失败时渲染 `role="alert"` 的「暂时无法加载学习概览，请刷新后重试。」。

```tsx
const [dashboard, setDashboard] = useState<DashboardDto>();
const [errorMessage, setErrorMessage] = useState("");

useEffect(() => {
  void apiClient.getDashboard().then(setDashboard).catch(() => {
    setErrorMessage("暂时无法加载学习概览，请刷新后重试。");
  });
}, []);

if (errorMessage) return <main className="page"><p role="alert">{errorMessage}</p></main>;
if (!dashboard) return <main className="page dashboard-skeleton" aria-label="加载学习概览"><span /><span /><span /></main>;

const hasDueCards = dashboard.dueReviewCount > 0;
const actionHref = hasDueCards ? "/review" : "/import";
const actionLabel = hasDueCards ? "开始复习" : "导入内容";
const actionTitle = hasDueCards
  ? `今天，完成 ${dashboard.dueReviewCount} 张复习卡片`
  : "今天的复习已完成";
```

使用 `Link` 输出以下语义结构：主横幅为 `section.dashboard-hero`，趋势为带 `aria-label="最近七天复习完成量"` 的无序列表，快捷操作为两个可访问名称明确的链接。柱形高度按 `Math.max(...reviewTrend.map(item => item.completedCount), 1)` 归一化，并以 `style={{ "--bar-height": `${...}%` } as CSSProperties}` 写入。

- [ ] **Step 4: 运行 Console 单元测试与类型检查**

Run: `pnpm --filter @learning-os/console test -- dashboard-page.test.tsx && pnpm --filter @learning-os/console lint`

Expected: 两条命令通过且退出码为 0。

- [ ] **Step 5: 提交工作台页面**

```bash
git add apps/console/src/shared/api/api-client.ts apps/console/src/features/dashboard
git commit -m "feat: add learning dashboard page"
```

### Task 3: 重建应用框架、导航与全局搜索

**Files:**

- Modify: `apps/console/src/app/router.tsx`
- Modify: `apps/console/src/app/router.test.tsx`
- Modify: `apps/console/src/app/app-shell.tsx`
- Create: `apps/console/src/app/app-shell.test.tsx`
- Modify: `apps/console/src/features/search/search-page.tsx`
- Create: `apps/console/src/features/search/search-page.test.tsx`

**Interfaces:**

- Consumes: `DashboardPage`、`ImportPage`、`SearchPage`、`useNavigate()` 与 URL 查询参数 `q`。
- Produces: 默认 `/` 工作台、`/import` 导入入口，以及提交顶部搜索后跳转到 `/search?q=<关键词>` 的稳定行为。

- [ ] **Step 1: 改写路由测试并新增全局搜索测试**

将现有路由断言更新为以下顺序，并确保根索引页是工作台。

```ts
expect(routes[0]?.children?.map((route) => ("index" in route && route.index ? "index" : route.path))).toEqual([
  "index", "import", "ingestions/:sessionId", "library", "concepts/:conceptId", "review", "search", "settings",
]);
```

壳组件测试应提交搜索表单并断言导航目标。

```tsx
const router = createMemoryRouter(routes, { initialEntries: ["/"] });
render(<RouterProvider router={router} />);
fireEvent.change(screen.getByRole("searchbox", { name: "全局搜索" }), { target: { value: "React" } });
fireEvent.submit(screen.getByRole("search"));
expect(router.state.location.pathname).toBe("/search");
expect(router.state.location.search).toBe("?q=React");
```

搜索页测试应模拟 `apiClient.search`，从 `/search?q=React` 渲染后断言请求参数为 `React`，并且输入框已有该值。

- [ ] **Step 2: 运行 Console 测试，确认行为仍未实现**

Run: `pnpm --filter @learning-os/console test -- app-shell.test.tsx search-page.test.tsx router.test.tsx`

Expected: FAIL，根页面仍是导入页且没有 `全局搜索` 输入框。

- [ ] **Step 3: 实现路由、壳组件与查询参数驱动的搜索**

将 `router.tsx` 的根子路由改为：

```tsx
{ index: true, element: <DashboardPage /> },
{ path: "import", element: <ImportPage /> },
```

在壳组件中使用语义导航和表单。导航项必须使用 `NavLink` 的函数式 `className`，为当前页添加 `nav-link-active`。

```tsx
const navigate = useNavigate();
const [query, setQuery] = useState("");
const submitSearch = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const normalized = query.trim();
  if (normalized) navigate(`/search?q=${encodeURIComponent(normalized)}`);
};
```

```tsx
<form className="global-search" role="search" onSubmit={submitSearch}>
  <label className="sr-only" htmlFor="global-search">全局搜索</label>
  <input id="global-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识、命令或操作" />
  <kbd>⌘K</kbd>
</form>
```

在 `SearchPage` 使用 `useSearchParams()`。当 `q` 改变且非空时，更新输入状态并调用 `apiClient.search(q)`；空字符串时清空结果，不发送请求。表单提交时使用 `setSearchParams({ q: query.trim() })`，让地址栏和结果状态保持一致。

- [ ] **Step 4: 运行修改范围内的测试与 Console 构建**

Run: `pnpm --filter @learning-os/console test -- app-shell.test.tsx search-page.test.tsx router.test.tsx && pnpm --filter @learning-os/console build`

Expected: 路由、全局搜索和搜索页测试通过，Vite 构建完成。

- [ ] **Step 5: 提交应用框架改造**

```bash
git add apps/console/src/app apps/console/src/features/search/search-page.tsx apps/console/src/features/search/search-page.test.tsx
git commit -m "feat: add dashboard shell navigation"
```

### Task 4: 应用动能蓝紫视觉系统并完善页面状态

**Files:**

- Modify: `apps/console/src/app/styles.css`
- Modify: `apps/console/src/features/ingestion/import-page.tsx`
- Modify: `apps/console/src/features/ingestion/ingestion-review-page.tsx`
- Modify: `apps/console/src/features/library/library-page.tsx`
- Modify: `apps/console/src/features/library/concept-detail-page.tsx`
- Modify: `apps/console/src/features/review/review-page.tsx`
- Modify: `apps/console/src/features/review/review-page.test.tsx` (create if absent)

**Interfaces:**

- Consumes: 现有页面的数据请求与路由；不改变 API 请求载荷。
- Produces: 统一的表面、按钮、表单和空状态；复习完成后可返回工作台的明确反馈。

- [ ] **Step 1: 为复习完成状态写失败测试**

```tsx
it("完成最后一张卡片后提供返回工作台的入口", async () => {
  vi.mocked(apiClient.getTodayCards).mockResolvedValue([{ id: "card_1", question: "问题", answer: "答案" }]);
  vi.mocked(apiClient.submitReview).mockResolvedValue({});
  render(<MemoryRouter><ReviewPage /></MemoryRouter>);
  await screen.findByText("问题");
  fireEvent.click(screen.getByRole("button", { name: "Good" }));
  expect(await screen.findByRole("heading", { name: "今天的复习已完成" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute("href", "/");
});
```

- [ ] **Step 2: 运行复习页面测试，确认完成摘要尚不存在**

Run: `pnpm --filter @learning-os/console test -- review-page.test.tsx`

Expected: FAIL，当前实现只显示普通段落「今天没有待复习卡片」。

- [ ] **Step 3: 替换全局样式并调整页面语义类名**

用以下令牌替换 `styles.css` 顶部声明，并以这些令牌定义 `.app-shell`、`.sidebar`、`.content`、`.page`、`.surface`、`.button-primary`、`.button-secondary`、`.form-control`、`.empty-state`、`.dashboard-*` 与移动端断点；不保留旧的纸张渐变和 `Iowan Old Style` 字体。

```css
:root {
  color: #172238;
  background: #f7f8fc;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  --ink: #131c38;
  --primary: #5868f2;
  --primary-strong: #4656de;
  --growth: #8764f5;
  --success: #32ba86;
  --canvas: #f7f8fc;
  --surface: #ffffff;
  --line: #e4e7ef;
  --muted: #697386;
}

button, input, textarea { font: inherit; }
.surface { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.button-primary { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; border: 0; border-radius: 8px; background: var(--primary); color: #fff; font-weight: 700; text-decoration: none; transition: background 160ms ease, transform 160ms ease; }
.button-primary:hover { background: var(--primary-strong); }
.button-primary:active { transform: translateY(1px); }
.button-primary:disabled { opacity: .55; cursor: not-allowed; }
.form-control { width: 100%; min-height: 40px; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); }
.form-control:focus-visible, .button-primary:focus-visible, a:focus-visible { outline: 3px solid rgba(88, 104, 242, .28); outline-offset: 2px; }
```

将现有 `.card` 全部替换为 `.surface`，并以 `.stack` 只承担纵向间距。导入、整理确认、知识库、详情页为各自的主标题加一行任务说明；不新增嵌套卡片。

在复习页以如下分支替代当前无卡片段落：

```tsx
{!currentCard ? (
  <section className="surface empty-state">
    <h2>今天的复习已完成</h2>
    <p>已完成 {completedCount} 张卡片。下一步可以继续整理新内容，或浏览已有知识。</p>
    <Link className="button-primary" to="/">返回工作台</Link>
  </section>
) : (/* 保留现有单卡片与评分操作 */)}
```

`completedCount` 初始为 `0`，每次 `submitReview` 成功后加一。原本在首次加载就无卡片的情况仍显示「今天没有待复习卡片」，并提供「导入内容」链接，不应伪造已完成数量。

- [ ] **Step 4: 运行复习页与现有功能页测试**

Run: `pnpm --filter @learning-os/console test -- review-page.test.tsx import-page.test.tsx ingestion-review-page.test.tsx library-page.test.tsx`

Expected: 复习完成摘要和原有导入、确认、知识库测试全部通过。

- [ ] **Step 5: 提交视觉与状态改造**

```bash
git add apps/console/src/app/styles.css apps/console/src/features/ingestion apps/console/src/features/library apps/console/src/features/review
git commit -m "feat: apply learning workbench visual system"
```

### Task 5: 更新端到端流程并执行完整验证

**Files:**

- Modify: `apps/e2e/e2e/import-review.spec.ts`
- Modify: `apps/e2e/e2e/review-flow.spec.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: 根路径工作台、`/import` 导入页、`/review` 复习页、`/search?q=` 搜索页与 `GET /dashboard`。
- Produces: 覆盖新用户路径的端到端证据与最新手动验证说明。

- [ ] **Step 1: 先改写端到端断言，使其描述新入口**

在 `import-review.spec.ts` 中，不再于 `/` 填写导入表单。先断言工作台标题和「导入内容」链接，再进入 `/import` 继续原有导入动作。

```ts
await page.goto("/");
await expect(page.getByRole("heading", { name: /今天的复习已完成|今天，完成/ })).toBeVisible();
await page.getByRole("link", { name: "导入内容" }).click();
await expect(page).toHaveURL(/\/import$/);
await page.getByLabel("标题").fill("React Server Components");
```

在 `review-flow.spec.ts` 的最后一张卡片提交后，断言「今天的复习已完成」和「返回工作台」，点击后检查工作台可见。

```ts
await page.getByRole("button", { name: "Good" }).click();
await expect(page.getByRole("heading", { name: "今天的复习已完成" })).toBeVisible();
await page.getByRole("link", { name: "返回工作台" }).click();
await expect(page).toHaveURL(/\/$/);
```

增加从顶部搜索进入结果页的断言：填写 `全局搜索` 为 `React` 并提交，等待 URL 为 `/search?q=React`，再断言知识点标题可见。

- [ ] **Step 2: 运行端到端用例，确认旧根路径假设已失效**

Run: `pnpm --filter @learning-os/e2e test -- import-review.spec.ts review-flow.spec.ts`

Expected: 在更新前 FAIL，原因是根路径不再含导入表单或复习完成文案尚未改造。

- [ ] **Step 3: 更新 README 的验证流程说明**

将「页面级」流程更新为：

```markdown
- 页面级 `工作台 -> 导入 -> 确认入库 -> 知识库查看`
- 页面级 `工作台 -> 今日复习 -> 完成反馈 -> 搜索`
```

不要改动启动、依赖安装或桌面打包说明。

- [ ] **Step 4: 运行完整回归验证**

Run: `pnpm test && pnpm build && pnpm --filter @learning-os/e2e test`

Expected: 所有工作区测试、生产构建与 Playwright 用例通过，命令退出码为 0。

- [ ] **Step 5: 检查改动并提交端到端验证**

```bash
git diff --check
git status --short
git add apps/e2e/e2e/import-review.spec.ts apps/e2e/e2e/review-flow.spec.ts README.md
git commit -m "test: cover learning dashboard workflow"
```

## 自检结果

- 规格覆盖：工作台、动能蓝紫视觉、现有页面、全局搜索、加载与空状态、服务端聚合、响应式规则与端到端回归分别由任务 1–5 覆盖。
- 占位检查：计划中没有未定实现项；每一个新增接口、业务常量、路由和测试命令均已明确。
- 类型一致性：服务端 `DashboardDto`、`apiClient.getDashboard`、`DashboardPage` 与端到端断言统一使用 `/dashboard` 和同一组 DTO 字段。
