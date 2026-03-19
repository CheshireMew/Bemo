# Android 上架前检查

## 品牌与元数据

- 确认应用显示名为 `Bemo`
- 确认 Android 包名为 `io.github.cheshiremew.bemo`
- 确认 `frontend/android/gradle.properties` 中的 `BEMO_VERSION_CODE` 已递增
- 确认 `frontend/android/gradle.properties` 中的 `BEMO_VERSION_NAME` 为本次发布版本

## 签名与构建

- 已生成正式 keystore
- 已填写 `frontend/android/keystore.properties`
- 本机已配置 `JAVA_HOME`
- 能成功执行 `npm run android:bundle`
- 已生成 AAB：`frontend/android/app/build/outputs/bundle/release/app-release.aab`

## 网络与环境

- release 使用 HTTPS API 地址
- release 包不依赖局域网 HTTP 后端
- 后端线上域名、证书、跨域策略已验证
- 不包含本地调试地址、测试 token、临时开关

## Android 资源

- 已替换应用图标
- 已替换启动图
- 已检查深浅背景下图标可读性
- 已检查桌面图标、圆角图标、启动图显示正常

当前 Android 资源入口：

- 应用图标前景：`frontend/android/app/src/main/res/mipmap-*/ic_launcher_foreground.png`
- 应用图标：`frontend/android/app/src/main/res/mipmap-*/ic_launcher.png`
- 圆角图标：`frontend/android/app/src/main/res/mipmap-*/ic_launcher_round.png`
- 启动图：`frontend/android/app/src/main/res/drawable*/splash.png`
- 自适应图标配置：
  - `frontend/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
  - `frontend/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`

## 功能回归

- 新建笔记正常
- 编辑笔记正常
- 删除与回收站正常
- 搜索正常
- 图片上传正常
- 同步正常
- 离线后恢复正常
- 应用前后台切换后状态正常

## 真机验证

- 至少验证一台 Android 真机
- 至少验证一台 Android 模拟器或第二台设备
- 已检查首次安装
- 已检查覆盖安装升级
- 已检查网络异常时的错误提示

## 发布材料

- 应用图标源文件已归档
- 启动图源文件已归档
- 商店截图已准备
- 应用简介、隐私政策、开源仓库链接已准备
