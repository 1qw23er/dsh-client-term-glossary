window.__ModuleLoader__.load({
	id: "dsh-client-term-glossary",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// dsh-client-term-glossary · 浏览器侧入口（v0.2）
		//
		// 划词即解释：选中 DSH/编程术语、报错、命令，旁边浮出大白话解释卡片。
		//   纯客户端、零联网、零 AI 调用 —— 不进主对话、不打扰主任务。
		//
		// v0.2 相比 v0.1：
		//   · 词典 22 → 130+ 条（DSH 概念 / AI / 编程 / 网络系统 / 报错关键词）
		//   · 模糊匹配：选中“什么是 subagent”“选中带标点或大小写混杂”都能命中
		//   · 智能包含匹配：选中一句话时，若其中只含一个已知术语，也能命中
		//   · 报错识别：选中报错文本 → 给“怎么读这个错”的本地提示
		//   · 命令识别：选中命令行 → 给“命令怎么读”的本地提示
		//   · 卡片底部「复制给主助手」按钮（零 AI 依赖，真实可用）

		var React = require("react");
		var ReactDOM = require("react-dom");
		var createRoot = require("react-dom/client").createRoot;
		var createPortal = ReactDOM.createPortal;

		/**
		 * host 半侧的远程服务引用（在 apply 里注入）。
		 * 通过它做「旁路 AI 解释」：独立调用模型，不进入任何会话。
		 */
		var AI = null;

		// ============================================================================
		// 本地大白话词典 —— 想加词/改解释，直接增删 GLOSSARY 数组即可。
		// 字段：terms 触发词 / oneLine 一句话 / analogy 打比方 / inDsh 在DSH里 / remember 要记吗
		// ============================================================================
		var GLOSSARY = [
			// ---------- DSH 核心概念 ----------
			{ terms: ['cordis'], oneLine: 'DSH 的“插件总调度室”，管哪些插件上线、谁先谁后、谁下线。', analogy: '像大楼的物业前台：每种功能（插件）进场退场都到它这儿登记、排顺序。', inDsh: '管插件加载、依赖顺序、热更新——DSH 一切插件能力的地基。', remember: '不用记。知道“是插件管家”就够了。' },
			{ terms: ['subagent', '子助手', '子智能体', '子 agent', '子代理'], oneLine: '主助手派出去的“临时小帮手”，只干一件独立小活，干完就退场。', analogy: '你正忙着，叫个小弟去跑腿取快递；他取完把东西交给你就走。', inDsh: '主助手忙不过来、或想把一件事单独交给干净小帮手时用它。', remember: '不用记。知道“是临时帮手”就行。' },
			{ terms: ['plugin', '插件'], oneLine: '给 DSH 加新能力的“配件”，装上就能用、卸了就走。', analogy: '像给手机装 App：要什么功能装哪个，不想要就删。', inDsh: '联网搜索、划词解释、知识库等都是插件，按需装载。', remember: '不用记。' },
			{ terms: ['preset', '预设'], oneLine: '一套存好的插件组合，能整体复用、重启不丢。', analogy: '像手机“场景模式”：一键切到那套设置。', inDsh: '把常用插件打包成预设，下次直接挂上。', remember: '不用记。' },
			{ terms: ['bundle', '捆绑包', '插件包'], oneLine: '打包在一起、一起装一起卸的一组插件。', analogy: '像套餐：一份钱一份组合。', inDsh: 'DSH 启动时按 bundle 列表把一批插件一起装上。', remember: '不用记。' },
			{ terms: ['loader', '加载器'], oneLine: '负责把插件“读进来并启动”的那个部件。', analogy: '像影院检票员：按顺序验票放行。', inDsh: '决定插件按什么顺序被加载启动。', remember: '不用记。' },
			{ terms: ['profile', '档案', '配置档'], oneLine: '一整套 DSH 配置方案，不同场景用不同档案。', analogy: '像游戏的不同存档：各自一套装备设置，互不干扰。', inDsh: '比如 web 档案、headless 档案，各装各的插件。', remember: '不用记。' },
			{ terms: ['slot', '插槽'], oneLine: '界面上的“预留卡槽”，插件把按钮/面板塞进去。', analogy: '像墙上预留的插座位。', inDsh: '插件不用自己找位置，往 DSH 预留 slot 登记就显示。', remember: '不用记。' },
			{ terms: ['client plugin', '客户端插件'], oneLine: '只管界面那部分的插件，负责你看到的按钮和浮层。', analogy: '像店里摆货招呼客人的店员，仓库的事不归他管。', inDsh: '划词解释、界面小工具这类只改界面的插件。', remember: '不用记。' },
			{ terms: ['host plugin', '服务端插件'], oneLine: '在后台运行的插件，管数据、文件、任务这些看不见的活。', analogy: '像后厨：你在前厅看不到，但菜都是它做的。', inDsh: '读写文件、跑命令、连数据库的插件都在 host 侧。', remember: '不用记。' },
			{ terms: ['hmr', '热更新', '热重载', '热模块替换'], oneLine: '改了插件代码，不用刷新整个页面就立刻生效。', analogy: '像换零件不停机：机器还在转就把零件换新的。', inDsh: '开发插件时改完代码界面自动用新版，省得重开。', remember: '不用记。看到“热更新”理解为“改完即时生效”。' },
			{ terms: ['assemble', '组装', '自动组装'], oneLine: '按你的需求，自动挑插件、装插件、配好一套环境。', analogy: '像跟装修队说“我要能办公能看片”，他自动配齐家具电器。', inDsh: '不用自己一个个找插件，说清需求让它自动配。', remember: '不用记。' },
			{ terms: ['agent', '智能体', '助手'], oneLine: '就是正在帮你干活的那个 AI 助手本体。', analogy: '像能自己想办法、自己动手的员工，不是只会查资料的客服。', inDsh: '能调用工具、读写文件、分派子任务的那个“你”。', remember: '不用记。' },
			{ terms: ['tool', '工具'], oneLine: '助手能调用的一个具体本事，比如搜网页、跑命令。', analogy: '像员工手里的工具箱：锤子螺丝刀各是一件。', inDsh: '联网搜索、读写文件、执行脚本都是一个个 tool。', remember: '不用记。' },
			{ terms: ['skill', '技能'], oneLine: '预先写好的一套做事步骤，需要时助手照着执行。', analogy: '像照着菜谱做菜，不用每次自己琢磨。', inDsh: '把复杂流程固化成 skill，助手用起来更稳。', remember: '不用记。' },
			{ terms: ['session', '会话'], oneLine: '一次完整对话的“存档”，关掉页面下次还能接着聊。', analogy: '像聊天软件的对话框，记录都在随时能翻出来。', inDsh: '你每次和助手聊天就是一个 session。', remember: '不用记。' },
			{ terms: ['workspace', '工作区'], oneLine: '助手干活时能读写的那个文件夹范围。', analogy: '像给你划定的办公桌：桌上的随便动，隔壁的别碰。', inDsh: '决定助手能看哪些文件、改哪些文件。', remember: '不用记。' },
			{ terms: ['sandbox', '沙箱'], oneLine: '给助手圈出的“安全活动区”，出格的事干不了。', analogy: '像儿童游乐场的围栏：里面随便玩，出不去也碰不到危险。', inDsh: '限制助手只能动授权范围内的文件。', remember: '不用记。' },
			{ terms: ['rpc'], oneLine: '前后两端（界面和后台）之间“打电话”的固定方式。', analogy: '像点外卖：你报菜名，对方按固定格式接单回结果。', inDsh: '界面点按钮要后台干活，就走 rpc 传话。', remember: '不用记。' },
			{ terms: ['patch', '补丁层'], oneLine: '在别人的配置上“叠一层”自己的改动，不改原文件。', analogy: '像在照片上贴便利贴：原片不动，效果叠加。', inDsh: 'cordis.patch.yml 就是在基础组合上叠加你的插件。', remember: '不用记。' },
			{ terms: ['inject', '依赖注入'], oneLine: '插件声明“我需要谁先准备好”，系统负责等它就绪。', analogy: '像点菜时说明“要等汤先上”，服务员自会安排顺序。', inDsh: '插件写 inject 声明依赖，DSH 保证启动顺序。', remember: '不用记。' },
			{ terms: ['entry', '条目'], oneLine: '插件清单里的“一行”，代表一个要启动的东西。', analogy: '像排队名单上的一个名字。', inDsh: 'activate 失败就是某个 entry 没起来。', remember: '不用记。' },

			// ---------- AI / 大模型 ----------
			{ terms: ['llm', '大模型', '大语言模型'], oneLine: '能理解和生成文字的 AI 模型，就是“会聊天的那个大脑”。', analogy: '像一个读遍了书、能接话也能写东西的万能实习生。', inDsh: 'DSH 背后干活的脑子，可换不同家（DeepSeek、GLM 等）。', remember: '不用记。' },
			{ terms: ['token', '词元'], oneLine: 'AI 计费和计量的最小单位，大致相当于“一小段字”。', analogy: '像打车按里程计费，不按说了几句话算。', inDsh: '你看到的用量、花费都按 token 数算。', remember: '不用记。' },
			{ terms: ['context', '上下文'], oneLine: '助手回答前“能看到的全部信息”，包括对话和文件。', analogy: '像开会时手头的所有资料：越全结论越靠谱。', inDsh: '上下文越长记得越多，但更费钱更慢。', remember: '不用记。' },
			{ terms: ['context window', '上下文窗口'], oneLine: 'AI 一次最多能“记住”多少内容，超了就得忘掉前面。', analogy: '像桌子大小：文件太多就摆不下，得先收走一些。', inDsh: '窗口越大越能处理长文档，但成本更高。', remember: '不用记。' },
			{ terms: ['prompt', '提示词'], oneLine: '你发给助手的“指令原文”，也是助手背后的行动准则。', analogy: '像给员工的工单：写得越清楚，干得越准。', inDsh: '你打的每句话是 prompt，系统规则也是 prompt。', remember: '不用记。' },
			{ terms: ['system prompt', '系统提示词'], oneLine: '你消息之外、系统悄悄给助手的“岗位说明书”。', analogy: '像员工入职时发的员工手册，客人看不到但影响他怎么做。', inDsh: '决定助手默认的性格、规矩和能干什么。', remember: '不用记。' },
			{ terms: ['kv cache', 'kv缓存', '前缀缓存'], oneLine: '把上一段对话“算到一半”的结果存着，下一段接着算，省时省钱。', analogy: '像读到一半夹了书签：下次接着读，不用从头翻。', inDsh: '连续发消息会复用缓存回答更快；改动开头会作废重来。', remember: '不用记。' },
			{ terms: ['compaction', '压缩', '上下文压缩'], oneLine: '对话太长时，把前面内容浓缩成摘要，腾空间继续聊。', analogy: '像笔记记满了写个提要，细节收起来重点还在。', inDsh: '聊得特别久时自动发生，让你能一直聊下去。', remember: '不用记。' },
			{ terms: ['hallucination', '幻觉', '胡说'], oneLine: 'AI 一本正经地编了个不存在的东西。', analogy: '像记不清还硬答的同事：语气很确定，内容是错的。', inDsh: '所以重要信息要让它查证，别全信。', remember: '记一句：AI 说的要核实。' },
			{ terms: ['rag', '检索增强'], oneLine: '先查资料再回答，让 AI 基于真实文档说话。', analogy: '像开卷考试：先翻书找依据，再写答案。', inDsh: '知识库问答就是 RAG：先检索再让模型总结。', remember: '不用记。' },
			{ terms: ['embedding', '向量', '向量化'], oneLine: '把文字变成一串数字，让机器能算“意思像不像”。', analogy: '像给每句话发个坐标：意思近的坐标就靠得近。', inDsh: '知识库检索靠它找出最相关的段落。', remember: '不用记。' },
			{ terms: ['inference', '推理调用'], oneLine: '模型“思考并生成回答”的这个动作。', analogy: '像员工真正动手干活的那段时间。', inDsh: '每次问答都触发一次 inference，按量计费。', remember: '不用记。' },
			{ terms: ['temperature', '温度'], oneLine: '控制 AI 回答的随机性：越低越稳，越高越发散。', analogy: '像调收音机：稳一点听得清，飘一点可能有惊喜。', inDsh: '要准确答案调低，要创意调高。', remember: '不用记。' },
			{ terms: ['fine-tuning', '微调'], oneLine: '拿自己的数据再训练一下模型，让它更懂你的领域。', analogy: '像新人入职后的专项培训。', inDsh: '普通使用一般用不上，提示词就够。', remember: '不用记。' },
			{ terms: ['multimodal', '多模态'], oneLine: '不光能读字，还能看图、听声音的 AI。', analogy: '像既能看文字又能看图的助手。', inDsh: '能理解截图、图片的模型就是多模态。', remember: '不用记。' },

			// ---------- 编程 / 工程 ----------
			{ terms: ['api'], oneLine: '程序之间约定好的“点菜窗口”，按格式请求就给你结果。', analogy: '像餐厅点菜窗口：报菜名，后厨做好递出来。', inDsh: '插件之间、前后端之间都靠 api 传数据。', remember: '不用记。' },
			{ terms: ['sdk'], oneLine: '别人打包好的工具包，用它能省很多自己造轮子的功夫。', analogy: '像宜家的整套家具包：零件和说明书都齐了。', inDsh: '开发插件会用 DSH 提供的 SDK。', remember: '不用记。' },
			{ terms: ['npm', 'npm 包'], oneLine: 'JavaScript 的“应用商店”，几百万个现成代码包在这下载。', analogy: '像手机应用商店，只不过装的是代码零件。', inDsh: '插件通常从 npm 安装。', remember: '不用记。' },
			{ terms: ['pnpm'], oneLine: '一个更快更省空间的包管理器，和 npm 干同样的活。', analogy: '像同一个超市的另一条更快的结账通道。', inDsh: 'DSH 装插件默认用它。', remember: '不用记。' },
			{ terms: ['node', 'nodejs', 'node.js'], oneLine: '让 JavaScript 能在电脑上（而不只是浏览器里）跑起来的运行环境。', analogy: '像给一种语言配了个能在本地干活的翻译。', inDsh: 'DSH 的后台就是用 node 跑的。', remember: '不用记。' },
			{ terms: ['repo', 'repository', '仓库'], oneLine: '存放代码和它全部修改历史的地方。', analogy: '像带时间机器的文件夹：每次改动都留档。', inDsh: '插件源码通常放在 Git 仓库里。', remember: '不用记。' },
			{ terms: ['git'], oneLine: '记录代码每次改动的工具，能回退、能对比、能多人协作。', analogy: '像文档的“修订记录”，还能一键回到任意旧版本。', inDsh: '管理插件源码、看改了什么。', remember: '不用记。' },
			{ terms: ['commit', '提交'], oneLine: '把一次改动“存档”进 Git 的动作。', analogy: '像游戏存档：这一刻的状态被记下来了。', inDsh: '改动历史里一条条记录就是 commit。', remember: '不用记。' },
			{ terms: ['branch', '分支'], oneLine: '从主线分出去的一条独立开发线，改坏了不影响主线。', analogy: '像从主干分出来的岔路，走不通还能回来。', inDsh: '开发新功能常先开分支。', remember: '不用记。' },
			{ terms: ['merge', '合并'], oneLine: '把一条分支的改动并回主线。', analogy: '像两条路汇成一条。', inDsh: '功能做完就 merge 回主分支。', remember: '不用记。' },
			{ terms: ['diff', '差异'], oneLine: '两份代码/文件“哪里不一样”的对照。', analogy: '像改作文的红笔标记，只标出改动处。', inDsh: '助手改完文件会给你看 diff。', remember: '不用记。' },
			{ terms: ['build', '构建', '编译'], oneLine: '把源码“加工”成能直接运行的东西。', analogy: '像把食材加工成能直接吃的成品菜。', inDsh: '插件发布前要先 build。', remember: '不用记。' },
			{ terms: ['deploy', '部署'], oneLine: '把做好的程序放到真正给人用的环境里跑起来。', analogy: '像菜品做完端上桌，而不是留在后厨。', inDsh: '插件装到 profile 里就能用，算一种部署。', remember: '不用记。' },
			{ terms: ['runtime', '运行时'], oneLine: '程序实际跑起来的那个环境和时刻。', analogy: '像演出的现场，不是排练。', inDsh: '插件分“构建时”和“运行时”两种错误。', remember: '不用记。' },
			{ terms: ['esm', 'es module'], oneLine: 'JavaScript 官方的模块写法（用 import/export）。', analogy: '像普通话：官方标准，大家都能听懂。', inDsh: '现代插件大多用 ESM 写。', remember: '不用记。' },
			{ terms: ['cjs', 'commonjs'], oneLine: 'JavaScript 早期的模块写法（用 require/module.exports）。', analogy: '像方言：老代码里常见。', inDsh: '老插件可能是 CJS，混用要注意。', remember: '不用记。' },
			{ terms: ['require', 'import'], oneLine: '“把别处的代码引进来用”的那句话。', analogy: '像做菜时从冰箱拿食材。', inDsh: '插件顶部会 require 它需要的零件。', remember: '不用记。' },
			{ terms: ['async', '异步'], oneLine: '不等这一步做完就先干别的，做完了再回来处理。', analogy: '像烧水时顺手把菜切了，不用干站着等水开。', inDsh: '联网、读文件这类慢操作都是异步的。', remember: '不用记。' },
			{ terms: ['promise'], oneLine: '一个“将来会给你结果”的承诺对象。', analogy: '像取餐号：现在没菜，响了就来拿。', inDsh: '异步操作常返回 promise，等着它完成。', remember: '不用记。' },
			{ terms: ['callback', '回调'], oneLine: '“做完了叫我一声”的那个函数。', analogy: '像快递到了给你打电话。', inDsh: '注册事件监听就是在写 callback。', remember: '不用记。' },
			{ terms: ['json'], oneLine: '一种人也能看懂的数据格式，用大括号装键值对。', analogy: '像标准化的表格：谁看都知道哪栏是什么。', inDsh: '配置文件和接口数据常用 JSON。', remember: '不用记。' },
			{ terms: ['yaml'], oneLine: '一种靠缩进表示层级的配置格式，比 JSON 更好读。', analogy: '像列清单，靠缩进表示谁是下一级。', inDsh: 'cordis.patch.yml 就是 YAML。', remember: '不用记。' },
			{ terms: ['yml'], oneLine: 'YAML 格式文件的常见后缀名。', analogy: '像 .doc 之于 Word 文档。', inDsh: '看到 .yml 就是一份 YAML 配置。', remember: '不用记。' },
			{ terms: ['regex', '正则', '正则表达式'], oneLine: '一种“描述文字规律”的式子，用来找或替换符合条件的文本。', analogy: '像图书馆的检索规则：不含“小说”二字的先筛掉。', inDsh: '批量查找替换文本时用它。', remember: '不用记。知道“是找文字规律”就行。' },
			{ terms: ['variable', '变量'], oneLine: '给一个值起的名字，方便反复使用。', analogy: '像给抽屉贴标签：里面装什么，看标签就知道。', inDsh: '代码里到处是变量。', remember: '不用记。' },
			{ terms: ['function', '函数'], oneLine: '一段“给输入、出结果”的可复用代码。', analogy: '像自动售货机：投币选货，掉出饮料。', inDsh: '每个插件能力基本都是一个函数。', remember: '不用记。' },
			{ terms: ['array', '数组'], oneLine: '按顺序排好的一串值。', analogy: '像排队的一列人，按编号能找到谁。', inDsh: '词条列表、文件列表都是数组。', remember: '不用记。' },
			{ terms: ['object', '对象'], oneLine: '把一组相关的值打包在一起的结构。', analogy: '像一张名片：姓名、电话都在上面。', inDsh: '插件配置常用对象表示。', remember: '不用记。' },
			{ terms: ['undefined'], oneLine: '表示“这里还没有值”。', analogy: '像表格里的空格：不是 0，是压根没填。', inDsh: '很多报错都是没判断空值导致的。', remember: '不用记。' },
			{ terms: ['debug', '调试'], oneLine: '找出程序为什么不对、并修好它的过程。', analogy: '像医生看病：先找病因，再开药。', inDsh: '插件不生效时就要 debug。', remember: '不用记。' },
			{ terms: ['log', '日志'], oneLine: '程序运行过程中记下的“流水账”，出错时靠它查原因。', analogy: '像行车记录仪：事后能回看到底发生了什么。', inDsh: 'dsh-web.log 里能看到启动报错。', remember: '不用记。' },
			{ terms: ['stack trace', '堆栈', '调用栈'], oneLine: '报错时那一长串“从哪调到哪”的路径。', analogy: '像快递的转运记录：能看出是哪一站出了问题。', inDsh: '看报错先看最上面那行。', remember: '不用记。' },
			{ terms: ['exception', '异常'], oneLine: '程序跑着跑着遇到的意外情况。', analogy: '像做饭时发现没盐了，得临时处理。', inDsh: '没接住的异常会让插件崩掉。', remember: '不用记。' },

			// ---------- 网络 / 系统 ----------
			{ terms: ['cli', '命令行'], oneLine: '靠打字下指令来操作电脑的方式，不用点鼠标。', analogy: '像直接跟机器对话下达命令，不走菜单。', inDsh: 'dsh 命令就是 CLI 工具。', remember: '不用记。' },
			{ terms: ['terminal', '终端'], oneLine: '你输命令行、看输出的那个窗口。', analogy: '像和电脑对话的聊天窗口。', inDsh: 'DSH 里助手执行命令也是走终端。', remember: '不用记。' },
			{ terms: ['bash', 'shell'], oneLine: '命令行里真正“听懂并执行”你命令的那个程序。', analogy: '像翻译官：你说的话由它转成机器能懂的指令。', inDsh: '助手跑脚本用的就是 bash。', remember: '不用记。' },
			{ terms: ['path', '路径'], oneLine: '文件在电脑里的“门牌地址”。', analogy: '像快递地址：从国家一路写到门牌号。', inDsh: '报错 ENOENT 常是路径写错了。', remember: '不用记。' },
			{ terms: ['env', 'environment variable', '环境变量'], oneLine: '系统里预设的“全局小纸条”，程序能读到这些配置。', analogy: '像贴在公共区域的通知，谁都能看。', inDsh: 'API key 常放在环境变量里，不写死在代码。', remember: '不用记。' },
			{ terms: ['port', '端口'], oneLine: '一台电脑上区分不同服务的“门牌号”。', analogy: '像同一个小区里不同的楼栋号。', inDsh: 'DSH 网页跑在 3080 端口。', remember: '不用记。' },
			{ terms: ['localhost', '127.0.0.1'], oneLine: '指“本机自己”，不经过网络访问别人的机器。', analogy: '像照镜子：看的是自己，不是别人。', inDsh: 'DSH 跑在 localhost:3080，只有本机能访问。', remember: '不用记。' },
			{ terms: ['http', 'https'], oneLine: '网页传输数据的规矩，带 s 的是加密版。', analogy: '像寄信：https 是上了封条的信。', inDsh: '所有网页访问都走它。', remember: '不用记。' },
			{ terms: ['url'], oneLine: '网页地址，浏览器里那一长串。', analogy: '像网址就是网页的门牌号。', inDsh: '接口调用要填 URL。', remember: '不用记。' },
			{ terms: ['proxy', '代理'], oneLine: '帮你中转网络请求的“中间人”。', analogy: '像托人代购：你不直接联系商家。', inDsh: '某些网络环境需要配代理才能联网。', remember: '不用记。' },
			{ terms: ['dns'], oneLine: '把网址翻译成机器用的 IP 地址的“电话簿”。', analogy: '像查号台：你说名字，它给你号码。', inDsh: '上不了网有时是 DNS 的问题。', remember: '不用记。' },
			{ terms: ['cache', '缓存'], oneLine: '把常用的东西先存着，下次直接拿，快很多。', analogy: '像把常用工具放手边，不用每次跑仓库。', inDsh: '缓存过期会导致看到旧内容。', remember: '不用记。' },
			{ terms: ['permission', '权限'], oneLine: '规定谁可以读、谁可以改的规则。', analogy: '像办公室门禁卡：不同卡能进的房间不同。', inDsh: '报错 EACCES 就是权限不够。', remember: '不用记。' },
			{ terms: ['sudo', 'root'], oneLine: '系统最高权限，能改任何东西所以要格外小心。', analogy: '像万能钥匙：能开所有门，也容易闯祸。', inDsh: '一般不需要用，别轻易用。', remember: '记一句：看到 sudo 要谨慎。' },
			{ terms: ['docker', 'container', '容器'], oneLine: '把程序和它需要的环境打包成“独立小盒子”，到哪都能跑。', analogy: '像集装箱：里面的货怎么摆都行，换了船照样运。', inDsh: '部署复杂服务常用它，避免“我这能跑你那不行”。', remember: '不用记。' },
			{ terms: ['virtual machine', '虚拟机'], oneLine: '在电脑里用软件模拟出的另一台“电脑”。', analogy: '像房间里再隔出一间，互不干扰。', inDsh: '隔离测试环境常用。', remember: '不用记。' },
			{ terms: ['ssh'], oneLine: '安全地远程登录另一台电脑的方式。', analogy: '像加密的长途电话，能操作对面机器。', inDsh: '管理远程服务器常用。', remember: '不用记。' },
			{ terms: ['pid', '进程号'], oneLine: '系统给每个运行中程序发的编号。', analogy: '像每个员工的工号。', inDsh: '杀进程时要先知道它的 PID。', remember: '不用记。' },
			{ terms: ['process', '进程'], oneLine: '一个正在运行的程序实例。', analogy: '像正在上岗干活的员工。', inDsh: 'DSH 本身就是一个进程。', remember: '不用记。' },
			{ terms: ['daemon', '守护进程'], oneLine: '在后台默默常驻运行的程序。', analogy: '像值夜班的保安，平时看不见但一直在。', inDsh: '后台服务通常是守护进程。', remember: '不用记。' },
			{ terms: ['buffer', '缓冲区'], oneLine: '数据临时堆放的地方，等攒够了再一起处理。', analogy: '像超市购物车：先攒着，到收银台一起结。', inDsh: '流式输出会用到缓冲。', remember: '不用记。' },
			{ terms: ['stream', '流式'], oneLine: '数据一点点连续传过来，而不是等全部好了再给。', analogy: '像水龙头：边流边接，不用等一整桶。', inDsh: 'AI 回答一个字一个字冒出来就是流式。', remember: '不用记。' },
			{ terms: ['utf-8', '编码'], oneLine: '规定文字怎么存成电脑能懂的 0 和 1。', analogy: '像约定用哪种语言写文件，写和读要一致。', inDsh: '编码不对会出现乱码。', remember: '不用记。' },
			{ terms: ['tar', 'gz', 'tar.gz'], oneLine: 'Linux 上常见的打包/压缩文件格式。', analogy: '像 Windows 上的 zip。', inDsh: '插件 .tgz 包就是它。', remember: '不用记。' },
			{ terms: ['checksum', 'sha', '校验和'], oneLine: '文件内容的“指纹”，用来确认没被改动。', analogy: '像指纹：内容变一个字，指纹就全变。', inDsh: '下载插件会校验，防篡改。', remember: '不用记。' },
			{ terms: ['license', '许可证', '开源协议'], oneLine: '作者规定的“你可以怎么用这份代码”的规则。', analogy: '像借东西的约定：能不能转借、要不要署名。', inDsh: '装插件前看协议，MIT 最宽松。', remember: '不用记。' },
			{ terms: ['open source', '开源'], oneLine: '源码公开、别人能看能改能用的软件。', analogy: '像公开菜谱：谁都能照着做、改进。', inDsh: 'DSH 插件很多是开源的。', remember: '不用记。' },

			// ---------- 报错关键词 ----------
			{ terms: ['enoent'], oneLine: '报错说“找不到这个文件或目录”。', analogy: '像按地址找门牌，结果那栋楼不存在。', inDsh: '多半是路径写错、或文件被删/没生成。', remember: '记一句：先检查路径对不对。' },
			{ terms: ['eacces', 'eperm'], oneLine: '报错说“权限不够，不让你动”。', analogy: '像门禁卡刷不开这扇门。', inDsh: '换个有权限的位置，或改文件权限。', remember: '记一句：是权限问题，不是你操作错。' },
			{ terms: ['eaddrinuse'], oneLine: '报错说“端口被占用了”。', analogy: '像打电话占线：这个号正在被用。', inDsh: '多半是已有服务在跑，先关掉或换端口。', remember: '记一句：关掉重复进程。' },
			{ terms: ['modulenotfound', 'cannot find module'], oneLine: '报错说“找不到这个依赖包”。', analogy: '像做菜时发现缺一味调料。', inDsh: '装依赖，或检查包名拼写。', remember: '记一句：缺东西，装一下。' },
			{ terms: ['referenceerror', 'is not defined'], oneLine: '报错说“用了一个没定义的东西”。', analogy: '像叫了个不存在的同事名字。', inDsh: '变量名拼错、或没引入就用了。', remember: '不用记。' },
			{ terms: ['typeerror'], oneLine: '报错说“类型对不上”，比如拿数字当文字用。', analogy: '像把螺丝刀当锤子使。', inDsh: '检查传给函数的值对不对。', remember: '不用记。' },
			{ terms: ['syntaxerror', 'unexpected token'], oneLine: '报错说“语法写错了”，电脑读不懂。', analogy: '像句子里漏了标点或多了个字。', inDsh: '回去看那一行的括号引号有没有配错。', remember: '不用记。' },
			{ terms: ['timeout', 'timed out'], oneLine: '报错说“等太久了，不等了”。', analogy: '像外卖超时直接取消订单。', inDsh: '网络慢或服务没响应，可重试。', remember: '记一句：重试一次常常就好。' },
			{ terms: ['econnrefused'], oneLine: '报错说“连不上对方服务”。', analogy: '像敲门没人应。', inDsh: '服务没启动，或地址端口不对。', remember: '记一句：先确认服务开了没。' },
			{ terms: ['404'], oneLine: '报错说“这个地址找不到东西”。', analogy: '像按门牌找过去，是块空地。', inDsh: '接口或网页路径写错。', remember: '不用记。' },
			{ terms: ['401', '403'], oneLine: '401 是“没登录”，403 是“登录了但不让你看”。', analogy: '401 像没带工牌，403 像带了但没这个房间的权限。', inDsh: '检查 API key 或权限配置。', remember: '不用记。' },
			{ terms: ['500', '502', '503'], oneLine: '报错说“对方服务器自己出问题了”。', analogy: '像餐厅后厨着火了，不是你的菜点错。', inDsh: '不是你的问题，隔会儿重试。', remember: '记一句：是对方的锅，可重试。' },
			{ terms: ['deprecated'], oneLine: '提示“这个写法过时了”，还能用但以后会删。', analogy: '像老式接口，慢慢会被淘汰。', inDsh: '看到它建议换新写法。', remember: '不用记。' },
			{ terms: ['npm install', 'npm i'], oneLine: '安装项目所需的依赖包。', analogy: '像装修队说买材料，把所有要用的零件运到工地。', inDsh: '克隆项目后先跑一次，装好所有依赖。', remember: '记一句：装依赖。' },
			{ terms: ['npm run', 'npm start'], oneLine: '运行 package.json 里定义的脚本。', analogy: '像遥控器上的播放键，按一下按预设动作走。', inDsh: 'npm run dev 启动开发服务器，npm run build 打包上线。', remember: '不用记。' },
			{ terms: ['npm uninstall', 'npm remove'], oneLine: '卸载某个依赖包。', analogy: '像退货，把不需要的零件还回去。', inDsh: '把不再需要的依赖从项目里移除。', remember: '不用记。' },
			{ terms: ['npm list', 'npm ls'], oneLine: '列出当前安装了哪些依赖。', analogy: '像看购物清单：列出来买了什么。', inDsh: '想搞清楚装了什么包就 list 一下。', remember: '不用记。' },
			{ terms: ['pnpm install', 'pnpm i'], oneLine: '用 pnpm 安装依赖（比 npm 更快更省空间）。', analogy: '像更高效的采购方式，同样的东西花更少时间。', inDsh: 'DSH 项目默认用 pnpm 装依赖。', remember: '记一句：用 pnpm 装依赖。' },
			{ terms: ['pnpm run', 'pnpm add', 'pnpm remove'], oneLine: 'pnpm 版本的运行/添加/移除依赖。', analogy: '和 npm run 一样，只是更快。', inDsh: 'pnpm add 加依赖，pnpm run 跑脚本。', remember: '不用记。' },
			{ terms: ['git commit'], oneLine: '把当前改动存档到本地版本历史。', analogy: '像游戏存档：这一刻的状态被记下来了。', inDsh: '每完成一小步就 commit 一次，方便回退。', remember: '记一句：改动存档。' },
			{ terms: ['git push'], oneLine: '把本地存档推到远程仓库（别人能看到）。', analogy: '像把存档云同步，队友也能看到。', inDsh: 'push 到远端才算真正提交给别人看。', remember: '不用记。' },
			{ terms: ['git pull'], oneLine: '从远程仓库拉取最新改动到本地。', analogy: '像云同步的反向操作：把别人存的取回来。', inDsh: '开始工作前先 pull 一下，避免冲突。', remember: '不用记。' },
			{ terms: ['git clone'], oneLine: '把远程仓库完整复制到本地。', analogy: '像复制一份完整的存档到你的电脑。', inDsh: '第一次拿项目代码就 clone。', remember: '不用记。' },
			{ terms: ['git branch'], oneLine: '创建/查看/切换开发分支。', analogy: '像从主干分出岔路：走不通还能回来。', inDsh: 'git branch 看有哪些分支，git checkout -b 新建。', remember: '不用记。' },
			{ terms: ['git log'], oneLine: '查看提交历史。', analogy: '像看存档记录：谁在什么时候存了档。', inDsh: '想搞清楚改动历史就 log 一下。', remember: '不用记。' },
			{ terms: ['git diff'], oneLine: '查看改动前后的对比。', analogy: '像看作文的红笔标记，只标出改动处。', inDsh: 'git diff 看改了哪些行，加 --stat 看概览。', remember: '不用记。' },
			{ terms: ['git status'], oneLine: '查看哪些改动还没存档。', analogy: '像看工作台：哪些文件被改过还没处理。', inDsh: '提交前先 status 一下，确认改了什么。', remember: '不用记。' },
			{ terms: ['git checkout'], oneLine: '切换到另一个分支或恢复文件。', analogy: '像切换游戏存档：回到某个之前的状态。', inDsh: 'checkout 分支名切换，checkout -- 文件撤销改动。', remember: '不用记。' },
			{ terms: ['git merge'], oneLine: '把一个分支的改动合并到另一个。', analogy: '像两条路汇成一条。', inDsh: '功能做完后 merge 回主分支。', remember: '不用记。' },
			{ terms: ['rm -rf'], oneLine: '强制递归删除文件或目录，删了就没了。', analogy: '像把文件扔进碎纸机：再也找不回来。', inDsh: '千万小心！删错了无法恢复。', remember: '记一句：看到 rm -rf 要极其谨慎。' },
			{ terms: ['ls -la'], oneLine: '列出目录下的所有文件（含隐藏文件、权限、大小）。', analogy: '像看仓库清单：每样东西的名称、重量、有没有盖子。', inDsh: '看目录里有什么，含隐藏文件。', remember: '不用记。' },
			{ terms: ['chmod +x'], oneLine: '给文件加可执行权限。', analogy: '像给脚本贴一个可以运行的标签。', inDsh: '让脚本能直接执行。', remember: '不用记。' },
			{ terms: ['curl -o'], oneLine: '用 curl 下载文件并保存为指定文件名。', analogy: '像网购指定收货地址：告诉它存成什么名字。', inDsh: '下载文件并命名保存。', remember: '不用记。' },
			{ terms: ['docker run'], oneLine: '启动一个容器（运行打包好的程序）。', analogy: '像打开一台现成的小电脑，里面预装好了环境。', inDsh: '跑一个容器。', remember: '不用记。' },
			{ terms: ['docker stop', 'docker kill'], oneLine: '停止/强制停止一个容器。', analogy: '像关掉那台小电脑。', inDsh: 'stop 正常停，kill 强制关。', remember: '不用记。' },
			{ terms: ['docker ps'], oneLine: '查看正在运行的容器。', analogy: '像看哪些小电脑正在开机。', inDsh: '看正在跑的容器，加 -a 看全部。', remember: '不用记。' },
			{ terms: ['docker pull'], oneLine: '从远程仓库拉取镜像。', analogy: '像下载一个现成的系统光盘。', inDsh: '拉取镜像到本地。', remember: '不用记。' },
			{ terms: ['pip install'], oneLine: '用 pip 安装 Python 包。', analogy: '像给 Python 装插件。', inDsh: '安装 Python 依赖。', remember: '不用记。' },
			{ terms: ['python -m'], oneLine: '用 python 以模块方式运行。', analogy: '像让 Python 直接执行某个内置工具。', inDsh: 'python -m http.server 启动简单 HTTP 服务。', remember: '不用记。' },
			{ terms: ['curl'], oneLine: '用命令行下载文件或发 HTTP 请求的工具。', analogy: '像用文字版浏览器：敲个地址就把东西取回来。', inDsh: '测试接口、下载文件都用它。', remember: '不用记。' },
			{ terms: ['wget'], oneLine: '和 curl 类似的命令行下载工具。', analogy: '像 curl 的姊妹版，功能差不多。', inDsh: '下载文件用，和 curl 选一个就行。', remember: '不用记。' },
			{ terms: ['pip'], oneLine: 'Python 的包管理器，用来安装 Python 库。', analogy: '像 Python 世界里的 npm。', inDsh: 'pip install xxx 安装 Python 依赖。', remember: '不用记。' }
		];

		// ============================================================================
		// 匹配逻辑
		// ============================================================================

		// 归一化：去首尾标点/空白、转小写、压缩空白
		function norm(s) {
			return String(s).trim()
				.replace(/^[\s“”"‘’`'.,;:!?()（）【】\[\]<>·、，。；：！？《》]+|[\s“”"‘’`'.,;:!?()（）【】\[\]<>·、，。；：！？《》]+$/g, '')
				.replace(/\s+/g, ' ')
				.toLowerCase();
		}

		// 去掉常见“提问式”前后缀，如“什么是X”“X是什么意思”
		function stripQuestion(s) {
			return s
				.replace(/^(什么叫做?|什么是|啥是|请问|什么叫|如何理解|解释一下|解释下|介绍一下|不懂)\s*/i, '')
				.replace(/\s*(是什么呢|是什么|是什么意思|啥意思|怎么回事|的定义|的意思|是干嘛的|是干什么的|代表什么)\s*$/i, '')
				.trim();
		}

		// 精确命中（归一化后完全相等）
		function exactHit(n) {
			for (var i = 0; i < GLOSSARY.length; i++) {
				var keys = GLOSSARY[i].terms || [];
				for (var k = 0; k < keys.length; k++) {
					if (norm(keys[k]) === n) return GLOSSARY[i];
				}
			}
			return null;
		}

		// 词边界包含判断：中英文混排下尽量稳妥（避免 api 命中 rapid）
		function containsWord(haystack, needle) {
			var idx = haystack.indexOf(needle);
			while (idx !== -1) {
				var before = idx === 0 ? '' : haystack.charAt(idx - 1);
				var after = idx + needle.length >= haystack.length ? '' : haystack.charAt(idx + needle.length);
				var beforeOk = before === '' || !/[a-z0-9]/.test(before);
				var afterOk = after === '' || !/[a-z0-9]/.test(after);
				if (beforeOk && afterOk) return true;
				idx = haystack.indexOf(needle, idx + 1);
			}
			return false;
		}

		// 模糊命中：返回 {entry, via} —— via 说明怎么命中的
		function fuzzyHit(n) {
			// 1) 去掉提问式前后缀再试精确
			var stripped = norm(stripQuestion(n));
			if (stripped && stripped !== n) {
				var hit = exactHit(stripped);
				if (hit) return { entry: hit, via: 'exact' };
			}

			// 2) 包含匹配：选中短语里含且仅含一个已知术语（限短文本，避免匹配一大段话）
			if (n.length <= 40) {
				var found = [];
				for (var i = 0; i < GLOSSARY.length; i++) {
					var keys = GLOSSARY[i].terms || [];
					for (var k = 0; k < keys.length; k++) {
						var key = norm(keys[k]);
						if (!key || key.length < 2) continue;
						if (containsWord(n, key)) {
							if (found.indexOf(GLOSSARY[i]) < 0) found.push(GLOSSARY[i]);
							break;
						}
					}
				}
				if (found.length > 0) {
					found.sort(function(a, b) { return (b.terms[0] || '').length - (a.terms[0] || '').length; });
					return { entry: found[0], via: 'contains' };
				}
			}
			return null;
		}

		// 主查询入口：返回 {entry, via} 或 null
		function lookup(text) {
			if (!text) return null;
			var n = norm(text);
			if (!n) return null;
			var hit = exactHit(n);
			if (hit) return { entry: hit, via: 'exact' };
			return fuzzyHit(n);
		}

		// 兼容旧调用：只取词条
		function lookupEntry(text) {
			var r = lookup(text);
			return r ? r.entry : null;
		}

		// ============================================================================
		// 报错 / 命令识别（本地规则，零 AI）
		// ============================================================================
		function detectError(text) {
			var t = String(text).trim();
			if (t.length < 6 || t.length > 300) return null;

			var patterns = [
				{ re: /\b(ENOENT|EACCES|EPERM|EADDRINUSE|ECONNREFUSED|ETIMEDOUT|ERR_[A-Z_]+)\b/, kind: 'errno' },
				{ re: /\b(TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError)\b/, kind: 'jserror' },
				{ re: /\b(ModuleNotFoundError|ImportError|Cannot find module|Module not found)\b/i, kind: 'module' },
				{ re: /\b(traceback|stack trace|at .+\(.+:\d+:\d+\))/i, kind: 'stack' },
				{ re: /\b(segmentation fault|core dumped|panic:|fatal:)/i, kind: 'fatal' },
				{ re: /\b(error|错误|失败|异常)\b/i, kind: 'generic' }
			];

			for (var i = 0; i < patterns.length; i++) {
				if (patterns[i].re.test(t)) return { kind: patterns[i].kind };
			}
			return null;
		}

		function detectCommand(text) {
			var t = String(text).trim();
			if (!t || t.length > 200) return null;
			if (/\n/.test(t)) return null;
			var first = t.split(/\s+/)[0] || '';
			var known = ['npm', 'pnpm', 'npx', 'yarn', 'node', 'git', 'cd', 'ls', 'cat', 'grep', 'curl', 'wget',
				'sudo', 'chmod', 'mkdir', 'rm', 'cp', 'mv', 'docker', 'ssh', 'python', 'python3', 'pip', 'dsh'];
			if (known.indexOf(first) >= 0) return { cmd: first };
			return null;
		}

		// ============================================================================
		// 语音朗读（浏览器原生 speechSynthesis，零依赖、零联网）
		// ============================================================================
		var _tts = null;
		try {
			if (typeof window !== 'undefined' && window.speechSynthesis) _tts = window.speechSynthesis;
		} catch (e) { _tts = null; }

		function speak(text, onStart, onEnd) {
			if (!_tts || !window.SpeechSynthesisUtterance) { if (onEnd) onEnd(); return false; }
			try {
				_tts.cancel();
				var u = new window.SpeechSynthesisUtterance(text);
				var isChinese = /[\u4e00-\u9fff]/.test(text);
				var voices = _tts.getVoices() || [];
				for (var i = 0; i < voices.length; i++) {
					if (isChinese && voices[i].lang && voices[i].lang.indexOf('zh') === 0) { u.voice = voices[i]; break; }
					if (!isChinese && voices[i].lang && voices[i].lang.indexOf('en') === 0) { u.voice = voices[i]; break; }
				}
				u.lang = isChinese ? 'zh-CN' : 'en-US';
				u.rate = 0.9;
				if (onStart) u.onstart = onStart;
				if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
				_tts.speak(u);
				return true;
			} catch (e) { if (onEnd) onEnd(); return false; }
		}

		function stopSpeaking() {
			if (_tts) { try { _tts.cancel(); } catch (e) {} }
		}

		// ============================================================================
		// 填入输入框（用 DSH 的 Lexical 编辑器，追加而非覆盖，不清空你已打的字）
		// ============================================================================
		function fillInput(text) {
			try {
				var editors = document.querySelectorAll('[data-lexical-editor="true"]');
				if (!editors || editors.length === 0) {
					// 回退：找会话区内的 contenteditable
					editors = document.querySelectorAll('[contenteditable="true"]');
				}
				if (!editors || editors.length === 0) return { ok: false, reason: '没找到输入框' };
				// 取最后一个（当前会话的输入框）
				var editor = editors[editors.length - 1];
				try { editor.focus(); } catch (e) {}

				// 光标移到末尾
				try {
					var sel = window.getSelection();
					if (sel) {
						var range = document.createRange();
						range.selectNodeContents(editor);
						range.collapse(false);
						sel.removeAllRanges();
						sel.addRange(range);
					}
				} catch (e) {}

				var existing = (editor.textContent || '').trim();
				var payload = existing ? ('\n' + text) : text;

				// Lexical 监听 beforeinput/input，execCommand 是标准插入方式
				var ok = false;
				try { ok = document.execCommand('insertText', false, payload); } catch (e) { ok = false; }

				if (!ok) {
					// 再回退：直接触发输入事件
					try {
						editor.dispatchEvent(new InputEvent('beforeinput', {
							inputType: 'insertText', data: payload, bubbles: true, cancelable: true
						}));
						ok = true;
					} catch (e) { ok = false; }
				}
				return { ok: ok, reason: ok ? '' : '插入失败' };
			} catch (e) {
				return { ok: false, reason: String((e && e.message) || e) };
			}
		}

		// ============================================================================
		// 主题适配（自动检测深色/浅色，适配 DSH 界面）
		// ============================================================================
		var LIGHT = {
			bg: '#ffffff', text: '#1f2329', label: '#8a8f99',
			border: '#e5e6eb', hintBorder: '#eceef2',
			btnBg: '#f2f3f5', btnBorder: '#e5e6eb', btnText: '#1f2329',
			shadow: 'rgba(0,0,0,0.16)', inputBg: '#f7f8fa', inputBorder: '#dcdee0'
		};
		var DARK = {
			bg: '#25262a', text: '#e5e6eb', label: '#8a8f99',
			border: '#3a3a3c', hintBorder: '#2e2e30',
			btnBg: '#2a2a2e', btnBorder: '#3a3a3c', btnText: '#e5e6eb',
			shadow: 'rgba(0,0,0,0.5)', inputBg: '#1f2024', inputBorder: '#3a3a3c'
		};
		var THEME = LIGHT;

		function detectTheme() {
			var dark = false;
			try {
				if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) dark = true;
				var el = document.documentElement;
				var attr = el.getAttribute('data-theme') || el.getAttribute('data-dsh-theme') || '';
				if (attr === 'dark') dark = true;
				if (attr === 'light') dark = false;
				if (el.classList && el.classList.contains('dark')) dark = true;
				var bg = window.getComputedStyle(document.body).backgroundColor;
				var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				if (m) { var l = (0.299*(+m[1]) + 0.587*(+m[2]) + 0.114*(+m[3]))/255; if (l < 0.5) dark = true; }
			} catch (e) {}
			return dark ? DARK : LIGHT;
		}

		// ============================================================================
		// 自定义词条（localStorage 持久化，重启不丢）
		// ============================================================================
		var CUSTOM_KEY = 'dsh-term-glossary-custom-v1';
		function loadCustomTerms() {
			try {
				var d = localStorage.getItem(CUSTOM_KEY);
				if (d) { var p = JSON.parse(d); if (Array.isArray(p)) return p; }
			} catch (e) {}
			return [];
		}
		function saveCustomTerms(terms) {
			try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(terms)); } catch (e) {}
		}
		// 启动时合并自定义词条到词典
		(function () {
			var custom = loadCustomTerms();
			for (var i = 0; i < custom.length; i++) {
				if (custom[i] && custom[i].terms) GLOSSARY.push(custom[i]);
			}
		})();

		// ============================================================================
		// 卡片 UI
		// ============================================================================
		function field(label, text) {
			return React.createElement('div', { style: { marginBottom: '8px' } },
				React.createElement('span', {
					style: {
						display: 'inline-block', minWidth: '64px', color: THEME.label,
						fontSize: '12.5px', verticalAlign: 'top'
					}
				}, label),
				React.createElement('span', {
					style: { color: THEME.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
				}, text)
			);
		}

		function btnStyle() {
			return {
				display: 'inline-block', padding: '4px 10px', marginRight: '8px', marginTop: '2px',
				fontSize: '12.5px', color: THEME.btnText, background: THEME.btnBg,
				border: '1px solid ' + THEME.btnBorder, borderRadius: '6px', cursor: 'pointer', userSelect: 'none'
			};
		}

		function hintStyle() {
			return {
				marginTop: '8px', color: THEME.label, fontSize: '12.5px',
				borderTop: '1px dashed ' + THEME.hintBorder, paddingTop: '8px'
			};
		}

		function GlossaryCard(props) {
			var e = props.entry;
			return React.createElement('div', null,
				field('一句话', e.oneLine),
				field('打比方', e.analogy),
				field('在 DSH 里', e.inDsh),
				React.createElement('div', { style: hintStyle() }, e.remember)
			);
		}

		function ErrorCard(props) {
			var hints = {
				errno: '这类是系统层报错。先看括号里的路径/端口对不对，再确认那个文件或服务是否存在。',
				jserror: '这是代码层面的错误。看报错最后一行提到的文件和行号，多半是变量名拼错或用法不对。',
				module: '缺少依赖包。在项目目录跑一次安装命令（如 pnpm install）通常能解决。',
				stack: '这是调用路径。从上往下读：最上面一行通常才是真正的出错点。',
				fatal: '这是严重崩溃。先把报错原文完整复制出来，再看它紧挨着的前几行日志。',
				generic: '先别慌：把报错按“是什么错 + 在哪个文件 + 哪一行”三要素拆开看，通常就清楚一半了。'
			};
			return React.createElement('div', null,
				field('这是什么', '你选中的像是一条报错信息。'),
				field('怎么读', hints[props.kind] || hints.generic),
				React.createElement('div', { style: hintStyle() }, '需要具体分析的话，点下面的按钮复制给主助手。')
			);
		}

		function CommandCard(props) {
			return React.createElement('div', null,
				field('这是什么', '你选中的像是一条命令行（' + props.cmd + '）。'),
				field('怎么读', '命令行的第一个词是“程序名”，后面跟的是“参数”。先认出第一个词在干什么，就懂一半了。'),
				React.createElement('div', { style: hintStyle() }, '不确定这条命令安不安全时，先别回车——复制给主助手问一下。')
			);
		}

		// 通用卡片：选中任意文本（不在本地词典里）时显示，英文词自动查在线词典
		function UniversalCard(props) {
			var defState = React.useState(null);
			var definition = defState[0];
			var setDefinition = defState[1];
			var loadState = React.useState(false);
			var loading = loadState[0];
			var setLoading = loadState[1];
			var triedState = React.useState(false);
			var tried = triedState[0];
			var setTried = triedState[1];

			React.useEffect(function () {
				var text = (props.text || '').trim();
				if (text.length >= 2 && text.length <= 40 && /^[a-zA-Z][a-zA-Z\s'-]*$/.test(text)) {
					var word = text.split(/\s+/)[0].toLowerCase();
					setLoading(true);
					fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word))
						.then(function (r) { if (!r.ok) throw new Error('nf'); return r.json(); })
						.then(function (data) {
							if (Array.isArray(data) && data.length > 0 && data[0].meanings) {
								var m = data[0].meanings[0];
								if (m && m.definitions && m.definitions[0]) {
									var d = m.definitions[0];
									var ph = '';
									if (data[0].phonetic) ph = data[0].phonetic;
									else if (data[0].phonetics) {
										for (var i = 0; i < data[0].phonetics.length; i++) {
											if (data[0].phonetics[i] && data[0].phonetics[i].text) { ph = data[0].phonetics[i].text; break; }
										}
									}
									setDefinition({ pos: m.partOfSpeech || '', def: d.definition || '', example: d.example || '', phonetic: ph });
								}
							}
							setLoading(false); setTried(true);
						})
						.catch(function () { setLoading(false); setTried(true); });
				} else { setTried(true); }
			}, []);

			if (loading) {
				return React.createElement('div', null,
					field('正在查', '在线词典中查找释义...'),
					React.createElement('div', { style: hintStyle() }, '如果查不到，可以点下面的「复制给主助手」。')
				);
			}
			if (definition) {
				var parts = [];
				if (definition.phonetic) parts.push(field('发音', definition.phonetic));
				if (definition.pos) parts.push(field('词性', definition.pos));
				parts.push(field('释义', definition.def));
				if (definition.example) parts.push(field('例句', definition.example));
				parts.push(React.createElement('div', { style: hintStyle() }, '来源：Free Dictionary API（在线）'));
				return React.createElement('div', null, parts);
			}
			var isEnglish = /^[a-zA-Z]/.test((props.text || '').trim());
			return React.createElement('div', null,
				field('这是什么', '你选中的内容不在本地词典里。'),
				field('建议', isEnglish
					? '在线词典也没找到这个词。可以点「复制给主助手」让 AI 帮你解释。'
					: '可以点「复制给主助手」让 AI 帮你解释，或点「🔊 朗读」听发音。'),
				React.createElement('div', { style: hintStyle() }, '点「🔊 朗读」可以听这个词的发音。')
			);
		}

		// 加词表单
		function AddTermForm(props) {
			var termsS = React.useState('');
			var oneS = React.useState('');
			var anaS = React.useState('');
			var dshS = React.useState('');
			var savedS = React.useState(false);

			function handleSave() {
				var t = termsS[0].trim();
				if (!t) return;
				var entry = {
					terms: t.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean),
					oneLine: oneS[0].trim() || '（未填写）',
					analogy: anaS[0].trim() || '（未填写）',
					inDsh: dshS[0].trim() || '（未填写）',
					remember: '不用记。'
				};
				var custom = loadCustomTerms();
				custom.push(entry);
				saveCustomTerms(custom);
				GLOSSARY.push(entry);
				savedS[1](true);
				setTimeout(function () { props.onCancel(); }, 800);
			}

			var inputStyle = {
				width: '100%', boxSizing: 'border-box', padding: '5px 8px', marginBottom: '8px',
				fontSize: '13px', color: THEME.text, background: THEME.inputBg,
				border: '1px solid ' + THEME.inputBorder, borderRadius: '4px',
				fontFamily: 'inherit', outline: 'none'
			};
			var labelStyle = { fontSize: '12.5px', color: THEME.label, marginBottom: '2px', display: 'block' };

			if (savedS[0]) {
				return React.createElement('div', { style: { textAlign: 'center', padding: '12px', color: THEME.label } },
					'✅ 已保存！下次选中这个词就能看到解释。'
				);
			}
			return React.createElement('div', null,
				React.createElement('label', { style: labelStyle }, '术语（多个用逗号分隔）'),
				React.createElement('input', { style: inputStyle, value: termsS[0], onChange: function (e) { termsS[1](e.target.value); }, placeholder: '比如：API、接口' }),
				React.createElement('label', { style: labelStyle }, '一句话解释'),
				React.createElement('input', { style: inputStyle, value: oneS[0], onChange: function (e) { oneS[1](e.target.value); }, placeholder: '用大白话说这是什么' }),
				React.createElement('label', { style: labelStyle }, '打比方'),
				React.createElement('input', { style: inputStyle, value: anaS[0], onChange: function (e) { anaS[1](e.target.value); }, placeholder: '用生活里的东西类比' }),
				React.createElement('label', { style: labelStyle }, '在 DSH 里'),
				React.createElement('input', { style: inputStyle, value: dshS[0], onChange: function (e) { dshS[1](e.target.value); }, placeholder: '在 DSH 里是干什么的' }),
				React.createElement('div', { style: { marginTop: '8px' } },
					React.createElement('span', {
						style: btnStyle(), onClick: handleSave,
						onMouseDown: function (e) { e.stopPropagation(); }
					}, '💾 保存'),
					React.createElement('span', {
						style: btnStyle(), onClick: props.onCancel,
						onMouseDown: function (e) { e.stopPropagation(); }
					}, '取消')
				)
			);
		}

		// 浮层控制器
		function Overlay() {
			var state = React.useState(null);
			var card = state[0];
			var setCard = state[1];
			var copiedState = React.useState(false);
			var copied = copiedState[0];
			var setCopied = copiedState[1];
			var fillState = React.useState('');
			var fillMsg = fillState[0];
			var setFillMsg = fillState[1];
			// AI 旁路解释状态
			var aiState = React.useState(null);
			var aiResult = aiState[0];
			var setAiResult = aiState[1];
			var aiLoadingState = React.useState(false);
			var aiLoading = aiLoadingState[0];
			var setAiLoading = aiLoadingState[1];
			var speakState = React.useState(false);
			var speaking = speakState[0];
			var setSpeaking = speakState[1];
			var addTermState = React.useState(false);
			var addTermMode = addTermState[0];
			var setAddTermMode = addTermState[1];

			React.useEffect(function () {
				var timer = null;

				function evaluate() {
					timer = null;
					var sel = window.getSelection && window.getSelection();
					if (!sel || sel.isCollapsed) { setCard(null); return; }
					var raw = sel.toString();
					if (!raw) { setCard(null); return; }
					var text = raw.trim();
					if (text.length < 1 || text.length > 300) { setCard(null); return; }

					var rect = null;
					try {
						if (sel.rangeCount > 0) rect = sel.getRangeAt(0).getBoundingClientRect();
					} catch (e) { rect = null; }
					if (!rect || (rect.width === 0 && rect.height === 0)) {
						rect = { left: 80, top: 80, right: 81, bottom: 81, width: 1, height: 1 };
					}

					// 优先级：词典命中 > 报错识别 > 命令识别
					var hit = lookup(text);
					if (hit) {
						setCard({ type: 'glossary', term: hit.entry.terms[0], original: text, entry: hit.entry, via: hit.via, rect: rect });
						return;
					}
					var err = detectError(text);
					if (err) {
						setCard({ type: 'error', term: '报错提示', kind: err.kind, raw: text, rect: rect });
						return;
					}
					var cmd = detectCommand(text);
					if (cmd) {
						setCard({ type: 'command', term: '命令提示', cmd: cmd.cmd, raw: text, rect: rect });
						return;
					}
					// 兜底：任何 2~200 字符的选中文本都弹卡片（TTS + 复制 + 英文在线词典）
					if (text.length >= 2 && text.length <= 200) {
						var displayTerm = text.length > 30 ? text.slice(0, 28) + '...' : text;
						setCard({ type: 'universal', term: displayTerm, raw: text, rect: rect });
					} else {
						setCard(null);
					}
				}

				function onMouseUp() {
					if (timer) clearTimeout(timer);
					timer = setTimeout(evaluate, 10);
				}
				function onSelectionChange() {
					var sel = window.getSelection && window.getSelection();
					if (!sel || sel.isCollapsed) { if (timer) clearTimeout(timer); setCard(null); }
				}
				function onKey(e) {
					if (e.key === 'Escape') { stopSpeaking(); setSpeaking(false); setCard(null); setCopied(false); }
				}
				function onDocMouseDown(e) {
					var node = e.target, inside = false;
					while (node) {
						if (node.getAttribute && node.getAttribute('data-dsh-term-glossary-card')) { inside = true; break; }
						node = node.parentNode;
					}
					if (!inside) { stopSpeaking(); setSpeaking(false); setCard(null); setCopied(false); }
				}

				document.addEventListener('mouseup', onMouseUp, true);
				document.addEventListener('selectionchange', onSelectionChange, false);
				document.addEventListener('keydown', onKey, false);
				document.addEventListener('mousedown', onDocMouseDown, true);
				return function () {
					if (timer) clearTimeout(timer);
					document.removeEventListener('mouseup', onMouseUp, true);
					document.removeEventListener('selectionchange', onSelectionChange, false);
					document.removeEventListener('keydown', onKey, false);
					document.removeEventListener('mousedown', onDocMouseDown, true);
				};
			}, []);

			if (!card) return null;

			THEME = detectTheme();
			var r = card.rect;
			var W = window.innerWidth, H = window.innerHeight;
			var CARD_W = 360, CARD_H_EST = 250;
			var left = r.right + 8;
			if (left + CARD_W > W - 8) left = Math.max(8, r.left - CARD_W - 8);
			var top = r.bottom + 6;
			if (top + CARD_H_EST > H - 8) top = Math.max(8, r.top - CARD_H_EST - 6);
			if (top < 8) top = 8;

			var body;
			if (addTermMode) {
				body = React.createElement(AddTermForm, { onCancel: function () { setAddTermMode(false); } });
			} else if (card.type === 'glossary') body = React.createElement(GlossaryCard, { entry: card.entry });
			else if (card.type === 'error') body = React.createElement(ErrorCard, { kind: card.kind });
			else if (card.type === 'command') body = React.createElement(CommandCard, { cmd: card.cmd });
			else body = React.createElement(UniversalCard, { text: card.raw });

			// 「复制给主助手」：零 AI 依赖，真实可用
			function copyForAgent() {
				try {
					var payload = card.raw
						? card.raw
						: (card.term + ' 是什么意思？请用大白话解释，并说明在 DSH 里怎么用。');
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(payload);
					} else {
						var ta = document.createElement('textarea');
						ta.value = payload;
						document.body.appendChild(ta);
						ta.select();
						document.execCommand('copy');
						document.body.removeChild(ta);
					}
					setCopied(true);
					setTimeout(function () { setCopied(false); }, 1800);
				} catch (e) { /* 静默 */ }
			}

			// 语音朗读
			function handleSpeak() {
				var text = card.raw || card.term;
				if (speaking) { stopSpeaking(); setSpeaking(false); return; }
				speak(text, function () { setSpeaking(true); }, function () { setSpeaking(false); });
			}

			// 填入输入框（不发送，你自己确认后按回车）
			function handleFill() {
				var payload = card.raw
					? card.raw
					: (card.term + ' 是什么意思？请用大白话解释，并说明在 DSH 里怎么用。');
				var r = fillInput(payload);
				if (r.ok) {
					setFillMsg('已填入，按回车发送 ✓');
					// 填入成功后收起卡片，不挡视线
					setTimeout(function () { setCard(null); setFillMsg(''); }, 900);
				} else {
					setFillMsg('填入失败：' + r.reason + '（可改用复制）');
					setTimeout(function () { setFillMsg(''); }, 2600);
				}
			}

			// 旁路 AI 解释：独立调用模型，不进入任何会话，不打断主任务
			function handleAI() {
				if (aiLoading) return;
				var text = card.raw || card.term;
				if (!AI || typeof AI.explain !== 'function') {
					setAiResult({ ok: false, error: 'AI 服务不可用（插件 host 半侧未加载）' });
					return;
				}
				setAiLoading(true);
				setAiResult(null);
				Promise.resolve()
					.then(function () { return AI.explain(text); })
					.then(function (r) {
						setAiLoading(false);
						if (r && r.ok) setAiResult({ ok: true, text: r.text, model: r.model });
						else setAiResult({ ok: false, error: (r && r.error) || '未知错误' });
					})
					.catch(function (e) {
						setAiLoading(false);
						setAiResult({ ok: false, error: String((e && e.message) || e) });
					});
			}

			var matchTag = null;
			if (card.type === 'glossary' && card.via === 'contains') {
				matchTag = React.createElement('div', {
					style: { fontSize: '12px', color: THEME.label, marginBottom: '6px', marginTop: '-4px' }
				}, '（命中你选中的内容里包含的术语）');
			}

			return createPortal(
				React.createElement('div', {
					'data-dsh-term-glossary-card': '1',
					className: 'dsh-tg-fade-in',
					onClick: function (e) { e.stopPropagation(); },
					onMouseDown: function (e) { e.stopPropagation(); },
					style: {
						position: 'fixed', left: left + 'px', top: top + 'px',
						width: CARD_W + 'px', maxWidth: (W - 16) + 'px',
						maxHeight: (H - 16) + 'px', overflowY: 'auto',
						boxSizing: 'border-box',
						background: THEME.bg, color: THEME.text,
						border: '1px solid ' + THEME.border, borderRadius: '12px',
						boxShadow: '0 8px 24px ' + THEME.shadow,
						padding: '14px 16px',
						fontFamily: 'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
						fontSize: '14px', lineHeight: '1.6',
						pointerEvents: 'auto', zIndex: 2147483601
					}
				},
					React.createElement('span', {
						onClick: function () { stopSpeaking(); setSpeaking(false); setAddTermMode(false); setCard(null); },
						onMouseDown: function (e) { e.stopPropagation(); },
						title: '关闭（Esc）',
						style: {
							position: 'absolute', right: '10px', top: '6px', cursor: 'pointer',
							color: THEME.label, fontSize: '18px', lineHeight: '1', userSelect: 'none'
						}
					}, '×'),
					React.createElement('div', {
						style: { fontWeight: 600, fontSize: '15px', color: THEME.text, marginBottom: '8px', paddingRight: '18px' }
					}, addTermMode ? '➕ 添加自定义词条' : card.term),
					matchTag,
					body,
					// AI 旁路解释结果区
					aiLoading ? React.createElement('div', {
						style: {
							marginTop: '10px', paddingTop: '8px',
							borderTop: '1px dashed ' + THEME.hintBorder,
							fontSize: '13px', color: THEME.label
						}
					}, '🤖 正在请模型解释…（旁路调用，不打断主任务）') : null,
					aiResult && aiResult.ok ? React.createElement('div', {
						style: {
							marginTop: '10px', paddingTop: '8px',
							borderTop: '1px dashed ' + THEME.hintBorder
						}
					},
						React.createElement('div', {
							style: { fontSize: '12px', color: THEME.label, marginBottom: '4px' }
						}, '🤖 AI 解释' + (aiResult.model ? '（' + aiResult.model + '）' : '')),
						React.createElement('div', {
							style: {
								fontSize: '13.5px', color: THEME.text,
								whiteSpace: 'pre-wrap', wordBreak: 'break-word',
								lineHeight: '1.7'
							}
						}, aiResult.text)
					) : null,
					aiResult && !aiResult.ok ? React.createElement('div', {
						style: {
							marginTop: '10px', paddingTop: '8px',
							borderTop: '1px dashed ' + THEME.hintBorder,
							fontSize: '12.5px', color: '#e5534b'
						}
					}, '🤖 ' + aiResult.error) : null,
					React.createElement('div', {
						style: { marginTop: '10px', borderTop: '1px dashed ' + THEME.hintBorder, paddingTop: '8px' }
					},
						addTermMode ? null : React.createElement('span', {
							style: btnStyle(), onClick: function () { setAddTermMode(true); },
							onMouseDown: function (e) { e.stopPropagation(); }
						}, '➕ 加词'),
						addTermMode ? null : React.createElement('span', {
							style: btnStyle(), onClick: handleSpeak,
							onMouseDown: function (e) { e.stopPropagation(); }
						}, speaking ? '⏹ 停止朗读' : '🔊 朗读'),
						addTermMode ? null : React.createElement('span', {
							style: btnStyle(), onClick: handleAI,
							onMouseDown: function (e) { e.stopPropagation(); }
						}, aiLoading ? '🤖 思考中…' : '🤖 AI 深入解释'),
						addTermMode ? null : React.createElement('span', {
							style: Object.assign({}, btnStyle(), {
								background: '#2f6feb', color: '#ffffff', borderColor: '#2f6feb'
							}),
							onClick: handleFill,
							onMouseDown: function (e) { e.stopPropagation(); }
						}, '✍️ 填入输入框'),
						React.createElement('span', {
							style: btnStyle(), onClick: copyForAgent,
							onMouseDown: function (e) { e.stopPropagation(); }
						}, copied ? '已复制 ✓' : '复制'),
						fillMsg ? React.createElement('div', {
							style: { marginTop: '6px', fontSize: '12.5px', color: THEME.label }
						}, fillMsg) : null
					)
				),
				document.body
			);
		}

		/** Cordis 插件名。 */
		const name = "term-glossary";
		/**
		 * 不声明硬依赖：AI 能力（remote.termGlossary）用惰性获取。
		 * 这样即使 host 半侧的远程服务未就绪，插件也能正常激活，
		 * 只是「AI 深入解释」按钮会提示服务不可用。
		 */
		const inject = [];

		/**
		 * 插件入口：挂一个隔离的根容器，渲染浮层控制器。
		 * @param ctx - Cordis 插件上下文。
		 */
		function apply(ctx) {
			var mount = null;
			var root = null;

			// 惰性解析 host 半侧的远程服务（可能稍后才就绪）
			function resolveAI() {
				if (AI) return AI;
				try {
					if (ctx && typeof ctx.get === 'function') {
						var gw = ctx.get('remote');
						if (gw && gw.termGlossary) { AI = gw.termGlossary; return AI; }
					}
				} catch (e) { /* 忽略 */ }
				try {
					if (ctx && ctx.remote && ctx.remote.termGlossary) { AI = ctx.remote.termGlossary; return AI; }
				} catch (e) { /* 忽略 */ }
				return null;
			}
			resolveAI();
			// 再延迟重试几次（等服务就绪）
			var tries = 0;
			var t = setInterval(function () {
				tries++;
				if (resolveAI() || tries >= 10) { try { clearInterval(t); } catch (e) {} }
			}, 1000);
			try { if (ctx && typeof ctx.effect === 'function') ctx.effect(function () { return function () { try { clearInterval(t); } catch (e) {} }; }); } catch (e) {}
			var styleEl = null;

			// 注入淡入动画（只注入一次）
			try {
				if (!document.getElementById('dsh-tg-style')) {
					styleEl = document.createElement('style');
					styleEl.id = 'dsh-tg-style';
					styleEl.textContent =
						'@keyframes dsh-tg-fade-in{' +
						'from{opacity:0;transform:translateY(4px) scale(.98)}' +
						'to{opacity:1;transform:translateY(0) scale(1)}}' +
						'.dsh-tg-fade-in{animation:dsh-tg-fade-in .14s ease-out}';
					document.head.appendChild(styleEl);
				}
			} catch (e) { styleEl = null; }

			function start() {
				try {
					root = createRoot(mount);
					root.render(React.createElement(Overlay));
				} catch (e) {
					try { console.warn('[term-glossary] render failed:', e); } catch (_) {}
				}
			}

			try {
				mount = document.createElement('div');
				mount.id = 'dsh-term-glossary-root';
				mount.setAttribute('data-dsh-term-glossary', '');
				mount.style.cssText =
					'all:initial;position:fixed;left:0;top:0;width:0;height:0;' +
					'z-index:2147483600;pointer-events:none;';

				if (document.body) { document.body.appendChild(mount); start(); }
				else if (document.readyState === 'loading') {
					document.addEventListener('DOMContentLoaded', function () {
						if (document.body && mount && !mount.parentNode) { document.body.appendChild(mount); start(); }
					});
				} else {
					var attach = function () {
						if (!mount) return;
						if (document.body) { document.body.appendChild(mount); start(); }
						else { setTimeout(attach, 50); }
					};
					attach();
				}
			} catch (e) {
				try { console.warn('[term-glossary] init failed:', e); } catch (_) {}
			}

			if (ctx && typeof ctx.effect === 'function') {
				try {
					ctx.effect(function () {
						return function () {
							try { if (root) root.unmount(); } catch (_) {}
							try { if (mount && mount.parentNode) mount.parentNode.removeChild(mount); } catch (_) {}
							root = null; mount = null;
						};
					}, 'term-glossary: overlay teardown');
				} catch (_) {}
			}
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		exports.lookup = lookup;
		exports.lookupEntry = lookupEntry;
		exports.detectError = detectError;
		exports.detectCommand = detectCommand;
		exports.GLOSSARY = GLOSSARY;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
