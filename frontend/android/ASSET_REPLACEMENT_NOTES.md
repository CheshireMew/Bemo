# Android 资源替换说明

当前仓库里的 Android 图标和启动图已经有占位文件，但发布前建议统一替换。

## 需要替换的文件

### 应用图标

替换这些目录下的同名文件：

- `app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`

如果保留自适应图标，也同步替换：

- `app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`
- `app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`
- `app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`
- `app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`
- `app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`
- `app/src/main/res/mipmap-*/ic_launcher_round.png`

### 启动图

替换这些文件：

- `app/src/main/res/drawable/splash.png`
- `app/src/main/res/drawable-port-*/splash.png`
- `app/src/main/res/drawable-land-*/splash.png`

## 建议做法

- 用 Android Studio 的 Image Asset 工具重新生成 launcher icons
- 启动图保持简单，避免小字和复杂细节
- 图标主形状尽量居中，给自适应裁切留安全边距

## 注意

- 不建议只替换一两个分辨率，否则不同设备上会模糊
- release 前至少在真机桌面、应用列表、启动页各看一遍
