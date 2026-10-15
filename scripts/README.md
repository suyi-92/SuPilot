# 正式项目脚本

## 用途

可移植的初始化、构建、打包和维护工具；当前只有 init-local.mjs。

## 限制

纳入 Git，不依赖 .local 或个人路径；测试驱动放 tests，本机专用工具放 .local/Script。

## v0.1 状态

init-local.mjs 仍是幂等本地目录初始化器；构建/打包使用 package.json 中的 electron-vite/electron-builder 命令。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../AGENTS.md)，目录索引见 [directory-map.md](../docs/directory-map.md)。
