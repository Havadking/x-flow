# X-Flow - X (Twitter) 智流工作流

> 为 X (Twitter) 赋予 DeepSeek 实时流式翻译、AI 深度解读与一键剪藏至本地 Obsidian 知识库的能力。

![Manifest V3](https://img.shields.io/badge/Manifest-V3-1d9bf0?style=flat-square)
![Platform](https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge%20%7C%20Brave-success?style=flat-square)
![DeepSeek](https://img.shields.io/badge/AI-DeepSeek%20API-4d6bfe?style=flat-square)
![Obsidian](https://img.shields.io/badge/Obsidian-Local%20Vault-7c3aed?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)

---

## 📖 项目简介

日常在 X (Twitter) 浏览资讯时，我们常常面临两个核心痛点：
1. **跨语言理解门槛**：常规机械翻译往往生硬失真；遇到专业术语、行业缩写、网络迷因（meme）或背景事件时，缺乏上下文解读。
2. **高价值内容留存困难**：遇到有深度的推文、讨论串或高清原图时，难以高效归档到个人的本地笔记系统（如 Obsidian），手动复制粘贴不仅繁琐，还会丢失排版、元数据和多媒体资源。

**X-Flow** 是一款遵循 Chrome Extensions Manifest V3 标准开发的浏览器扩展。它在每条推文右上角原生融入一组 34px 操作圆钮，实现 **DeepSeek 实时打字机流式翻译**、**推文语境深度解析** 以及 **本地 Obsidian 知识库一键双模剪藏**。

本插件秉持「纯净、本地、无缝」原则：**无自建后台服务器、不收集任何用户隐私、API Key 本地安全存储、Obsidian 笔记直接落盘至本地设备**。

---

## ✨ 核心特性

### 1. 深度融合的 Twitter 原生 UI
- **视觉像素级统一**：图标线宽（1.8px Feather 风格）、34px 尺寸、圆角形态与悬停反馈，与 X 官方原生按钮视觉保持一致。
- **自适应深浅色模式**：自动嗅探页面的背景色与自定义主题高亮色（蓝色、黄色、粉色、紫色、橙色、绿色），保证组件无缝融入。
- **长推文智能自动展开**：遇到含有「显示更多 / Show more」折叠的长推文时，触发任何操作按钮均会自动先展开推文并捕获完整正文后再行处理，杜绝长文内容被截断。
- **按钮自由定制**：在设置页中可自由开启或关闭「DeepSeek 翻译」、「DeepSeek 解释」、「存入 Obsidian」中的任意按钮。

### 2. DeepSeek 实时流式翻译
- **打字机实时流式响应**：基于 Server-Sent Events (SSE) 流式传输，首字极速呈现，显著降低大模型响应等待感知。
- **内联嵌入排版**：译文直接渲染在当前推文正文下方，不遮挡原始内容，支持随时一键展开/收起。
- **智能缓存与快速复制**：单条推文在当前页面内自动缓存翻译结果，避免重复点击产生额外的 API Token 消耗；卡片自带一键复制按钮。
- **参数专项优化**：针对推文翻译特点，设置适宜的采样温度，显式关闭思考模式以获取极速纯文本译文，保留原文排版与换行格式。

### 3. DeepSeek AI 深度解读
- **上下文背景剖析**：呼出轻量级毛玻璃浮窗，深入剖析推文的核心事实、专有名词、缩写、梗文化以及言外之意。
- **引用推文联动**：若推文引用了其他推文（Quoted Tweet），插件会自动抓取被引用推文作为背景补充一并传给大模型。
- **便捷交互**：浮窗随操作按钮定位，支持跟随页面滚动自适应位置，支持一键复制解读内容或通过 `Esc` 键、外部点击随时关闭。

### 4. Obsidian 双模知识剪藏
- **元数据结构化提取**：
  - 作者昵称、个人主页链接
  - 推文 ID、正文永久链接（URL）
  - 发布时间（自动换算为东八区北京时间 `YYYY-MM-DD HH:mm:ss`）
  - 互动统计（转推数、评论数、点赞数，支持汉化与万/K/M缩写归一化）
  - 话题标签（#Topics）
- **AI 极简主题短语**：
  - 自动调用 DeepSeek 为推文提炼 4-12 字无标点的精炼中文事件短语。
  - 默认以 `{作者} - {AI主题}` 命名笔记，笔记列表一目了然。
- **高清原图本地附件化**：
  - 自动提取推文内的配图（`pbs.twimg.com`），自动请求高清大图（`?name=large`）。
  - 下载至本地 Vault 的附件目录，并自动在正文转换为 Obsidian 原生双链格式 `![[...]]`。
- **双写入模式**：
  - 🟢 **本地文件系统直写 (`filesystem` 模式，推荐 Chrome / Edge)**：基于 Chromium 原生 File System Access API 与 IndexedDB 存储目录句柄，点击后静默写入本地 Vault，支持自动下载高清原图到附件文件夹。
  - 🔵 **Obsidian URI 唤起 (`obsidian-uri` 模式，推荐 Brave)**：通过 `obsidian://new` 协议直接唤起本地 Obsidian 客户端建档，无须授权浏览器目录权限。

---

## 🛠️ 安装与配置指南

### 1. 安装扩展程序（开发者模式）

1. 将本项目源码下载或克隆到本地：
   ```bash
   git clone https://github.com/Havadking/x-flow.git
   ```
2. 打开 Chromium 核心浏览器（如 Google Chrome、Microsoft Edge、Brave 等），在地址栏访问：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
3. 打开页面右上角的「**开发者模式** (Developer mode)」开关。
4. 点击「**加载已解压的扩展程序** (Load unpacked)」，选中本项目的根目录文件夹。
5. 此时浏览器插件栏中将出现 **X-Flow** 图标。

---

### 2. 基础配置

点击浏览器右上角 X-Flow 图标，点击「**打开扩展设置**」：

#### 🤖 DeepSeek AI 配置
1. **API Key**：填入你的 DeepSeek API Key（可前往 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建获取）。
2. **网络连通性测试**：填写后点击「测试 API 连接」，确认 Key 有效且网关连通。
3. **语言与模型**：
   - **目标语言**：支持简体中文、繁體中文、English、日本語、한국어 或自定义语言。
   - **翻译模型**：默认填入 `deepseek-flash`（响应极速、性价比高）。
   - **解读模型**：默认填入 `deepseek-v4-pro`（逻辑分析与背景归纳力更强）。

#### 💎 Obsidian 剪藏配置
根据你使用的浏览器环境选择存储方式：
- **方式 A：直接写入本地 Vault（推荐 Chrome / Edge）**
  1. 选择「直接写入本地 Vault」模式。
  2. 点击「选择 Vault 根目录」按钮，在系统弹窗中选择你的本地 Obsidian 知识库根文件夹并点击允许授权。
  3. 勾选「自动下载高清图片到本地 Vault」。
- **方式 B：Obsidian URI 模式（推荐 Brave 或无需文件授权环境）**
  1. 选择「Obsidian URI 模式」。
  2. 在下方填写你的 Obsidian 库名称（需与本地 Vault 名称严格一致，注意大小写）。

配置完成后，点击页面底部「**保存全部设置**」。返回 [x.com](https://x.com) 刷新页面即可开始使用。

---

## 📝 Markdown 模板变量参考

在扩展设置的「Obsidian 剪藏」页面中，你可以根据个人笔记工作流自定义 Frontmatter 属性与正文结构。支持的动态变量如下：

| 变量占位符 | 说明 | 示例 |
| :--- | :--- | :--- |
| `{{title}}` | 笔记完整标题（作者 - AI总结） | `OpenAI - 发布最新推理模型` |
| `{{pathSafeTitle}}` | 经过文件名安全过滤的标题 | `OpenAI - 发布最新推理模型` |
| `{{aiSummary}}` | DeepSeek 提炼的 4-12 字极简短语 | `发布最新推理模型` |
| `{{author}}` | 推文作者昵称 | `Sam Altman` |
| `{{pathSafeAuthor}}` | 安全作者名（剔除路径保留字符） | `Sam Altman` |
| `{{authorUrl}}` | 作者个人主页链接 | `https://x.com/sama` |
| `{{publishedAt}}` | 推文发布时间（东八区北京时间） | `2026-09-17 14:30:00` |
| `{{url}}` | 推文原文永久链接 | `https://x.com/sama/status/189...` |
| `{{id}}` | 推文唯一 ID | `1890123456789012345` |
| `{{content}}` | 纯净推文正文文本（保留换行） | 推文内容段落... |
| `{{topicsYaml}}` | 话题标签 YAML 数组 | `["AI", "OpenAI"]` |
| `{{topicsCsv}}` | 话题标签逗号分隔字符串 | `AI, OpenAI` |
| `{{imagesMarkdown}}` | 本地附件双链 `![[...]]` 或网络图 | `![[Attachments/X/2026/09/189.../01.jpg]]` |
| `{{repostsCount}}` | 转推数（数值格式） | `1200` |
| `{{commentsCount}}`| 回复/评论数（数值格式） | `350` |
| `{{likesCount}}`   | 点赞数（数值格式） | `5400` |
| `{{yyyy}}` / `{{mm}}` / `{{dd}}` | 年 / 月 / 日时间戳 | `2026` / `09` / `17` |

### 默认笔记模板示例

```yaml
---
created: {{createdAtPretty}}
date modified: {{modifiedAtPretty}}
source: "{{source}}"
source name: "{{sourceName}}"
author: "{{authorYaml}}"
author url: "{{authorUrlYaml}}"
published at: "{{publishedAtYaml}}"
post id: "{{idYaml}}"
post url: "{{urlYaml}}"
reposts: {{repostsCount}}
comments: {{commentsCount}}
likes: {{likesCount}}
topics: {{topicsYaml}}
images: {{imagesYaml}}
videos: {{videosYaml}}
---

{{content}}

{{imagesMarkdown}}
{{videosMarkdown}}
```

---

## 🔒 隐私与安全性

1. **绝对本地存储**：API Key 与所有配置项仅存放在浏览器本地沙盒（`chrome.storage.local`），任何情况下绝不上传至任何第三方服务器或开发者服务器。
2. **纯粹官方直连**：所有的 AI 请求均直接在客户端通过 HTTPS 与官方接口 `https://api.deepseek.com` 进行通信，不经过任何反向代理中转。
3. **数据按需触发**：插件仅在用户显式点击「翻译」或「解释」时，才会提取当前卡片推文与引用推文的内容；浏览过程中不会对推文流进行任何后台未经授权的抓取或外传。
4. **透明本地落盘**：Obsidian 剪藏完全在本地通过浏览器原生 API 写入您明确授权的文件系统目录，无需安装任何可能具有安全隐患的外部后台守护进程。

---

## 💻 本地工程与测试验证

本项目内置自动化单元测试与 API 独立排错工具，方便二次开发与调试。

### 1. 运行自动化单元测试
项目使用 Node.js 原生测试框架（无需额外安装外部依赖）：
```bash
node --test tests/*.test.js
```
测试用例覆盖以下核心模块：
- `manifest.json` 规则与图标资源合规性
- Obsidian 写入状态机与配置合并逻辑
- 文件名路径清洗、时间格式化转换与数字格式化
- 模板引擎插值与笔记正文生成
- DeepSeek SSE 流式分包、黏包与断包解析器

### 2. 独立 API 连通性排查脚本
如遇到 API 响应异常或不确定网络/账号状态，可使用内置的 PowerShell 脚本独立排查：
```powershell
pwsh -ExecutionPolicy Bypass -File .\test-api.ps1
```
该脚本将依次探测：
- 账户余额查询
- API 网关健康状态（验证 HTTP 400 快速响应）
- 各模型非流式调用测试
- 各模型 SSE 流式输出分块测试

---

## ❓ 常见问题 (FAQ)

<details>
<summary><strong>Q: 为什么翻译或解读提示「DeepSeek API 返回错误 (503)」？</strong></summary>

A: 503 错误通常表示官方服务在高峰期暂时过载。插件内置了间隔重试机制（默认重试 2 次），如果依然遇到过载，可以稍等数秒后再次点击，或在设置中尝试切换其他可用模型。
</details>

<details>
<summary><strong>Q: 使用直接写入本地 Vault 模式时，每次重启浏览器需要重新授权吗？</strong></summary>

A: Chromium 浏览器出于安全策略，对于 File System Access API 授权目录，在浏览器完全退出重开后可能会变为 `prompt`（待授权）状态。若剪藏提示权限失效，只需进入设置页重新点击一次「选择 Vault 根目录」即可恢复。如果不希望经常授权，可选用「Obsidian URI 模式」。
</details>

<details>
<summary><strong>Q: 为什么在 Brave 浏览器中直接写入本地 Vault 会失败？</strong></summary>

A: Brave 浏览器的隐私防御机制默认对 File System Access API 有较为严格的沙盒限制。建议 Brave 用户在设置中切换为「Obsidian URI 模式」，通过系统协议唤起应用建档。
</details>

---

## 📄 免责声明与开源协议

- 本项目采用 [MIT License](LICENSE) 开源。
- 本项目为个人开发者的第三方开源工具，与 X Corp. (Twitter)、DeepSeek 以及 Dynalist Inc. (Obsidian) 官方均无关联。
