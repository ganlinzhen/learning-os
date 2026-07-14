# URL / Markdown 导入、任务重试与结构化笔记设计

## 目标

将当前仅支持文本的同步导入流程扩展为可自动抓取网页的 URL 导入和 Markdown 导入；让生成过程以可观察、可重试的持久化任务运行；并在用户确认后，为每个知识点生成数据库记录和本地 Markdown 笔记。

## 范围

- 支持文本、URL、Markdown 三种导入方式。
- URL 由本地服务抓取网页并提取标题、正文。
- 导入任务记录状态、错误摘要、尝试次数和时间；仅由用户点击触发重试。
- 用户确认候选知识点后，生成结构化笔记，写入 SQLite 和本地 `notes/` 目录。
- 前端展示处理中、失败、可审核和已入库状态。

不包含：自动后台重试、复杂网页登录/反爬绕过、图片或 PDF 解析、用户编辑 Markdown 后反向同步数据库、批量导入。

## 总体流程

```text
提交文本 / URL / Markdown
  -> 保存 Source 与 IngestionSession
  -> 创建 AgentTask（pending）
  -> 执行抓取（URL）与候选生成（running）
  -> 成功：保存候选结果，任务 succeeded，会话 reviewable
  -> 失败：任务 failed，会话 failed，保留错误摘要
  -> 用户点击重试：递增尝试次数，重新执行
  -> 用户确认候选结果：写入 Concept、ReviewCard、Note 和 notes/*.md
  -> 全部写入成功：会话 imported
```

## 导入与任务模型

### Source

- `text`：直接保存用户输入的标题和正文。
- `markdown`：保存用户粘贴的 Markdown；标题为空时从第一个一级标题推断，否则使用用户标题。
- `url`：保存原始 URL；服务端只允许 `http` 或 `https`，在受限超时内下载 HTML，提取 `title` 与正文文本后持久化。

URL 抓取失败、响应不是 HTML、正文为空或过短，均应在任务中记录稳定的错误码与面向用户的简短错误说明；不得将错误页或空正文提交给生成服务。

### AgentTask

运行时 SQLite 新增真实的 `agent_tasks` 表，而不是在导入服务中使用内存回退对象。每个任务至少包含：

- `id`、`sessionId`、`type`（当前为 `ingestion_generation`）
- `status`：`pending`、`running`、`succeeded`、`failed`
- `attemptCount`、`lastErrorCode`、`lastErrorMessage`
- `startedAt`、`finishedAt`、`createdAt`、`updatedAt`

一次导入对应一个会话和最新任务。创建导入时先持久化会话和任务，接口随即返回 `sessionId`；执行完成后再更新状态。失败不删除原始来源或任务记录。

### 状态与重试

`IngestionSession` 的状态继续代表业务进度：

```text
created -> processing -> reviewable -> imported
                     -> failed
```

- 创建或重试时：会话为 `processing`，任务依次变为 `pending`、`running`。
- 生成成功时：任务为 `succeeded`，会话为 `reviewable`。
- 抓取或生成失败时：任务和会话均为 `failed`。
- 只有 `failed` 会话能调用重试接口。重试复用已保存来源；URL 重新抓取，文本和 Markdown 使用已保存正文。旧候选结果会被清除后重新生成，任务尝试次数递增。
- 只有 `reviewable` 会话能确认入库，防止重复确认创建重复知识点或笔记。

## 接口与前端交互

共享契约与 API 增加任务摘要：任务状态、尝试次数、最后错误、是否可重试。新增 `POST /ingestions/:sessionId/retry`。

导入页提供三种输入模式：

- 文本：标题与正文。
- URL：URL 必填，标题可选。
- Markdown：Markdown 正文必填，标题可选。

提交后页面跳转到导入详情，并在 `processing` 时定时获取详情。`failed` 时显示错误摘要和“重试”按钮；`reviewable` 时展示原有审核与确认交互；`imported` 时显示已完成提示。轮询在组件卸载、状态不再为处理中或请求失败时停止。

## 结构化笔记与本地保存

确认入库时，每一个已选中的候选知识点都生成一条 `Note` 和一个 Markdown 文件。

Markdown 保存于应用根目录的 `notes/`，文件名使用可读标题与稳定知识点 ID，避免同名冲突。其内容使用稳定结构：

```markdown
---
conceptId: <知识点 ID>
sourceId: <来源 ID>
createdAt: <ISO 时间>
tags: []
---

# <知识点标题>

## 摘要
<摘要>

## 核心解释
<解释>

## 证据
<证据片段>

## 复习卡片
### <问题>
<答案>
```

SQLite 的 `notes` 表保存标题、完整 Markdown 正文和文件绝对路径；必要时扩展运行时表结构与 Prisma 描述。应用查询继续以 SQLite 为准，Markdown 文件作为用户可直接查看、备份和迁移的本地副本。

确认入库遵循“文件先写、数据库后提交”的顺序：服务端先为每个待入库知识点预分配稳定 ID，并将 Markdown 原子写入最终路径；文件全部成功后，使用一次 SQLite 事务创建 `Concept`、`ReviewCard`、`Note` 并将会话更新为 `imported`。数据库事务失败时，服务端删除本次新建的 Markdown 文件；文件写入失败时，不执行数据库写入。这样任一步失败都不会产生可见的部分入库结果或重复知识点。

## 测试与验收

测试必须先覆盖以下行为：

- URL 正常抓取、标题/正文提取，以及 URL、非 HTML、空正文和超时失败。
- Markdown 标题推断与用户显式标题优先。
- 任务创建、状态流转、失败记录、用户手动重试和尝试次数递增。
- 失败重试清理旧候选结果；非失败任务不能重试；非 `reviewable` 会话不能确认。
- 确认入库同时创建 `Note`、SQLite 记录和 Markdown 文件，文件内容包含规定结构。
- 前端导入类型切换、处理中刷新、失败提示与重试按钮。

验收时，用户可手动完成：输入一条公开网页 URL，等待生成候选结果；制造一次抓取或模型调用失败后点击重试；确认候选知识点后，在应用数据目录 `notes/` 找到对应 Markdown，并在知识库中看到相应知识点。
