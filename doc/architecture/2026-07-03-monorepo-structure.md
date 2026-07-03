# Learning OS Monorepo 结构说明

## 目标

统一 Learning OS 在前端、服务端、桌面壳与 Python 生成服务之间的职责边界，让目录结构能够直接表达模块职责，而不是靠 README 或口头约定补充理解。

## 顶层约定

- `apps/console`：React 用户操作台
- `apps/server`：NestJS 本地服务
- `apps/generator`：Python 候选生成服务
- `apps/shell`：Electron 桌面壳
- `apps/e2e`：Playwright 端到端测试
- `packages/contracts`：Console 与 Server 共享 DTO、类型与常量

## 前端约定

`apps/console/src` 采用三层结构：

- `app/`：应用入口、路由、壳层布局、全局样式
- `features/`：按业务能力拆分页面与组件
- `shared/`：前端内部复用能力，例如 API 客户端

## 服务端约定

`apps/server/src` 采用：

- `app/`：应用装配与启动辅助
- `modules/`：按业务能力拆分的控制器、模块与服务
- `infrastructure/`：配置、持久化、文件存储、外部服务调用

当前项目体量下，`domain/` 可按需要逐步引入，不做空目录预置。

## Python 服务约定

`apps/generator` 采用标准 Python 包布局：

- `src/learning_os_generator/api`：FastAPI 入口
- `src/learning_os_generator/domain`：候选生成规则
- `src/learning_os_generator/schemas`：Pydantic 模型

通过 `pyproject.toml` 管理依赖与可编辑安装。
