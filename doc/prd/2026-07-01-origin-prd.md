# 个人学习 OS 桌面端 PRD

## 1. 产品概述

### 1.1 产品名称

个人学习 OS
暂定英文名：Learning OS

### 1.2 产品定位

Learning OS 是一个面向程序员和知识工作者的 Mac 桌面端个人学习系统。

它可以帮助用户在阅读新书、文章、技术文档、课程内容后，自动整理知识点、生成结构化笔记、建立个人知识库，并通过复习卡片、掌握度记录和学习推荐，帮助用户持续回顾和吸收知识。

### 1.3 产品一句话描述

一个本地优先的 Mac 桌面端 AI 学习系统，帮助用户把输入内容自动沉淀为可搜索、可复习、可追踪掌握程度的个人知识库。

### 1.4 目标用户

第一阶段主要面向：

* 程序员
* 前端 / 后端 / 全栈开发者
* DevOps / 数据库 / 架构学习者
* 产品、设计、运营等知识工作者
* 希望系统化管理个人学习内容的人

### 1.5 核心价值

用户当前的学习痛点：

1. 看了很多文章、书、课程，但难以沉淀成长期知识。
2. 笔记分散，后续很难检索和回顾。
3. 知识点之间缺少结构化关系。
4. 学完之后缺少复习机制，容易遗忘。
5. 不知道自己哪些知识掌握了，哪些还薄弱。
6. 很难根据已有知识自动推荐下一步学习内容。

Learning OS 要解决的问题：

```text
输入新知识
→ 自动整理
→ 形成知识库
→ 自动生成复习卡片
→ 记录掌握程度
→ 推荐下一步学习
```

---

## 2. 产品目标

### 2.1 MVP 目标

MVP 阶段要跑通一个完整学习闭环：

```text
导入一篇文章 / Markdown
→ Agent 自动抽取知识点
→ 生成结构化笔记
→ 生成复习卡片
→ 用户可以搜索知识点
→ 用户可以完成复习
→ 系统记录掌握程度
```

### 2.2 非目标

MVP 阶段暂不做：

* 云同步
* 多用户
* 团队协作
* 移动端 App
* Web 版
* 浏览器插件
* 复杂知识图谱
* 视频课程自动解析
* PDF 深度版式解析
* Obsidian / Logseq 双向同步
* 插件市场
* 账号系统
* 社区内容推荐

---

## 3. 技术边界

### 3.1 技术栈

| 模块    | 技术                                    |
| ----- | ------------------------------------- |
| 桌面端壳  | Electron                              |
| 前端    | React + Vite                          |
| 后端    | NestJS 本地服务                           |
| Agent | Python + LangGraph + LlamaIndex       |
| 数据库   | SQLite                                |
| ORM   | Prisma                                |
| 向量库   | LanceDB，后续可切 Qdrant Local             |
| 文件存储  | 本地文件系统                                |
| 复习算法  | FSRS / ts-fsrs                        |
| 模型接入  | Ollama / Qwen / OpenAI-compatible API |

### 3.2 本地优先原则

Learning OS 的第一阶段是本地优先桌面应用。

数据默认存放在：

```text
~/LearningOS/
```

包括：

```text
~/LearningOS/
  app.db
  config/
  sources/
  notes/
  vectors/
  exports/
  logs/
  backups/
```

### 3.3 进程架构

```text
Electron Main Process
  - 管理窗口
  - 管理菜单
  - 启动 NestJS 本地服务
  - 启动 Python Agent 服务
  - 退出时关闭子进程

React Renderer
  - 桌面端 UI

NestJS Local API
  - 本地业务后端
  - 数据库读写
  - 文件管理
  - 复习系统
  - 搜索聚合
  - 调用 Python Agent

Python Agent Worker
  - 文档解析
  - 知识点抽取
  - 笔记生成
  - 复习卡片生成
  - 向量处理
```

---

## 4. 用户场景

### 4.1 场景一：阅读技术文章后沉淀知识

用户读到一篇关于 React Server Components 的文章。

用户操作：

1. 打开 Learning OS。
2. 进入「导入中心」。
3. 粘贴文章 URL。
4. 选择领域提示：前端技术。
5. 点击「开始整理」。

系统行为：

1. 抓取文章正文。
2. 保存原始内容到本地。
3. 自动提取核心知识点。
4. 生成结构化笔记。
5. 生成复习卡片。
6. 将知识点加入知识库。
7. 用户可以在知识点详情页查看结果。

---

### 4.2 场景二：整理 Markdown 学习笔记

用户已经写了一篇 Markdown 笔记，例如关于 Node.js Event Loop。

用户操作：

1. 进入「导入中心」。
2. 上传或选择本地 Markdown 文件。
3. 点击「开始整理」。

系统行为：

1. 读取 Markdown 内容。
2. 提取知识点。
3. 判断是否和已有知识点重复。
4. 如果存在类似知识点，则合并或提示确认。
5. 生成复习卡片。
6. 保存到知识库。

---

### 4.3 场景三：每日复习

用户打开 App 首页。

系统展示：

1. 今日待复习卡片数量。
2. 推荐复习知识点。
3. 最近薄弱知识点。
4. 最近导入内容。

用户操作：

1. 点击「开始今日复习」。
2. 查看问题。
3. 输入答案或自我回忆。
4. 点击 Again / Hard / Good / Easy。

系统行为：

1. 记录本次复习结果。
2. 调用 FSRS 计算下次复习时间。
3. 更新知识点掌握度。
4. 更新今日学习统计。

---

### 4.4 场景四：搜索已有知识

用户想回顾“React Server Components 和 SSR 的区别”。

用户操作：

1. 进入「搜索」。
2. 输入问题或关键词。

系统行为：

1. 同时执行关键词搜索和语义搜索。
2. 返回相关知识点、笔记、原文片段、复习卡片。
3. 按相关性和掌握度排序。
4. 用户可以跳转到知识点详情页。

---

### 4.5 场景五：查看学习进度

用户想知道自己最近学习情况。

系统展示：

1. 最近 7 天学习记录。
2. 各领域知识点数量。
3. 各领域平均掌握度。
4. 薄弱知识点列表。
5. 已掌握知识点数量。
6. 今日 / 本周复习完成率。

---

## 5. 信息架构

### 5.1 一级导航

MVP 阶段包括：

```text
首页
知识库
导入中心
复习中心
搜索
学习进度
设置
```

### 5.2 页面结构

```text
首页
  - 今日复习
  - 最近导入
  - 推荐学习
  - 薄弱知识点

知识库
  - 全部知识点
  - 按领域查看
  - 按主题查看
  - 按标签查看

知识点详情
  - 摘要
  - 详细解释
  - 结构化笔记
  - 来源
  - 相关知识点
  - 复习卡片
  - 掌握度

导入中心
  - URL 导入
  - Markdown 导入
  - 文本导入
  - 导入任务状态

复习中心
  - 今日复习
  - 待复习卡片
  - 复习历史

搜索
  - 关键词搜索
  - 语义搜索
  - 过滤条件

学习进度
  - 学习统计
  - 掌握度分布
  - 薄弱点
  - 最近学习记录

设置
  - 数据目录
  - 模型配置
  - Agent 配置
  - 备份导出
```

---

## 6. 核心功能需求

## 6.1 首页

### 6.1.1 功能描述

首页是用户打开 App 后的学习仪表盘，用于展示今日需要处理的学习任务。

### 6.1.2 页面内容

首页展示：

* 今日待复习数量
* 今日推荐学习
* 最近导入内容
* 最近学习记录
* 薄弱知识点
* 各领域掌握度概览

### 6.1.3 用户操作

用户可以：

* 点击「开始复习」
* 点击某个知识点进入详情
* 点击某个推荐内容开始学习
* 点击最近导入内容查看整理结果

### 6.1.4 验收标准

* 用户打开 App 后可以看到今日复习数量。
* 用户可以从首页进入复习流程。
* 用户可以看到最近导入的内容。
* 用户可以看到薄弱知识点列表。

---

## 6.2 导入中心

### 6.2.1 功能描述

导入中心用于添加新的学习材料。

MVP 支持：

* URL 导入
* Markdown 文件导入
* 纯文本导入

暂不支持：

* 视频解析
* 音频解析
* 复杂 PDF 解析
* 浏览器插件导入

### 6.2.2 URL 导入

用户输入：

* URL
* 可选领域提示
* 可选标签

系统处理：

1. 创建 Source 记录。
2. 抓取网页正文。
3. 保存原始 HTML / Markdown 到本地。
4. 创建 AgentTask。
5. 调用 Python Agent 处理。
6. 返回整理结果。

### 6.2.3 Markdown 导入

用户输入：

* 本地 Markdown 文件
* 可选领域提示
* 可选标签

系统处理：

1. 复制 Markdown 到本地 sources 目录。
2. 读取正文。
3. 创建 AgentTask。
4. 调用 Python Agent 处理。
5. 写入知识库。

### 6.2.4 纯文本导入

用户输入：

* 标题
* 正文
* 可选领域提示
* 可选标签

系统处理：

1. 将文本保存为本地 Markdown 文件。
2. 创建 Source 记录。
3. 调用 Agent 整理。

### 6.2.5 导入任务状态

系统需要展示：

* pending
* processing
* succeeded
* failed

失败时展示：

* 错误信息
* 重试按钮

### 6.2.6 验收标准

* 用户可以成功导入一篇 URL 文章。
* 用户可以成功导入一个 Markdown 文件。
* 用户可以看到导入任务状态。
* 导入成功后系统会生成知识点、笔记和复习卡片。
* 导入失败时用户可以看到失败原因。

---

## 6.3 知识库

### 6.3.1 功能描述

知识库用于管理所有结构化知识点。

知识点是系统最核心的实体。

### 6.3.2 知识点字段

每个知识点包含：

* 标题
* 摘要
* 详细解释
* 所属领域
* 所属主题
* 标签
* 难度等级
* 重要程度
* 掌握度
* 状态
* 来源
* 关联笔记
* 关联复习卡片
* 创建时间
* 更新时间

### 6.3.3 知识点状态

知识点状态包括：

```text
new：新生成，尚未学习
learning：学习中
reviewing：复习中
mastered：已掌握
```

### 6.3.4 知识点领域

默认领域包括：

```text
前端技术
后端技术
运维
数据库
设计
运营
产品
通用知识
```

### 6.3.5 知识库列表

用户可以按以下条件筛选：

* 领域
* 主题
* 标签
* 掌握度
* 状态
* 难度
* 创建时间
* 更新时间

### 6.3.6 知识点详情页

详情页包含：

* 知识点标题
* 一句话摘要
* 详细解释
* 结构化 Markdown 笔记
* 来源材料
* 关联知识点
* 复习卡片
* 掌握度
* 学习历史

### 6.3.7 编辑能力

MVP 需要支持用户手动编辑：

* 标题
* 摘要
* 详细解释
* 标签
* 所属领域
* 所属主题
* 笔记内容

### 6.3.8 验收标准

* 用户可以查看全部知识点。
* 用户可以按领域筛选知识点。
* 用户可以进入知识点详情页。
* 用户可以编辑知识点基本信息。
* 用户可以查看知识点对应的复习卡片。
* 用户可以查看知识点来源。

---

## 6.4 结构化笔记

### 6.4.1 功能描述

系统会为知识点生成结构化 Markdown 笔记。

### 6.4.2 笔记模板

默认笔记结构：

```markdown
# 知识点标题

## 一句话解释

## 核心概念

## 为什么重要

## 使用场景

## 示例

## 常见误区

## 相关知识

## 来源
```

### 6.4.3 本地文件存储

笔记需要保存到本地目录：

```text
~/LearningOS/notes/
```

示例：

```text
~/LearningOS/notes/frontend/react/react-server-components.md
```

### 6.4.4 数据库关系

数据库中需要保存：

* note id
* concept id
* source id
* title
* markdown content
* local path
* created at
* updated at

### 6.4.5 验收标准

* Agent 可以为知识点生成 Markdown 笔记。
* 用户可以在 App 中查看笔记。
* 用户可以编辑笔记。
* 笔记可以保存为本地 Markdown 文件。
* 笔记内容和数据库记录保持一致。

---

## 6.5 Agent 自动整理

### 6.5.1 功能描述

Agent 自动整理是 Learning OS 的核心能力。

用户导入新内容后，系统自动完成：

* 内容解析
* 内容清洗
* 文档切块
* 知识点抽取
* 领域分类
* 主题分类
* 标签生成
* 笔记生成
* 复习卡片生成
* 知识点关系生成
* 重复知识点判断

### 6.5.2 Agent 处理流程

```text
Start
  ↓
Load Source
  ↓
Parse Content
  ↓
Clean Content
  ↓
Chunk Content
  ↓
Generate Embeddings
  ↓
Extract Concepts
  ↓
Classify Domain / Topic
  ↓
Detect Duplicate Concepts
  ↓
Generate Notes
  ↓
Generate Review Cards
  ↓
Build Relations
  ↓
Return Result
  ↓
End
```

### 6.5.3 输入

Agent 输入：

```json
{
  "taskId": "task_001",
  "sourceId": "src_001",
  "type": "url",
  "localPath": "/Users/xxx/LearningOS/sources/url/src_001.md",
  "domainHint": "frontend",
  "tags": ["React"]
}
```

### 6.5.4 输出

Agent 输出：

```json
{
  "concepts": [
    {
      "title": "React Server Components",
      "summary": "React Server Components 是一种在服务端执行组件逻辑的 React 架构能力。",
      "domain": "frontend",
      "topic": "React",
      "level": "intermediate",
      "importanceScore": 85,
      "tags": ["React", "RSC", "SSR"],
      "evidenceChunkIds": ["chunk_1", "chunk_3"]
    }
  ],
  "notes": [],
  "reviewCards": [],
  "relations": [],
  "chunks": []
}
```

### 6.5.5 重复知识点判断

Agent 需要根据已有知识点判断是否重复。

规则：

```text
相似度 >= 0.88：默认合并
0.75 <= 相似度 < 0.88：标记为可能重复，用户确认
相似度 < 0.75：新建知识点
```

### 6.5.6 AgentTask 状态

任务状态：

```text
pending
running
succeeded
failed
```

### 6.5.7 验收标准

* 用户导入内容后会创建 AgentTask。
* AgentTask 状态可查询。
* Agent 成功后会返回结构化知识点。
* 系统可以生成笔记。
* 系统可以生成复习卡片。
* Agent 失败后系统会记录错误信息。
* 用户可以重试失败任务。

---

## 6.6 复习系统

### 6.6.1 功能描述

复习系统用于帮助用户长期记忆知识点。

系统基于复习卡片和 FSRS 算法计算下次复习时间。

### 6.6.2 复习卡片类型

MVP 支持：

```text
qa：普通问答
cloze：填空
choice：选择题
explain：解释题
code：代码题
```

### 6.6.3 复习流程

```text
用户进入复习中心
  ↓
系统展示今日待复习卡片
  ↓
用户查看问题
  ↓
用户回忆或输入答案
  ↓
用户查看参考答案
  ↓
用户选择 Again / Hard / Good / Easy
  ↓
系统记录 ReviewLog
  ↓
FSRS 计算下次复习时间
  ↓
更新 ReviewCard
  ↓
更新 Concept masteryScore
```

### 6.6.4 复习反馈

用户反馈包括：

```text
Again：完全不会
Hard：勉强想起来
Good：正常记住
Easy：非常熟悉
```

### 6.6.5 掌握度计算

知识点掌握度范围：

```text
0 - 100
```

MVP 简化计算：

```text
masteryScore =
  复习表现得分 * 80%
+ 用户自评得分 * 20%
```

状态转换：

```text
new
  ↓
learning
  ↓
reviewing
  ↓
mastered
```

规则：

```text
new：刚生成，还没有学习或复习
learning：用户打开过详情页或完成过一次复习
reviewing：完成过至少 2 次复习
mastered：masteryScore >= 85，且最近多次反馈为 Good / Easy
```

### 6.6.6 验收标准

* 用户可以看到今日待复习卡片。
* 用户可以完成一张复习卡片。
* 用户可以选择 Again / Hard / Good / Easy。
* 系统会记录本次复习日志。
* 系统会更新下次复习时间。
* 系统会更新知识点掌握度。

---

## 6.7 搜索系统

### 6.7.1 功能描述

搜索系统用于帮助用户快速找到已有知识。

MVP 支持：

* 关键词搜索
* 语义搜索
* 标签过滤
* 领域过滤

### 6.7.2 搜索范围

搜索对象包括：

* 知识点
* 笔记
* 来源材料
* 复习卡片

### 6.7.3 搜索方式

NestJS 聚合：

```text
SQLite 关键词搜索
+
LanceDB 向量搜索
+
结果融合排序
```

### 6.7.4 搜索结果展示

搜索结果展示：

* 类型：知识点 / 笔记 / 来源 / 卡片
* 标题
* 摘要
* 匹配片段
* 所属领域
* 标签
* 掌握度
* 相关性分数

### 6.7.5 验收标准

* 用户可以输入关键词搜索。
* 用户可以获得相关知识点结果。
* 用户可以获得语义相关结果。
* 用户可以通过搜索结果跳转到详情页。
* 用户可以按领域或标签过滤。

---

## 6.8 学习推荐

### 6.8.1 功能描述

学习推荐用于帮助用户知道下一步应该复习或学习什么。

MVP 采用规则推荐，不做复杂机器学习。

### 6.8.2 推荐类型

推荐包括：

* 今日到期复习
* 薄弱知识点
* 最近学习相关知识点
* 重要但未掌握知识点
* 关联前置知识

### 6.8.3 推荐打分

MVP 推荐公式：

```text
score =
  dueScore * 0.35
+ weakScore * 0.25
+ relatedRecentScore * 0.20
+ importanceScore * 0.15
+ noveltyScore * 0.05
```

### 6.8.4 验收标准

* 首页可以展示今日推荐。
* 系统可以推荐薄弱知识点。
* 系统可以推荐到期复习内容。
* 推荐结果可以跳转到知识点详情或复习页。

---

## 6.9 学习进度

### 6.9.1 功能描述

学习进度用于展示用户整体学习情况。

### 6.9.2 展示内容

MVP 展示：

* 总知识点数量
* 各领域知识点数量
* 已掌握知识点数量
* 待复习卡片数量
* 最近 7 天复习次数
* 最近 7 天新增知识点数量
* 薄弱知识点列表
* 平均掌握度

### 6.9.3 验收标准

* 用户可以查看整体知识库统计。
* 用户可以查看各领域知识点数量。
* 用户可以查看最近学习记录。
* 用户可以查看薄弱知识点。

---

## 6.10 设置

### 6.10.1 功能描述

设置用于管理本地数据、模型配置和系统配置。

### 6.10.2 设置项

MVP 支持：

* 数据目录设置
* 模型 Provider 设置
* 模型名称设置
* Embedding 模型设置
* Agent 服务端口
* NestJS 本地服务端口
* 备份导出
* 日志查看

### 6.10.3 模型配置

支持：

```text
Ollama
OpenAI-compatible API
Qwen API
```

配置字段：

* provider
* baseURL
* apiKey
* modelName
* embeddingModelName

### 6.10.4 验收标准

* 用户可以查看当前数据目录。
* 用户可以设置模型 Provider。
* 用户可以测试模型连接。
* 用户可以导出备份。
* 用户可以查看日志位置。

---

## 7. 数据模型

### 7.1 Source

```ts
Source {
  id: string
  type: 'url' | 'pdf' | 'markdown' | 'text' | 'video' | 'book'
  title: string
  url?: string
  author?: string
  localPath: string
  contentHash: string
  status: 'pending' | 'processing' | 'processed' | 'failed'
  createdAt: Date
  updatedAt: Date
}
```

### 7.2 Concept

```ts
Concept {
  id: string
  domainId: string
  topicId?: string

  title: string
  slug: string
  summary: string
  explanation?: string

  level: 'beginner' | 'intermediate' | 'advanced'
  status: 'new' | 'learning' | 'reviewing' | 'mastered'

  masteryScore: number
  importanceScore: number

  tags: string[]
  notePath?: string

  createdAt: Date
  updatedAt: Date
}
```

### 7.3 Topic

```ts
Topic {
  id: string
  domainId: string
  name: string
  slug: string
  description?: string
  parentTopicId?: string
}
```

### 7.4 Domain

```ts
Domain {
  id: string
  name: string
  slug: string
  description?: string
  sortOrder: number
}
```

### 7.5 Note

```ts
Note {
  id: string
  conceptId: string
  sourceId?: string

  title: string
  contentMarkdown: string
  localPath?: string

  noteType: 'summary' | 'deep_dive' | 'example' | 'comparison' | 'pitfall'

  createdAt: Date
  updatedAt: Date
}
```

### 7.6 ReviewCard

```ts
ReviewCard {
  id: string
  conceptId: string
  sourceId?: string

  type: 'qa' | 'cloze' | 'choice' | 'explain' | 'code'
  question: string
  answer: string
  explanation?: string

  difficulty: number

  dueAt: Date
  lastReviewedAt?: Date

  stability: number
  difficultyFsrs: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: 'new' | 'learning' | 'review' | 'relearning'

  createdAt: Date
  updatedAt: Date
}
```

### 7.7 ReviewLog

```ts
ReviewLog {
  id: string
  cardId: string
  conceptId: string

  rating: 'again' | 'hard' | 'good' | 'easy'
  responseText?: string
  isCorrect?: boolean

  reviewedAt: Date
  timeSpentSeconds: number

  previousDueAt?: Date
  nextDueAt: Date
}
```

### 7.8 ConceptRelation

```ts
ConceptRelation {
  id: string

  fromConceptId: string
  toConceptId: string

  relationType:
    | 'prerequisite'
    | 'related'
    | 'similar'
    | 'contrast'
    | 'part_of'
    | 'applies_to'

  confidence: number
  createdBy: 'agent' | 'user'

  createdAt: Date
}
```

### 7.9 AgentTask

```ts
AgentTask {
  id: string

  type:
    | 'ingest_source'
    | 'extract_concepts'
    | 'generate_notes'
    | 'generate_cards'
    | 'build_relations'
    | 'rebuild_embeddings'

  status: 'pending' | 'running' | 'succeeded' | 'failed'

  input: JSON
  output?: JSON
  error?: string

  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
}
```

---

## 8. API 需求

### 8.1 Source API

```http
POST /api/sources/import
```

创建导入任务。

请求：

```json
{
  "type": "url",
  "url": "https://example.com/article",
  "domainHint": "frontend",
  "tags": ["React"]
}
```

响应：

```json
{
  "sourceId": "src_001",
  "taskId": "task_001",
  "status": "pending"
}
```

---

```http
GET /api/sources
```

获取来源列表。

---

```http
GET /api/sources/:id
```

获取来源详情。

---

### 8.2 AgentTask API

```http
GET /api/agent-tasks/:id
```

获取任务状态。

---

```http
POST /api/agent-tasks/:id/retry
```

重试任务。

---

### 8.3 Concept API

```http
GET /api/concepts
```

查询知识点列表。

支持参数：

```text
domain
topic
tag
status
keyword
masteryMin
masteryMax
```

---

```http
GET /api/concepts/:id
```

查询知识点详情。

---

```http
PATCH /api/concepts/:id
```

编辑知识点。

---

```http
DELETE /api/concepts/:id
```

删除知识点。

---

### 8.4 Review API

```http
GET /api/reviews/today
```

获取今日待复习卡片。

---

```http
POST /api/reviews/:cardId/answer
```

提交复习结果。

请求：

```json
{
  "rating": "good",
  "responseText": "这是我的回答",
  "timeSpentSeconds": 35
}
```

---

### 8.5 Search API

```http
GET /api/search?q=react server components
```

搜索知识库内容。

---

### 8.6 Recommendation API

```http
GET /api/recommendations/today
```

获取今日推荐。

---

## 9. 本地文件存储需求

### 9.1 数据目录

默认目录：

```text
~/LearningOS/
```

用户可以在设置中修改。

### 9.2 目录结构

```text
~/LearningOS/
  app.db

  config/
    app.config.json

  sources/
    url/
    markdown/
    text/
    pdf/

  notes/
    frontend/
    backend/
    devops/
    database/
    design/
    operation/
    product/

  vectors/
    lancedb/

  exports/
    markdown/
    json/
    anki/

  logs/
    electron.log
    nest.log
    agent.log

  backups/
```

### 9.3 文件命名规则

文件名应满足：

* 使用 slug
* 避免特殊字符
* 避免重名覆盖
* 支持中文标题转拼音或保留中文 slug

示例：

```text
react-server-components.md
nodejs-event-loop.md
postgres-index.md
```

---

## 10. 非功能需求

### 10.1 性能

MVP 性能目标：

* App 冷启动时间小于 5 秒。
* 首页加载时间小于 1 秒。
* 知识点列表 1000 条以内滚动流畅。
* 普通文章导入处理时间可接受，不阻塞 UI。
* 搜索响应时间小于 1 秒，复杂语义搜索可小于 3 秒。

### 10.2 稳定性

系统需要保证：

* Agent 失败不会导致 App 崩溃。
* NestJS 服务异常时 Electron 能提示用户。
* Python Agent 异常时任务状态变为 failed。
* 数据写入失败需要保留错误日志。
* 应用退出时安全关闭子进程。

### 10.3 数据安全

MVP 要求：

* 数据默认保存在本机。
* API Key 不明文展示。
* 用户可以导出备份。
* 用户可以打开数据目录。
* 删除知识点前需要二次确认。

### 10.4 可维护性

要求：

* React、NestJS、Python Agent 分层清晰。
* Agent prompt 独立存放。
* 数据模型有迁移机制。
* 关键任务有日志。
* 本地服务端口可配置。

### 10.5 可扩展性

后续应支持：

* PDF 深度解析
* Obsidian / Logseq 同步
* 云同步
* 浏览器插件
* 多端同步
* 知识图谱可视化
* 插件系统

---

## 11. MVP 版本范围

### 11.1 MVP 必须包含

1. Electron Mac 桌面端 App。
2. React + Vite 前端。
3. NestJS 本地 API。
4. SQLite 数据库。
5. 本地数据目录初始化。
6. URL 导入。
7. Markdown 导入。
8. Agent 自动抽取知识点。
9. Agent 自动生成结构化笔记。
10. Agent 自动生成复习卡片。
11. 知识点列表。
12. 知识点详情。
13. 今日复习。
14. 复习结果记录。
15. 掌握度更新。
16. 关键词搜索。
17. 语义搜索。
18. 设置页。
19. 日志记录。
20. 本地备份导出。

### 11.2 MVP 不包含

1. 用户账号。
2. 云同步。
3. 团队协作。
4. 移动端。
5. Web 端。
6. 浏览器插件。
7. 视频解析。
8. 复杂 PDF 解析。
9. 知识图谱编辑。
10. 插件市场。
11. 社区学习内容推荐。

---

## 12. 版本规划

### 12.1 V0.1：基础桌面壳

目标：跑通 Electron + React + NestJS。

功能：

* Electron App 启动
* React 页面展示
* NestJS 本地服务启动
* `/health` 检查
* 本地数据目录初始化
* SQLite 初始化

验收：

* 用户打开 App 可以看到首页。
* React 可以成功请求 NestJS `/health`。
* 本地目录 `~/LearningOS` 自动创建。

---

### 12.2 V0.2：知识库基础

目标：完成知识点的基本管理。

功能：

* Domain / Topic 初始化
* Concept CRUD
* Note CRUD
* Source CRUD
* 知识点列表
* 知识点详情
* Markdown 笔记展示

验收：

* 用户可以手动创建知识点。
* 用户可以查看知识点详情。
* 用户可以编辑知识点笔记。

---

### 12.3 V0.3：Agent 导入

目标：完成内容导入和自动整理。

功能：

* URL 导入
* Markdown 导入
* AgentTask
* Python Agent 服务
* 知识点抽取
* 笔记生成
* 复习卡片生成

验收：

* 用户导入一篇文章后，系统可以生成知识点。
* 系统可以生成 Markdown 笔记。
* 系统可以生成至少 3 张复习卡片。

---

### 12.4 V0.4：复习系统

目标：完成学习闭环。

功能：

* ReviewCard
* ReviewLog
* 今日复习
* Again / Hard / Good / Easy
* FSRS 调度
* masteryScore 更新

验收：

* 用户可以完成今日复习。
* 系统可以计算下一次复习时间。
* 知识点掌握度会随复习结果变化。

---

### 12.5 V0.5：搜索和推荐

目标：提升知识回顾能力。

功能：

* 关键词搜索
* LanceDB 语义搜索
* 搜索结果融合
* 今日推荐
* 薄弱知识点推荐

验收：

* 用户可以搜索已有知识。
* 用户可以看到语义相关结果。
* 首页可以展示推荐复习内容。

---

### 12.6 V1.0：可日常使用版本

目标：达到个人长期使用标准。

功能：

* 稳定导入
* 稳定复习
* 稳定搜索
* 设置页完善
* 日志完善
* 备份导出
* 错误恢复
* 基础 UI 优化

验收：

* 用户可以连续使用 2 周不丢数据。
* 常见 Agent 失败可重试。
* 本地备份可恢复。
* 核心学习闭环稳定可用。

---

## 13. 核心指标

### 13.1 产品指标

MVP 阶段关注：

* 成功导入内容数量
* 成功生成知识点数量
* 成功生成复习卡片数量
* 今日复习完成率
* 知识点搜索次数
* 用户手动编辑知识点次数
* Agent 任务成功率
* Agent 任务失败率

### 13.2 体验指标

关注：

* 导入成功率
* 搜索命中满意度
* 复习完成率
* 知识点重复率
* Agent 输出可用率
* 用户手动修改比例

---

## 14. 风险与应对

### 14.1 Agent 输出不稳定

风险：

* 生成的知识点不准确。
* 笔记结构不稳定。
* 复习卡片质量不高。

应对：

* 使用严格 JSON Schema。
* 每个 Agent 节点单独 prompt。
* 保留用户编辑能力。
* Agent 输出进入草稿态，用户可确认。
* 记录低质量输出样本用于优化 prompt。

---

### 14.2 重复知识点过多

风险：

* 多篇文章会生成大量重复知识点。

应对：

* 使用向量相似度检测。
* 高相似度自动合并。
* 中等相似度提示用户确认。
* 知识点标题标准化。
* 后续增加“合并知识点”功能。

---

### 14.3 桌面端进程管理复杂

风险：

* Electron、NestJS、Python Agent 三个进程启动和退出管理复杂。

应对：

* Electron Main 统一管理子进程。
* 每个服务提供 `/health`。
* 启动失败时给出明确提示。
* 日志分别写入 electron.log、nest.log、agent.log。
* 退出 App 时关闭所有子进程。

---

### 14.4 本地文件和数据库不一致

风险：

* 笔记文件被手动修改或删除。
* 数据库记录和本地文件不一致。

应对：

* Note 表保存 localPath。
* 每次打开笔记时检查文件是否存在。
* 文件缺失时提示重新生成或恢复。
* 后续增加文件扫描和修复功能。

---

### 14.5 模型调用成本或速度问题

风险：

* 云模型成本较高。
* 本地模型速度较慢。

应对：

* 支持本地 Ollama。
* 支持 OpenAI-compatible API。
* 允许用户切换模型。
* Agent 任务异步执行。
* 长文档分块处理。
* 缓存 embedding 和解析结果。

---

## 15. 后续扩展方向

### 15.1 浏览器插件

用于一键收藏文章到 Learning OS。

### 15.2 Obsidian / Logseq 集成

支持将 notes 目录作为 Obsidian Vault 或 Logseq Graph 使用。

### 15.3 PDF 深度解析

支持书籍、论文、课程 PDF 的章节化解析。

### 15.4 知识图谱

支持可视化展示知识点之间的关系。

### 15.5 学习路径生成

根据用户已有知识和目标，生成学习路线。

### 15.6 云同步

支持多设备同步数据。

### 15.7 Anki 导出

将复习卡片导出为 Anki 包。

---

## 16. 第一版开发优先级

### P0

必须完成：

* Electron App 启动
* React UI
* NestJS Local API
* SQLite 初始化
* 本地数据目录
* Source / Concept / Note / ReviewCard 数据模型
* URL / Markdown 导入
* Python Agent 调用
* 知识点生成
* 笔记生成
* 复习卡片生成
* 今日复习
* 复习记录

### P1

重要但可稍后：

* 语义搜索
* 推荐系统
* 重复知识点检测
* 本地备份
* 设置页
* 日志查看
* 标签筛选
* 掌握度统计

### P2

后续增强：

* PDF 解析
* 知识图谱
* Obsidian 集成
* 浏览器插件
* Anki 导出
* 自动学习路径
* 云同步

---

## 17. MVP 验收总标准

当以下流程全部跑通时，MVP 视为完成：

1. 用户打开 Mac App。
2. App 自动启动 NestJS 本地服务。
3. App 自动启动 Python Agent 服务。
4. 用户导入一篇 URL 文章。
5. 系统保存原文到本地。
6. Agent 自动生成知识点。
7. 系统生成结构化 Markdown 笔记。
8. 系统生成复习卡片。
9. 用户可以在知识库中看到知识点。
10. 用户可以进入知识点详情页查看笔记。
11. 用户可以在复习中心看到复习卡片。
12. 用户完成一次复习。
13. 系统记录复习结果。
14. 系统更新下次复习时间。
15. 系统更新知识点掌握度。
16. 用户可以通过搜索找到该知识点。

---

## 18. 总结

Learning OS 的核心不是“AI 问答”，而是一个完整的个人学习闭环。

产品第一阶段应该聚焦：

```text
导入内容
→ 自动整理
→ 生成知识点
→ 生成笔记
→ 生成复习卡片
→ 记录复习
→ 更新掌握度
```

只要这个闭环稳定，产品就具备长期价值。

MVP 的技术架构为：

```text
Electron
+ React + Vite
+ NestJS
+ SQLite + Prisma
+ Python Agent
+ LangGraph + LlamaIndex
+ LanceDB
+ 本地文件系统
+ FSRS
```

产品原则：

```text
本地优先
结构化沉淀
可搜索
可复习
可追踪掌握度
可持续扩展
```
