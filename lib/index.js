// dsh-client-term-glossary · host 半侧
//
// ── 为什么这里几乎是空的 ──
// 本插件的功能全部在浏览器侧（lib/client.js）：划词 → 弹浮层 → 解释。
// AI 解释走两条自包含通道：
//   1) Chrome 内置 AI（本地模型，免费离线）
//   2) 浏览器直连 OpenRouter（非流式，用户自备 key）
//
// 原先 host 半侧提供一个 typert 远程服务 termGlossary.explain()，
// 通过 ctx.llm.stream 复用 DSH 已配置的模型。该方案已废弃并移除：
// ctx.llm.stream 的输出经 BlockAssembler 组装后返回空内容（已实测复现），
// 而浏览器直连 OpenRouter 3 秒内正常返回。保留一个已知失效的远程方法
// 只会让读者困惑，因此删掉。
//
// 本文件保留的原因：package.json 的 main 指向它，Cordis 需要一个可加载的
// 插件入口。这里只做「什么都不做但绝不出错」的激活。
//
// 如果将来要在 host 侧做事（例如代理请求以隐藏 key），在这里加即可。

/**
 * Cordis 插件入口。
 *
 * 刻意保持极简：不 inject 任何服务、不注册任何远程方法。
 * 这样即使 DSH 内部服务改名/重构，本插件也不会因此激活失败。
 *
 * @param {object} ctx - Cordis 插件上下文（当前未使用，保留以备扩展）。
 */
function apply(ctx) {
	try {
		console.log('[term-glossary][HOST] ✅ 已激活（host 侧无功能，UI 在浏览器侧）');
	} catch (e) { /* 日志失败也绝不影响启动 */ }
}

/** Cordis 插件名。 */
const name = 'term-glossary';

/** 不依赖任何 host 侧服务。 */
const inject = [];

export { apply, name, inject };
export default { apply, name, inject };
