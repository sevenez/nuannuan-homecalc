# SPEC · 版本号规范

> 生效日期：2026-11-07。本文件是版本号的唯一规范，与 README 的更新记录互为引用。

## 1. 版本格式

```
1.210.5.x
└─┬──┘ └┬┘
  │     └─ x：迭代位（助手可自主递增，见 §2）
  └─ 前三位：由项目所有者（用户）控制，助手不得改动
```

- **前三位 `1.210.5`**：由用户指定。改前三位 = 用户主动的发版决策（如数据大版本、功能大版本）。
- **第四位 `x`**：助手在两次发版之间的**自主小改动**（样式微调、标签文案、交互修正等）时递增；从 `0` 起。

## 2. 助手的自主修改规则

| 场景 | 行为 |
|---|---|
| 小改动（样式/文案/交互修正） | 只把 `x` +1（如 `1.210.5.0` → `1.210.5.1`），**前三位不动** |
| 用户要求的前三位变更 | 按用户指定的值设置，`x` 归 `0` |
| 未明确要求构建 | **不升版本号、不构建 APK**——只改 `web/` 源码并在浏览器验证，攒批待发 |

## 3. 构建发布（仅用户明确要求时）

- Android `versionCode`：独立递增整数（系统覆盖安装判断用），每次出包 +1，与四段式版本号无换算关系。
- Android `versionName`：跟随四段式（如 `1.210.5.0`）。
- 出包同步清单（缺一不可）：
  1. `web/app.js` 的 `APP_VER`
  2. `web/sw.js` 的 `VER`（SW 缓存名 `nd-home-<VER>`）与 `FILES` 里的 `?v=` 参数
  3. `web/index.html` 的 `<link>/<script>` `?v=` 参数
  4. `android/app/build.gradle` 的 `versionName` + `versionCode`
  5. `cp web/{index.html,style.css,app.js,core.js,data.js,manifest.json,sw.js} android/app/src/main/assets/`
  6. `cd android && ./gradlew assembleRelease`，产物复制为 `release/暖暖家园计算器-<版本>.apk`
  7. README 更新记录加一条
- 回归底线：jsdom 冒烟 + caps 对拍脚本 + 浏览器双视口截图。

## 4. 显示位置

- 「我的」→ 数据版本卡：`应用版本 <四段式> · 数据表 v2.10`
- PWA SW 缓存名 / `?v=` 参数：`<四段式>`
- APK 安装信息：`versionName <四段式>`（另有系统 `versionCode` 整数）
