# 插件注册与调用

## 用途

注册表、兼容检查、有限执行上下文和插件生命周期。

## 限制

由应用注册具体插件；核心不 import SuRelay 等具体实现，声明权限不等于安全沙箱。

## v0.1 状态

最小注册 Map/版本检查在 ../index.ts，契约在 plugin-sdk，具体注册在应用层；未提供第三方加载器。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
