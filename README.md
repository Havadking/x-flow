# X-Flow - X 智流推特 (AI 智译与 Obsidian 剪藏)

在 X（Twitter）每条推文的右上角、原生「…」操作菜单左侧无缝融合一组 3 枚 34px 圆钮，兼具 DeepSeek AI 实时流式处理与一键存入本地 Obsidian 知识库：

- **文A 翻译** — 采用 SSE 实时流式输出，把推文极速翻译成指定语言，直接内联展示在推文正文下方，打字机实时动效，优雅支持一键复制与收起。
- **✦ 深度解读** — 呼出毛玻璃悬浮卡片，深入剖析推文的术语、缩写、梗文化、背景事件与言外之意（引用的推文会作为背景上下文一并发给模型）。
- **💎 存入 Obsidian** — 一键将推文（正文、作者信息、发布时间、高清原图、互动数据等）抓取并解析成 Markdown 笔记，直接存入本地 Obsidian 知识库，支持 File System 本地直接写入与 Obsidian URI 唤起两种模式。

---

## ✨ 核心特性

- **极致原生体验**：UI 尺寸、图标线宽（1.8px Feather 风格）、圆角、悬停反馈与 Tooltip 胶囊 100% 贴合 Twitter 官方视觉，并自动跟随用户自定义主题色与深浅色模式。
- **长推文智能自展开**：若推文含有「显示更多」，点击任何操作按钮均会自动展开推文抓取完整文本后再行处理。
- **双模 Obsidian 剪藏**：
  - **本地文件系统直写 (`filesystem`)**：利用 Chromium File System Access API 无感直接写入本地 Vault，自动下载推文原图到附件目录并转为 `![[...]]` 双链引用。
  - **Obsidian 协议调起 (`obsidian-uri`)**：无需目录授权，通过 `obsidian://new` 唤起桌面版 Obsidian 自动建档，适合 Brave 等环境。
- **高度可定制模板**：提供丰富的 Frontmatter 与模板变量（`{{author}}`, `{{content}}`, `{{imagesMarkdown}}`, `{{url}}`, `{{topicsYaml}}` 等）。
- **极速响应与节能缓存**：DeepSeek 翻译与解读结果在当前页面按推文缓存，避免重复请求。

---

## 🚀 安装步骤（开发者模式）

1. 打开 Chrome / Edge / Brave 浏览器，访问 `chrome://extensions`（或 `edge://extensions`）。
2. 打开右上角「**开发者模式** (Developer mode)」开关。
3. 点击「**加载已解压的扩展程序** (Load unpacked)」，选择本项目根目录文件夹。
4. 点击扩展栏中的 X-Flow 图标，点击「打开扩展设置」：
   - **DeepSeek AI**：填入你的 DeepSeek API Key（可前往 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 获取），选择输出语言和模型，点击「测试连接」。
   - **Obsidian 知识库**：点击「选择 Vault 根目录」授权你的本地知识库，或填写 Vault 名称切换为 URI 模式。
   - 点击底部「**保存全部设置**」。
5. 打开或刷新 [x.com](https://x.com) 开始使用！

---

## 🔒 隐私与安全性

- **API Key 本地安全存储**：仅保存在浏览器本地 `chrome.storage.local`，绝不上传至任何第三方服务器。
- **按需网络请求**：只有在主动点击翻译或解释按钮时，当前推文内容才会直接发送到官方 `api.deepseek.com`。
- **纯净本地知识库**：Obsidian 剪藏完全在本地运行，直接写入用户选定的本地文件夹，不经过任何外部中转。
