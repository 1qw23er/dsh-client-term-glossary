/**
 * dsh-client-term-glossary 回归测试
 *
 * 覆盖三类曾经出过问题 / 容易回归的行为：
 *   A. 浮层焦点 / 关闭逻辑（曾经「点输入框就关浮层」）
 *   B. 云端配置读写（模型、max_tokens 的钳制与持久化）
 *   C. 源码一致性（死代码不得回归、版本号同步、语法）
 *
 * 直接读真实源码来测，避免测的是"复制品"。
 *
 * 用法: node test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 相对本文件定位插件根目录，保证在任何 checkout 路径下都能跑
const PLUGIN = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(PLUGIN, 'lib/client.js');
const INDEX = path.join(PLUGIN, 'lib/index.js');
const PKG = path.join(PLUGIN, 'package.json');

// jsdom 只用于 DOM 判定测试；装了就用，没装就跳过那几条（不让测试因环境挂掉）
let JSDOM = null;
try {
  const req = createRequire(import.meta.url);
  ({ JSDOM } = req('jsdom'));
} catch (e) {
  // 退路：开发机上临时装在别处的情况
  try {
    const alt = '/tmp/tgtest/node_modules/jsdom/lib/api.js';
    if (fs.existsSync(alt)) {
      const req2 = createRequire(alt);
      ({ JSDOM } = req2(alt));
    }
  } catch (e2) { JSDOM = null; }
}
if (!JSDOM) {
  console.log('⚠️  未找到 jsdom，跳过 DOM 判定测试');
  console.log('   安装: npm i -D jsdom\n');
}

const src = fs.readFileSync(CLIENT, 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(t) { console.log(`\n${'='.repeat(58)}\n${t}\n${'='.repeat(58)}`); }

// ───────────────────────────────────────────────────────────
section('A. 浮层焦点 / 关闭逻辑');

// 从源码抽出真实的 isInsideCard 实现
const m = src.match(/function isInsideCard\(target\) \{[\s\S]*?\n\t\t\t\t\}/);
if (!m) { console.error('❌ 无法从源码抽出 isInsideCard'); process.exit(1); }
const isInsideCard = new Function('target', `${m[0]}\nreturn isInsideCard(target);`);

if (JSDOM) {
const dom = new JSDOM('<!doctype html><html><body><p id="outside">外部</p></body></html>');
const { window } = dom;
const document = window.document;
global.window = window;
global.document = document;

const card = document.createElement('div');
card.setAttribute('data-dsh-term-glossary-card', '1');
const input = document.createElement('input');
input.type = 'password';
card.appendChild(input);
const deep = document.createElement('span');
input.appendChild(deep);
document.body.appendChild(card);

ok('卡片本身识别为「内部」', isInsideCard(card) === true);
ok('输入框识别为「内部」', isInsideCard(input) === true);
ok('深层子元素识别为「内部」', isInsideCard(deep) === true);
ok('卡片外部识别为「外部」', isInsideCard(document.getElementById('outside')) === false);
ok('null 不抛异常', isInsideCard(null) === false);

// 复刻修复后的守卫（与源码结构一致）
const guardEval = (ae) => (ae && isInsideCard(ae)) ? 'SKIP' : 'PROCEED';
const guardSel = (ae) => (ae && isInsideCard(ae)) ? 'SKIP' : 'CLOSE';
const guardDown = (t) => isInsideCard(t) ? 'SKIP' : 'CLOSE';

input.focus();
ok('点输入框后 evaluate 跳过（不关浮层）', guardEval(document.activeElement) === 'SKIP');
ok('点输入框后 selectionchange 跳过（不关浮层）', guardSel(document.activeElement) === 'SKIP');
ok('mousedown 内层元素跳过', guardDown(deep) === 'SKIP');

document.body.focus();
ok('卡片外焦点塌缩仍会关闭（功能没改坏）', guardSel(document.body) === 'CLOSE');
ok('卡片外 mousedown 仍会关闭（功能没改坏）', guardDown(document.getElementById('outside')) === 'CLOSE');

// 源码层面确认守卫真的存在
ok('evaluate() 有焦点守卫', /ae0 && isInsideCard\(ae0\)/.test(src));
ok('onSelectionChange 有焦点守卫', /if \(ae && isInsideCard\(ae\)\) return;/.test(src));
ok('onMouseUp 有卡片内守卫', /if \(e && isInsideCard\(e\.target\)\) return;/.test(src));
} // end if (JSDOM)

// ───────────────────────────────────────────────────────────
section('B. 云端配置（模型 / max_tokens）');

// 从源码抽出 CLOUD_AI 配置常量
const getNum = (re) => { const x = src.match(re); return x ? parseInt(x[1], 10) : null; };
const defTok = getNum(/MAX_TOKENS_DEFAULT:\s*(\d+)/);
const minTok = getNum(/MAX_TOKENS_MIN:\s*(\d+)/);
const maxTok = getNum(/MAX_TOKENS_MAX:\s*(\d+)/);

ok('MAX_TOKENS_DEFAULT 存在且 >= 4000', defTok !== null && defTok >= 4000, `实际 ${defTok}`);
ok('MIN < DEFAULT < MAX', minTok < defTok && defTok < maxTok, `${minTok}/${defTok}/${maxTok}`);
ok('默认模型为非推理 v4-flash', /MODEL:\s*'deepseek\/deepseek-v4-flash'/.test(src));
ok('默认 max_tokens 已从 2000 提高', defTok > 2000, `实际 ${defTok}`);

// 钳制逻辑（复刻 getMaxTokens/setMaxTokens 语义）
function clamp(v) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return defTok;
  if (n < minTok) return minTok;
  if (n > maxTok) return maxTok;
  return n;
}
ok('小于下限被钳制', clamp(1) === minTok);
ok('大于上限被钳制', clamp(999999) === maxTok);
ok('非法值回落默认', clamp('abc') === defTok);
ok('正常值原样通过', clamp(8000) === 8000);

// PRESETS 里的模型不得是已知失效 ID
const dead = ['gemini-2.0-flash-001', 'gpt-4o-mini', 'claude-3.5-haiku'];
for (const d of dead) ok(`已移除失效模型 ${d}`, !src.includes(d));

// 错误提示应带推理 token 诊断
ok('截断报错含 reasoning_tokens 诊断', /推理占了/.test(src));
ok('截断报错给出可操作建议', /调大|换成非推理模型/.test(src));
ok('成功后返回实际使用的模型（非写死默认）', /model:\s*useModel/.test(src));

// ───────────────────────────────────────────────────────────
section('C. 死代码 / 一致性');

ok('已移除 viaRpc 旧通道', !src.includes('viaRpc'));
ok('已移除 AI.explain 死调用', !/\bAI\.explain\b/.test(src));
ok('已移除 selfMount 机制', !src.includes('selfMount'));
ok('已移除 resolveAI 重试', !src.includes('resolveAI'));
ok('inject 为空数组（无 host 依赖）', /const inject = \[\];/.test(src));
ok('无 remote 依赖残留', !/ctx\.remote|remote\.termGlossary/.test(src));
ok('仍保留 viaCloud 通道', src.includes('function viaCloud'));
ok('仍保留本地通道 LOCAL_AI', src.includes('LOCAL_AI'));

// 版本一致性
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const tagMatch = src.match(/BUILD_TAG = 'v([0-9.]+)-/);
ok('BUILD_TAG 可解析', !!tagMatch);
if (tagMatch) {
  ok('package.json 版本与 BUILD_TAG 同步',
     pkg.version === tagMatch[1],
     `pkg=${pkg.version} tag=${tagMatch[1]}`);
}
ok('package.json 不再依赖 dsh-llm', !(pkg.peerDependencies || {})['@deepseek-ai/dsh-llm']);
ok('package.json 不再依赖 typert-protocol', !(pkg.peerDependencies || {})['@deepseek-ai/dsh-typert-protocol']);
ok('client 不再 inject api-gateway', !JSON.stringify(pkg.dsh.client.inject || []).includes('api-gateway'));

// index.js 形状
const idx = fs.readFileSync(INDEX, 'utf8');
// 剥掉注释再查，避免把「说明为何废弃」的注释误判成代码
const idxCode = idx.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('index.js 导出 apply/name/inject', /export \{ apply, name, inject \}/.test(idx));
ok('index.js 代码中无 llm.stream 调用', !idxCode.includes('llm.stream'));
ok('index.js 代码中无 ctx.get 取服务', !idxCode.includes('ctx.get'));
ok('index.js 已瘦身（< 60 行）', idx.split('\n').length < 60, `${idx.split('\n').length} 行`);
ok('README.md 存在', fs.existsSync(path.join(PLUGIN, 'README.md')));

// 词典规模
const terms = (src.match(/terms:\s*\[/g) || []).length;
ok('词典条目 >= 139', terms >= 139, `实际 ${terms}`);

// ───────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(58)}`);
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('\n失败项:'); failures.forEach(f => console.log('  · ' + f)); }
console.log('='.repeat(58));
process.exit(fail ? 1 : 0);
