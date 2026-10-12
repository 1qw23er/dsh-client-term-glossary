// dsh-client-term-glossary · host 半侧
//
// 提供一个「旁路 AI 解释」远程服务：调用 DSH 已配置的模型做一次性文本解释。
//
// 关键设计：
//   · 不传 sessionId —— 这是手工构造的调用，不挂到任何会话，
//     因此不进主对话历史、不打断主任务、不污染上下文。
//   · 复用 DSH 已配置的模型与凭证 —— 用户无需额外申请 API key。
//   · 全链路 try/catch 兜底 —— host 侧抛错会影响 DSH 启动，必须绝对防御。
//   · 不声明 static inject —— 用惰性 ctx.get() 取服务，避免依赖未就绪导致插件不激活。

import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** typert 远程方法描述符的字符串键（协议规定，非 Symbol）。 */
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";

/** 让模型输出大白话解释的系统提示词。 */
const SYSTEM_PROMPT = [
	'你是一个"术语大白话解释器"，服务对象是完全不懂编程的普通人。',
	'用户会给你一个词、一句话、一条报错或一段命令。',
	'请用中文回答，严格按下面四行输出，不要加任何多余的话：',
	'一句话：这是什么（不用专业词，一句话说清）',
	'打比方：用日常生活里的东西类比',
	'怎么用：在 DeepSeek Harness (DSH) 或编程里它是干嘛的',
	'要记吗：不用记 / 记一句：xxx',
	'如果内容与编程技术无关，就按普通词典解释，同样四行。',
	'每行控制在 40 字以内，总共不超过 200 字。'
].join('\n');

/**
 * 从 BlockAssembler 的输出块中提取纯文本。
 * @param blocks - 组装后的内容块数组。
 * @returns 拼接后的文本。
 */
function extractText(blocks) {
	try {
		if (!Array.isArray(blocks)) return '';
		var out = [];
		for (var i = 0; i < blocks.length; i++) {
			var b = blocks[i];
			if (b && b.type === 'text' && typeof b.text === 'string') out.push(b.text);
		}
		return out.join('').trim();
	} catch (e) {
		return '';
	}
}

/**
 * 旁路 AI 解释服务。
 *
 * 通过 typert 网关暴露 `explain` / `capability` 方法给浏览器侧插件调用。
 */
class TermGlossaryHost extends TypertRemoteService {
	/**
	 * @param ctx - Cordis host 上下文。
	 * @param config - 插件配置（可选）。
	 */
	constructor(ctx, config) {
		super(ctx, 'termGlossary');
		this.hostCtx = ctx;
		this.pluginConfig = config || {};
		/** 缓存的模型选择，避免每次调用都重新解析。 */
		this._modelCache = null;
	}

	/**
	 * 解析要使用的 provider/model。
	 * 优先用插件配置显式指定的，其次用 DSH 的默认模型，最后回退到第一个可用模型。
	 * @returns {{provider:string, model:(string|null)}|null}
	 */
	resolveTarget() {
		if (this._modelCache) return this._modelCache;
		var cfg = this.pluginConfig || {};

		// 1) 插件配置里显式指定
		if (typeof cfg.provider === 'string' && typeof cfg.model === 'string' && cfg.provider && cfg.model) {
			this._modelCache = { provider: cfg.provider, model: cfg.model };
			return this._modelCache;
		}

		// 2) DSH 的默认模型
		try {
			var dm = this.hostCtx.get('agentDefaultModel');
			if (dm && typeof dm.currentSelection === 'function') {
				var sel = dm.currentSelection();
				if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') {
					this._modelCache = { provider: sel.provider, model: sel.model };
					return this._modelCache;
				}
			}
		} catch (e) { /* 继续回退 */ }

		// 3) 回退：取第一个已注册 provider（便宜的优先）
		try {
			var llm = this.hostCtx.get('llm');
			if (llm && typeof llm.listProviders === 'function') {
				var providers = llm.listProviders() || [];
				var preferred = ['sensenova', 'deepseek', 'openrouter', 'nvidia'];
				var order = providers.slice().sort(function (a, b) {
					var ai = preferred.indexOf(a && a.id);
					var bi = preferred.indexOf(b && b.id);
					return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
				});
				for (var i = 0; i < order.length; i++) {
					var pid = order[i] && order[i].id;
					if (!pid) continue;
					this._modelCache = { provider: pid, model: null };
					return this._modelCache;
				}
			}
		} catch (e) { /* 放弃 */ }

		return null;
	}

	/**
	 * 旁路解释一段文本（不进入任何会话）。
	 * @param text - 用户选中的词、句子、报错或命令。
	 * @returns {Promise<{ok:boolean, text?:string, error?:string, provider?:string, model?:string}>}
	 */
	async explain(text) {
		try {
			var input = typeof text === 'string' ? text.trim() : '';
			if (!input) return { ok: false, error: '没有选中内容' };
			if (input.length > 2000) input = input.slice(0, 2000);

			var llm = this.hostCtx.get('llm');
			if (!llm || typeof llm.stream !== 'function') {
				return { ok: false, error: 'DSH 的 llm 服务不可用' };
			}

			var target = this.resolveTarget();
			if (!target || !target.provider) {
				return { ok: false, error: '没有找到可用的模型，请先在 DSH 里配置一个 provider' };
			}

			var provider = target.provider;
			var model = target.model;

			// 惰性解析模型 id（回退路径用）
			if (!model && typeof llm.listModels === 'function') {
				try {
					var models = await llm.listModels(provider);
					if (Array.isArray(models) && models.length > 0 && models[0] && models[0].id) {
						model = models[0].id;
						this._modelCache = { provider: provider, model: model };
					}
				} catch (e) { /* 下面统一报错 */ }
			}
			if (!model) return { ok: false, error: '没有找到可用模型' };

			var BlockAssembler = null;
			try {
				var mod = await import('@deepseek-ai/dsh-llm');
				BlockAssembler = mod && mod.BlockAssembler;
			} catch (e) { BlockAssembler = null; }

			var options = {
				provider: provider,
				model: model,
				messages: [
					{ role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] },
					{ role: 'user', content: [{ type: 'text', text: input }] }
				],
				maxTokens: 400
				// 注意：故意不传 sessionId —— 这是旁路调用，不挂任何会话
			};

			var chunks = llm.stream(options);
			var textOut = '';

			if (BlockAssembler) {
				var assembler = new BlockAssembler();
				for await (const chunk of chunks) {
					try { assembler.push(chunk); } catch (e) { /* 单块异常不影响整体 */ }
				}
				// 检查终止错误
				try {
					var fin = assembler.finish;
					var err = fin && typeof fin === 'object' ? fin.error : void 0;
					if (err) {
						var msg = err && err.message ? err.message : String(err);
						return { ok: false, error: '模型调用失败：' + msg, provider: provider, model: model };
					}
				} catch (e) { /* 忽略 */ }
				textOut = extractText(assembler.blocks());
			} else {
				// 没有 BlockAssembler 时的兜底：手工收集 text-delta
				var buf = [];
				for await (const chunk of chunks) {
					if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') buf.push(chunk.text);
				}
				textOut = buf.join('').trim();
			}

			if (!textOut) return { ok: false, error: '模型没有返回内容', provider: provider, model: model };
			return { ok: true, text: textOut, provider: provider, model: model };
		} catch (e) {
			var m = e && e.message ? e.message : String(e);
			return { ok: false, error: '解释失败：' + m };
		}
	}

	/**
	 * 探测可用性：告诉浏览器侧当前是否具备 AI 能力、用哪个模型。
	 * @returns {Promise<{ok:boolean, available:boolean, provider?:string, model?:string, error?:string}>}
	 */
	async capability() {
		try {
			var llm = this.hostCtx.get('llm');
			if (!llm || typeof llm.stream !== 'function') {
				return { ok: true, available: false, error: 'llm 服务不可用' };
			}
			var target = this.resolveTarget();
			if (!target || !target.provider) {
				return { ok: true, available: false, error: '没有可用模型' };
			}
			return { ok: true, available: true, provider: target.provider, model: target.model || '(自动)' };
		} catch (e) {
			return { ok: true, available: false, error: String((e && e.message) || e) };
		}
	}
}

// 手动标记远程方法（等价于 @Remote() 装饰器）。
// typert 协议用字符串键的 property descriptor 记录可远程调用的方法。
try {
	Object.defineProperty(TermGlossaryHost.prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([
				Object.freeze({ method: 'explain', invocation: Object.freeze({ kind: 'direct' }) }),
				Object.freeze({ method: 'capability', invocation: Object.freeze({ kind: 'direct' }) })
			])
		})
	});
} catch (e) { /* 标记失败时插件仍会激活，只是远程方法不可用 */ }

export { TermGlossaryHost };
export default TermGlossaryHost;
