# Release / Versioning

## 版本策略

统一使用 SemVer：

- `MAJOR.MINOR.PATCH`
- 首个正式发布版本定为 `0.1.0`

含义：

- `MAJOR`：不兼容变更
- `MINOR`：向后兼容的新功能
- `PATCH`：向后兼容的问题修复

在 `0.x` 阶段，仍然允许有较快迭代，但每次对外发布都保持版本号一致。

## Git tag 规则

统一使用带 `v` 前缀的 annotated tag：

- `v0.1.0`
- `v0.1.1`
- `v0.2.0`

如需预发布：

- `v0.1.0-rc.1`
- `v0.1.0-beta.1`

不使用平台前缀 tag，例如不使用：

- `android-v0.1.0`
- `desktop-v0.1.0`

原因：

- Bemo 应保持单一产品版本线
- Android、桌面、Web 共享同一套功能语义版本
- 平台差异体现在 release 产物和 release notes，而不是 tag 命名

## 首次发布约定

首次对外版本：

- Git tag: `v0.1.0`
- Android `versionName`: `0.1.0`
- Android `versionCode`: `1`
- Tauri version: `0.1.0`
- frontend `package.json` version: `0.1.0`

## 各平台版本映射

### Git

- 使用 `vX.Y.Z`

### Android

- `versionName = X.Y.Z`
- `versionCode` 每次发布到应用商店必须递增

建议示例：

- `0.1.0` -> `versionCode 1`
- `0.1.1` -> `versionCode 2`
- `0.2.0` -> `versionCode 3`

### Tauri / 前端

- `frontend/src-tauri/tauri.conf.json` 使用相同版本号
- `frontend/package.json` 使用相同版本号

## 发版流程

1. 更新版本号
2. 完成功能验证
3. 产出 Android AAB / APK
4. 提交版本变更
5. 创建 annotated tag
6. 基于 tag 发布 release notes 和构建产物

## 首次发版命令

提交完成后：

```powershell
git tag -a v0.1.0 -m "Bemo v0.1.0"
git push origin v0.1.0
```

## 本仓库当前基线

当前建议基线：

- Git 首发 tag：`v0.1.0`
- Android 包名：`io.github.cheshiremew.bemo`
- Android 显示名：`Bemo`
