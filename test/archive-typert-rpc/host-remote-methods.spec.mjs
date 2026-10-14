// 验证 host 侧：服务注册 + SRC 反射能发现远程方法
import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import Host from './node_modules/dsh-client-term-glossary/lib/index.js';

const root = new Context();
const host = new Host(root, {});

console.log('=== host 服务注册 ===');
console.log('  service name:', host.name);
console.log('  typertRemote:', host.typertRemote ? JSON.stringify({
  serviceKey: host.typertRemote.serviceKey,
  namespace: host.typertRemote.namespace
}) : '❌ 无');
console.log('');

console.log('=== SRC 反射：remoteMethods() 能发现的方法 ===');
const methods = remoteMethods(host);
console.log('  发现方法数:', methods.length);
for (const m of methods) {
  console.log('   -', m.method, '| invocation:', JSON.stringify(m.invocation), '| mode:', m.mode ?? '(普通)');
}
console.log('');

console.log('=== 方法签名（host 用反射取参数名）===');
for (const m of methods) {
  const fn = host[m.method];
  console.log('  ' + m.method + ':');
  console.log('    是函数:', typeof fn === 'function');
  if (typeof fn === 'function') {
    // 提取参数名（host 的 methodParameterNames 做同样的事）
    const src = fn.toString();
    const match = src.match(/^[^(]*\(([^)]*)\)/);
    const params = match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : [];
    console.log('    参数名:', params.length ? params.join(', ') : '(无)');
  }
}
console.log('');
console.log('=== 结论 ===');
const hasExplain = methods.some(m => m.method === 'explain');
const hasCap = methods.some(m => m.method === 'capability');
console.log('  explain 可远程调用:', hasExplain ? '✅' : '❌');
console.log('  capability 可远程调用:', hasCap ? '✅' : '❌');
