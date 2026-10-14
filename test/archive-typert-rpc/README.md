# 已归档：typert RPC 方案的历史测试

这两个文件是 v1.2.0 时期**调查 typert 远程服务方案**时写的验证脚本，
**不是**本插件行为的功能测试。保留在此仅作历史记录，不要运行。

## 为什么废弃

当时想复用 DSH 已配置的模型做 AI 解释，做法是：

1. host 半侧（`lib/index.js`）实现 `TermGlossaryHost extends TypertRemoteService`，
   通过 `ctx.llm.stream` 调模型
2. client 半侧调用 `ctx.remote.$mount()` 把该服务注册成 `remote.termGlossary`

`self-mount.spec.mjs` 验证第 2 步「自 mount 能否成功」，
`host-remote-methods.spec.mjs` 验证第 1 步「SRC 反射能否发现远程方法」。

**两步都验证通过了，但最终发现方案不可用**：`ctx.llm.stream` 的输出
经内部 `BlockAssembler` 组装后**返回空内容**（`finish_reason: stop` 但
`content` 为空）。同一个请求直接用浏览器 `fetch` 调 OpenRouter 则 3 秒内
正常返回。

所以问题不在挂载机制，而在 DSH 的流式组装环节。挂载机制本身没问题，
但它服务的那条链路是死的。

## 后续处理

- v1.4：client 侧改走**浏览器直连 OpenRouter**（非流式），废弃 `viaRpc` 通道
- v1.8：删除 host 半侧的 `TermGlossaryHost` 全部实现、client 侧的
  `selfMount()` / `resolveAI()` 重试机制，以及 `remote` / `dsh-llm` /
  `typert-protocol` 依赖。`lib/index.js` 缩减为无依赖占位。

## 现在的测试在哪

见仓库根的 `test.mjs`（`npm test`，46 项），覆盖：

- 浮层焦点/关闭逻辑（含「点输入框误关浮层」的回归防护）
- 云端配置：`max_tokens` 范围钳制、失效模型检测、错误诊断文案
- 死代码与版本一致性（防止已删除的 RPC 机制意外回归）

## 备注

这两个脚本还有环境依赖问题（硬编码了 `/home/ubuntu/.dsh/profiles/...`
路径、`host-remote-methods.spec.mjs` 的 import 路径已失效），即使想跑
也要先修路径。真要考古建议直接看
[`docs/typert-remote-investigation.md`](../../docs/typert-remote-investigation.md)。
