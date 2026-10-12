# 调查报告：typert 网关如何暴露 `remote.<namespace>` 服务

> 撰写日期：2026-10-12
> 环境：DSH `0.2.1-alpha.2` / profile `web`
> 触发原因：为「旁路 AI 解释」功能接入 host↔client RPC 时，插件永久 pending 导致 DSH 启动失败

---

## TL;DR

**第三方 DSH 客户端插件不能通过 `inject: ["remote.<ns>"]` 声明依赖**，因为该服务只会由**构建时硬编码在 `dsh-api-remotes` 里的 25 个官方贡献**创建。

正确做法是：`inject: ["remote"]` + 在插件内自己调用 `ctx.remote.$mount(contribution)`。

---

## 一、`remote.<namespace>` 服务的诞生链路

```
ctx.remote.$mount(contribution)              ← 唯一入口
  └─ ClientRemoteService.$mount()
      └─ mountContribution(callerCtx, contribution)
          ├─ callerCtx.typert.remotes.register(contribution)
          ├─ 按 descriptor.namespace 分组
          └─ installNamespace(name, descriptors)
              └─ createNamespace(name, descriptors)
                  └─ ownerCtx.plugin({ name: `remote.${name}`, ... })
                      └─ new RemoteNamespaceService(ctx, name, invokeRemote)
                          └─ super(ctx, remoteServiceKey(name))
                              └─ 服务注册为 "remote.<namespace>"
```

关键代码位置（`@deepseek-ai/dsh-api-gateway/lib/client.js`）：

| 行号 | 内容 |
|---|---|
| 1636 | `async $mount(contribution)` |
| 1662 | `async mountContribution(callerCtx, contribution)` |
| 1721 | `async installNamespace(name, descriptors)` |
| 1739 | `async createNamespace(name, descriptors)` |
| 1926-1930 | `constructor(ctx, name, invokeRemote) { super(ctx, remoteServiceKey(name)) }` |
| 1954 | `install(method, kind, value)` — 在服务实例上定义方法 |
| 2041 | `return \`remote.${namespace}\`` |

---

## 二、为什么官方插件能用

**全仓库只有一处调用 `$mount`**：

```
@deepseek-ai/dsh-api-remotes/lib/client.js:13858
    disposers.push(await ctx.remote.$mount(contribution));
```

而其输入是一个**硬编码的、构建时生成的数组**（`dsh-api-remotes/lib/client.js:13830-13856`）：

```javascript
for (const contribution of [
    TYPERT_REMOTE$24,  // @deepseek-ai/dsh-client-product-analytics
    TYPERT_REMOTE$23,
    TYPERT_REMOTE$21,
    TYPERT_REMOTE$19,
    TYPERT_REMOTE$20,
    TYPERT_REMOTE$17,
    TYPERT_REMOTE$15,
    TYPERT_REMOTE$14,
    TYPERT_REMOTE$16,
    TYPERT_REMOTE$11,
    TYPERT_REMOTE$13,
    TYPERT_REMOTE$12,
    TYPERT_REMOTE$10,
    TYPERT_REMOTE$8,
    TYPERT_REMOTE$7,
    TYPERT_REMOTE$6,
    TYPERT_REMOTE$9,
    TYPERT_REMOTE$5,
    TYPERT_REMOTE$4,
    TYPERT_REMOTE$3,
    TYPERT_REMOTE$2,
    TYPERT_REMOTE,
    TYPERT_REMOTE$1,
    TYPERT_REMOTE$18,
    TYPERT_REMOTE$22
]) disposers.push(await ctx.remote.$mount(contribution));
```

**这 25 个贡献是 `packages/*/src/index.ts` 在构建时按 TypeScript 类型生成的产物**（每个描述符都带 `sourceLocation: {file, line, column}` 指回 TS 源码）。

第三方插件包不在这个列表里，也不会被自动追加。

> 佐证：官方 `@deepseek-ai/dsh-api-workspace-files` 敢写
> `const inject = ["resources", "remote", "remote.workspaceFiles"]`，
> 正是因为它的贡献被预编进了上述数组。

---

## 三、贡献描述符的完整结构

以 `@deepseek-ai/dsh-client-product-analytics` 为例：

```javascript
{
    package: "@deepseek-ai/dsh-client-product-analytics",
    descriptors: [
        {
            id: "@deepseek-ai/dsh-client-product-analytics#productAnalytics/enabled",
            service: "productAnalytics",          // host 侧服务键
            namespace: "productAnalytics",        // 客户端命名空间
            method: "enabled",
            invocation: { kind: "direct" },       // 或 { kind: "context", context, wire, codec }
            parameters: [],                        // [{name, wire, source, codec}]
            result: {
                mode: "strict",
                typeSymbol: "...",
                create: <schemastery schema thunk>  // () => schema
            },
            sourceLocation: { file: "...", line: 51, column: 3 }
        }
    ]
}
```

### 参数结构

```javascript
{
    name: "event",                 // 业务参数名
    wire: "event",                 // 线上字段名（须唯一）
    source: "json",                // 或 "lookup"
    lookup: "<key>",               // source === "lookup" 时
    codec: {                       // 必须 mode === "strict"
        mode: "strict",
        typeSymbol: "...",
        create: <schema thunk>
    }
}
```

---

## 四、校验要求（客户端）

### `validateContribution`（client.js:1684）

- 同一 namespace 内不得重复 method
- 每个 descriptor 必须通过 `requireStrictInputs`

### `requireStrictInputs`（client.js:2067）

```javascript
for (const parameter of descriptor.parameters) requireStrictCodec(parameter.codec, ...);
if (descriptor.uplink !== void 0) requireStrictCodec(descriptor.uplink.codec, ...);
if (descriptor.invocation.kind === "context") requireStrictCodec(descriptor.invocation.codec, ...);
```

### `requireStrictCodec`（client.js:2073）

```javascript
if (codec.mode !== "strict") throw new Error(`client api: generated Remote ${endpoint} field ... has no strict codec`);
```

**只检查 `codec.mode === "strict"`**，不检查 schema 内容。

### `RemoteNamespaceService.assertMethodAvailable`（client.js:1923）

方法名不得与 `REMOTE_NAMESPACE_FIELDS`（`ctx` / `empty` / `invokeRemote` / `methods` …）或 `RemoteNamespaceService.prototype` 成员冲突。

---

## 五、host 侧：自动反射，无需手写 schema

Host 端不要求手写参数 schema。`resolveSrcDescriptor`（`dsh-api-gateway/lib/index.js:1006`）会：

1. 遍历已注册服务，找 `typertRemote` 属性（由 `TypertRemoteService` 构造时通过 `bindTypertRemote` 绑定）
2. 用 `remoteMethods(original)` 读取原型上的远程方法标记
3. 调 `srcDescriptor(binding, marker, method, endpoint)`，其中：
   - `methodParameterNames(...)` **反射真实函数签名**得到参数名
   - 每个参数包装成 `{ name, wire: name, source: "json", codec: { mode: "src-json" } }`
   - 名为 `signal` 的末位参数自动识别为取消信号

**因此 host 侧只需要标记方法，不需要声明参数。**

### 远程方法标记（typert-protocol）

装饰器 `@Remote()` 编译后的等价物是一个**字符串键**的原型描述符：

```javascript
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";

Object.defineProperty(MyService.prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({
        version: 1,
        methods: Object.freeze([
            Object.freeze({ method: "explain", invocation: Object.freeze({ kind: "direct" }) })
        ])
    })
});
```

结构（`dsh-typert-protocol/lib/index.js:248-268`）：

```javascript
{
    version: 1,
    methods: [
        {
            method: "explain",
            exportName?: "...",              // 省略时等于 method
            mode?: "stream",                 // 省略时为普通调用
            invocation: { kind: "direct" }    // freeze 过的
        }
    ]
}
```

---

## 六、调用时的编解码

### 客户端 → 线上（`prepareInvocation`，client.js:1822）

```javascript
const args = Object.create(null);
descriptor.parameters.forEach((parameter) => {
    const value = values[valueIndex];
    if (value !== void 0) args[parameter.wire] = value;   // 仅按 wire 名打包
});
```

**注意：直接调用路径不调用 `codec.create` 编码参数**，参数按 `wire` 名原样传出。

### 线上 → host（`assertExactArguments` + `resolveParameter`，index.js:1497 / 1096）

```javascript
const expected = new Set(descriptor.parameters.map((p) => p.wire));
// 缺字段/多字段都会抛 gateway/arguments-invalid

async resolveParameter(parameter, args, endpoint) {
    if (!Object.hasOwn(args, parameter.wire)) return void 0;
    const value = decode(parameter.codec, args[parameter.wire], endpoint, parameter.wire);
    ...
}
```

此处的 `descriptor` 是 **host 侧**的（来自 SRC 反射），所以参数名必须与真实函数签名一致。

### `decode`（index.js:1510）

```javascript
function decode(codec, value, endpoint, field) {
    if (codec.mode === "strict") {
        value = codec.create().parse(value);   // ← 真会调用 create()
        if (value === void 0) return value;
    }
    assertJsonValue(value, new Set());         // src-json 走这里
    return value;
}
```

**`codec.create()` 在 host 侧会被真实调用**，必须返回一个带 `.parse()` 的对象（即 schemastery schema）。

### 返回值（client.js:1800）

```javascript
value: descriptor.result.mode === "strict" && descriptor.result.decode !== void 0
    ? descriptor.result.decode(result.value)
    : result.value
```

`result.decode` **可选**——不提供就原样返回。

---

## 七、失败模式对比

| | 错误做法 | 正确做法 |
|---|---|---|
| 依赖声明 | `inject: ["remote", "remote.termGlossary"]` | `inject: ["remote"]` + 自 mount |
| Cordis 行为 | 硬依赖：服务不就绪则**永不激活** | 服务必然存在，插件正常激活 |
| mount 失败时 | —— | 只是该功能降级，不影响启动 |
| 后果 | 插件永久 `pending` → `N entry did not activate` → **启动失败** | 安全降级 |

**实测错误信息**：

```
web boot: 1 entry did not activate
dsh-client-term-glossary: pending (waiting for service: remote.termGlossary)
```

---

## 八、可行的自 mount 方案

```javascript
const inject = ["remote"];   // 只依赖必然存在的 remote 服务

async function apply(ctx) {
    try {
        const dispose = await ctx.remote.$mount({
            package: "my-plugin",
            descriptors: [{
                id: "my-plugin#myNs/myMethod",
                service: "myNs",              // 与 host 服务键一致
                namespace: "myNs",
                method: "myMethod",
                invocation: { kind: "direct" },
                parameters: [{
                    name: "text", wire: "text", source: "json",
                    codec: { mode: "strict", create: () => string() }   // schemastery
                }],
                result: { mode: "strict" }    // decode 可省略
            }]
        });
        // 此后 ctx.remote.myNs.myMethod("...") 可用
        if (ctx.effect) ctx.effect(() => dispose);
    } catch (e) {
        // 必须兜底：mount 失败只降级，绝不影响启动
        console.warn("[my-plugin] remote mount failed:", e);
    }
}
```

### 注意点

1. **`wire` 名必须与 host 方法参数名一致**（host 用反射得到的名字校验）
2. **`service` 必须与 host 服务键一致**（即 `TypertRemoteService` 构造时传的 key）
3. **`namespace` 决定服务名** `remote.<namespace>`
4. **`codec.create()` 会被 host 调用**，必须返回可用 schema
5. **务必 try/catch**，mount 失败不能影响插件激活

---

## 九、隔离测试验证结果（2026-10-12）

测试环境：独立 profile `glossary-test`（端口 3099），**未触碰生产 profile `web`**。

### ✅ 已验证通过

| 验证项 | 方法 | 结果 |
|---|---|---|
| **自 mount 创建命名空间服务** | 真实实例化网关 `ClientRemoteService`，调真 `$mount` | ✅ `remote.termGlossary` 成功创建，带 `explain`/`capability` 方法 |
| **贡献描述符通过校验** | 走真实 `validateContribution` 路径 | ✅ 无 `arguments-invalid`，无 strict codec 报错 |
| **dispose 可用** | `$mount` 返回 disposer | ✅ 返回函数，可挂 `ctx.effect` |
| **host 服务注册** | 实例化 `TermGlossaryHost` | ✅ `serviceKey`/`namespace` 均为 `termGlossary` |
| **host SRC 反射发现方法** | `remoteMethods(host)` | ✅ 发现 `explain`、`capability` |
| **参数名匹配** | 反射函数签名 vs 手写 wire 名 | ✅ host 反射出 `text`，与贡献里 `wire:"text"` **完全一致** |
| **参数校验通过** | 无真实连接下调用 `explain("subagent")` | ✅ 未报 `arguments-invalid`，仅卡在传输层 |
| **插件激活** | 独立 profile 启动 | ✅ **0 个 `did not activate`**，无 `pending` |
| **不破坏启动** | 对比生产 profile | ✅ 生产 3080 全程未受影响 |

### 复现脚本

| 脚本 | 作用 |
|---|---|
| `test/self-mount.spec.mjs` | 真实网关 `$mount` 全链路验证（含 DOM/Cordis 桩） |
| `test/host-remote-methods.spec.mjs` | host 侧服务注册 + SRC 反射参数名验证 |

### 传输层失败的正确形态

无真实连接时，网关**不抛异常**，而是返回结构化 `RemoteError`：

```javascript
{ ok: false, error: { code: "gateway/internal", isDSHRemoteError: true, ... } }
```

**客户端必须处理这种"返回的错误对象"**，不能假设会 throw。

### ⏳ 仍需真实浏览器验证

- [ ] 浏览器加载客户端插件后，自 mount 是否在真实环境成功
- [ ] 端到端 RPC：客户端 `explain()` → host `ctx.llm.stream()` → 返回解释
- [ ] 与 `dsh-api-remotes` 的 25 个官方贡献是否有命名冲突（静态分析无冲突）

---

## 十、相关源码位置速查

| 内容 | 位置 |
|---|---|
| `$mount` / `mountContribution` | `@deepseek-ai/dsh-api-gateway/lib/client.js:1636,1662` |
| `installNamespace` / `createNamespace` | 同上 `:1721,1739` |
| `RemoteNamespaceService` | 同上 `:1919` |
| `validateContribution` / `requireStrictInputs` | 同上 `:1684,2067` |
| `REMOTE_NAMESPACE_FIELDS` | 同上 `:2032` |
| 官方贡献硬编码列表 | `@deepseek-ai/dsh-api-remotes/lib/client.js:13830` |
| `$mount` 唯一调用点 | 同上 `:13858` |
| host 侧 `resolveSrcDescriptor` / `srcDescriptor` | `@deepseek-ai/dsh-api-gateway/lib/index.js:1006,1018` |
| `assertExactArguments` / `decode` | 同上 `:1497,1510` |
| 远程方法标记 | `@deepseek-ai/dsh-typert-protocol/lib/index.js:135,248` |
| `TypertRemoteService` / `bindTypertRemote` | 同上 `:146,159` |
