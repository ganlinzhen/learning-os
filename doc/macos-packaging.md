# macOS 本地打包方案

## 目标

在没有云端服务的前提下，把以下组件一起打进 macOS 分发产物：

- `apps/console`：前端静态资源
- `apps/server`：本地 Node 服务
- `apps/generator`：本地 Python 生成服务二进制
- `apps/shell`：Electron 桌面壳

最终分发形式采用：

- 开发/验收产物：`.app`
- 对外分发产物：`.zip`

## 打包链路

1. 构建前端静态资源：`apps/console/dist`
2. 构建服务端生产产物：`apps/server/dist-prod`
3. 使用 PyInstaller 构建生成服务：`apps/generator/dist/learning-os-generator`
4. 构建 Electron 主进程与 preload：`apps/shell/dist`
5. 用 `electron-builder --dir` 生成 `Learning OS.app`
6. 用 `ditto` 把 `.app` 压缩为可分发的 `zip`

## 命令

```bash
pnpm run build:package
pnpm package:mac
```

产物位置：

- `.app`：`apps/shell/dist-packages/mac-arm64/Learning OS.app`
- `.zip`：`apps/shell/dist-packages/Learning OS-0.0.1-arm64.zip`

## 为什么当前不生成 DMG

在本机 `macOS 26.5.1` 环境下，以下两条链路都复现了系统级失败：

- `electron-builder` 的 DMG 构建
- 最简 `hdiutil create -srcfolder ...`

两者都会返回“只读文件系统”，说明当前问题不在项目配置，而在该系统版本下的 DMG 生成兼容性。为了先保证本地可安装、可分发、可验收，现阶段默认使用 `.app + zip`。

后续如果需要恢复 DMG，可以在更稳定的 macOS 版本或独立 CI 打包机上重新验证。
