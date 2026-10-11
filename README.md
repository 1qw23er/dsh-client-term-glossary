# dsh-client-term-glossary · 划词即解释

> DSH (DeepSeek Harness) 客户端插件：选中任意文本即弹出大白话解释浮层，旁路进行，不打扰主任务。

A client-side plugin for [DSH](https://github.com/deepseek-ai) (DeepSeek Harness) that shows plain-language explanations when you select any text in the web UI. Zero interference with the main task — no session pollution, no AI calls for dictionary hits, no network for TTS.

---

## ✨ 功能 Features

| 功能 | 说明 |
|---|---|
| **139 条本地词典** | DSH 概念、AI 术语、编程基础、网络系统、报错关键词、常见命令组合，选中即弹大白话解释 |
| **模糊匹配** | 选中「什么是 subagent」「subagent 是什么意思」「Cordis.」都能命中 |
| **智能包含匹配** | 选中一句话，若其中只含一个已知术语，也能命中（多个术语时不猜，保持安静） |
| **命令组合识别** | `npm install`、`git commit`、`rm -rf`、`docker run` 等常见命令有独立解释 |
| **报错识别** | 选中报错文本（TypeError、ENOENT、ModuleNotFoundError…）给「怎么读这个错」的引导 |
| **通用卡片** | 选中任何 2~200 字符的文本都弹卡片——不在词典里的也能朗读 + 复制给主助手 |
| **英文在线词典** | 选中英文单词自动查 [Free Dictionary API](https://dictionaryapi.dev/)，显示释义、词性、发音、例句 |
| **语音朗读 🔊** | 用浏览器原生 `speechSynthesis` 朗读选中文本，零联网、零额度、中英文皆可 |
| **复制给主助手** | 一键复制选中文本到剪贴板，方便粘贴到对话里让 AI 深入解释 |
| **零打扰保证** | 全部在浏览器内完成，不进 session 对话历史，不调用任何主助手工具 |

---

## 📦 安装 Install

### 通过 npm 安装（推荐）

在你的 DSH web profile 目录下：

```bash
# 进入 web profile 目录
cd ~/.dsh/profiles/web

# 安装插件
pnpm add dsh-client-term-glossary
# 或
npm install dsh-client-term-glossary
```

### 在 composition 里注册

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，在 `insert` 列表里加一条：

```yaml
    # 划词即解释：选中术语浮出大白话解释，旁路不打扰主任务
    - id: term-glossary
      name: "dsh-client-term-glossary"
```

### 重启 DSH

重启 DSH host，然后刷新网页界面。选中任意术语即可看到解释浮层。

---

## 🎯 使用 Usage

1. 在对话正文或工具输出里，用鼠标**拖选**一个词或短语
2. 选区旁边立刻浮出一张解释卡片
3. 点 `×`、按 `Esc`、或点空白处关闭卡片

### 试试这些

| 选中内容 | 你会看到 |
|---|---|
| `subagent` | 本地词典：一句话 + 打比方 + 在 DSH 里怎么用 |
| `npm install` | 命令组合：「安装项目所需的依赖包」 |
| `什么是 HMR` | 模糊匹配：识别为 HMR，显示热更新解释 |
| `TypeError: Cannot read properties of undefined` | 报错识别：告诉你怎么读这个错 |
| `hello`（英文单词） | 在线词典：释义、词性、发音、例句 |
| `智能体`（中文，不在词典里） | 通用卡片：可朗读 + 复制给主助手 |
| `今天天气不错`（普通句子） | 通用卡片：可朗读 + 复制给主助手 |

---

## 🔧 自定义 Customize

### 加词 / 改解释

编辑 `lib/client.js` 中的 `GLOSSARY` 数组，照着已有条目加一项即可：

```javascript
{ terms: ['你的术语', '别名'], oneLine: '一句话解释', analogy: '生活比方', inDsh: '在 DSH 里怎么用', remember: '要记吗' },
```

### 命令组合

同样在 `GLOSSARY` 里加，`terms` 用完整命令：

```javascript
{ terms: ['your-command'], oneLine: '这是什么命令', analogy: '比方', inDsh: '说明', remember: '不用记。' },
```

---

## 🏗️ 技术细节 Technical

- **浏览器侧入口** `lib/client.js`：通过 `window.__ModuleLoader__.load({ id, factory })` 自注册，符合 DSH 客户端 bundle 契约（与官方 `dsh-client-hmr`、`dsh-client-locale` 同款格式）。
- **React 浮层**：用 `createPortal` 挂到 `document.body`，与 DSH 自身 UI 树隔离；容器 `all:initial` 隔离样式。
- **选区监听**：`mouseup`（延迟一帧）+ `selectionchange` + `mousedown`（capture），确保点击卡片不关闭、点空白处关闭。
- **匹配优先级**：精确匹配 > 模糊匹配（去提问式前后缀） > 智能包含匹配（多匹配取最长） > 报错识别 > 命令识别 > 通用卡片。
- **语音朗读**：浏览器原生 `speechSynthesis` API，自动选择中文/英文语音，`rate: 0.9`。
- **英文在线词典**：`fetch` 到 `api.dictionaryapi.dev`（免费、无需 API key、支持 CORS），失败时静默降级。
- **host 半侧** `lib/index.js`：最小骨架（空 `apply`），插件不需要 host 侧服务。
- **全部 try/catch 兜底**：最坏情况只是浮层不出现，不会影响主界面。

---

## 📋 系统要求 Requirements

- DSH ≥ 0.2.0（需支持 `window.__ModuleLoader__` 客户端 bundle 契约）
- 现代浏览器（Chrome 90+ / Edge 90+ / Firefox 90+）
- 语音朗读需要浏览器支持 `speechSynthesis`（主流浏览器均支持）

---

## 📄 License

[MIT](./LICENSE)

---

## 🤝 贡献 Contributing

欢迎提交 Issue 和 PR！

- 加词：直接编辑 `GLOSSARY` 数组
- 改进匹配逻辑：修改 `lookup` / `fuzzyHit` 函数
- 加新卡片类型：参考 `GlossaryCard` / `ErrorCard` / `CommandCard` / `UniversalCard` 的写法
