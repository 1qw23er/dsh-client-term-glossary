import fs from 'node:fs';
const { Context, Service } = await import('@deepseek-ai/cordis');

// 1) 用模块加载器契约加载网关客户端 bundle
const src = fs.readFileSync('/home/ubuntu/.dsh/profiles/glossary-test/node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js', 'utf8');
let captured = null;
// 最小 DOM 桩（网关会碰 document/window）
const elStub = () => ({
  style: {}, dataset: {}, children: [], parentNode: null,
  setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
  appendChild(c){ return c; }, removeChild(c){ return c; },
  addEventListener(){}, removeEventListener(){},
  querySelector(){ return null; }, querySelectorAll(){ return []; },
  getBoundingClientRect(){ return {top:0,left:0,width:0,height:0}; },
  classList: { add(){}, remove(){}, contains(){ return false; } }
});
globalThis.document = {
  body: elStub(), head: elStub(), documentElement: elStub(),
  createElement: elStub, createTextNode: () => ({}),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(){}, removeEventListener(){},
  readyState: 'complete', visibilityState: 'visible'
};
globalThis.window = {
  __ModuleLoader__: { load: (o) => { captured = o; } },
  document: globalThis.document,
  location: { href: 'http://127.0.0.1:3099/', protocol: 'http:', host: '127.0.0.1:3099' },
  navigator: { userAgent: 'node' },
  addEventListener(){}, removeEventListener(){},
  setTimeout, clearTimeout, setInterval, clearInterval,
  WebSocket: class { constructor(){ this.readyState = 0; } addEventListener(){} send(){} close(){} },
  AbortController, AbortSignal
};
globalThis.WebSocket = globalThis.window.WebSocket;
try { Object.defineProperty(globalThis, 'location', { value: globalThis.window.location, configurable: true }); } catch(e) {}
try { Object.defineProperty(globalThis, 'navigator', { value: globalThis.window.navigator, configurable: true }); } catch(e) {}
// bundle 是脚本而非模块，用 Function 执行
new Function(src)();
if (!captured) { console.log('❌ 未捕获 bundle'); process.exit(1); }
console.log('✅ 加载网关 bundle:', captured.id);

const exportsObj = captured.factory((name) => {
  if (name === '@deepseek-ai/cordis') return { Context, Service };
  throw new Error('unknown require: ' + name);
});
console.log('  导出:', Object.keys(exportsObj).join(', '));
console.log('');

// 2) 构建最小 Cordis 树：注册 typert + connection 桩，再启用网关
const root = new Context();

// typert 服务桩（remotes.register 等）
const registered = [];
root.provide('typert', {
  remotes: { register: (c) => { registered.push(c); return () => {}; } },
  local: { hasSeen: () => false },
  lookups: { definitions: () => [], register: () => {} },
  contexts: { getClient: () => undefined, getHost: () => undefined }
});
root.provide('connection', {
  rpc: { open: undefined, call: async () => ({}) },
  start: (opts) => { return { stop: () => {} }; },
  registerGenerationSource: (src) => { return () => {}; },
  generation: {
    getSnapshot: () => ({ host: { home: '/tmp' } }),
    subscribe: (fn) => { return () => {}; },
    signal: new AbortController().signal,
    abort: () => {}
  },
  isLoopback: true
});
console.log('✅ typert + connection 桩已注册');
console.log('');

// 3) 启用网关（它的 apply 会 new ClientRemoteService(ctx)）
const applyFn = exportsObj.apply;
console.log('apply 类型:', typeof applyFn);
try {
  // Cordis 插件以函数形式调用
  const fiber = root.plugin({ name: 'api-gateway', apply: applyFn });
  await fiber;
  console.log('✅ 网关服务已启用');
} catch (e) {
  console.log('⚠️ 网关启用异常:', e.message);
}

// 4) 取 remote 服务并调 $mount
let remoteSvc = null;
try { remoteSvc = root.get('remote'); } catch (e) {}
console.log('remote 服务:', remoteSvc ? '✅ 已注册' : '❌ 未注册');
console.log('$mount 可用:', remoteSvc && typeof remoteSvc.$mount === 'function' ? '✅' : '❌');
console.log('');

if (remoteSvc && typeof remoteSvc.$mount === 'function') {
  function anySchema() { return { parse: (v) => v }; }
  const contribution = {
    package: 'dsh-client-term-glossary',
    descriptors: [
      { id:'dsh-client-term-glossary#termGlossary/explain', service:'termGlossary', namespace:'termGlossary',
        method:'explain', invocation:{kind:'direct'},
        parameters:[{name:'text',wire:'text',source:'json',codec:{mode:'strict',create:anySchema}}],
        result:{mode:'strict'} },
      { id:'dsh-client-term-glossary#termGlossary/capability', service:'termGlossary', namespace:'termGlossary',
        method:'capability', invocation:{kind:'direct'}, parameters:[], result:{mode:'strict'} }
    ]
  };
  try {
    const dispose = await remoteSvc.$mount(contribution);
    console.log('🎉 $mount 成功！');
    let ns = null;
    try { ns = root.get('remote.termGlossary'); } catch (e) { console.log('   get 异常:', e.message); }
    console.log('   remote.termGlossary 服务:', ns ? '✅ 已创建' : '❌ 未找到');
    if (ns) {
      console.log('   可用方法:', ['explain','capability'].filter(m => typeof ns[m] === 'function').join(', ') || '(无)');
    }
    console.log('   dispose 是函数:', typeof dispose === 'function');
  } catch (e) {
    console.log('❌ $mount 失败:', e.message);
  }
}
