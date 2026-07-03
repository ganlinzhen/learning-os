# ADR: 目录结构规范化

## 背景

项目从 MVP 进入持续迭代阶段后，原有目录中同时存在命名漂移、重复配置、跨语言边界不清和共享契约命名过宽的问题。

## 决策

1. 将共享包从 `packages/shared` 调整为 `packages/contracts`。
2. 将 Console 调整为 `app/features/shared` 分层。
3. 将 Server 调整为 `app/modules/infrastructure` 分层。
4. 将 Generator 调整为标准 Python `src/` 包布局，并通过 `pyproject.toml` 安装。
5. 删除重复配置文件与混入源码目录的 JS 产物文件。

## 影响

- 新增功能时，优先落到业务 `features` / `modules` 下，而不是继续平铺到 `src/` 根目录。
- 跨端共享类型统一放到 `packages/contracts`，避免“shared” 目录持续膨胀。
- Python 服务可以独立安装、测试与运行，减少对仓库根目录环境约定的耦合。
