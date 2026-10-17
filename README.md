# dsh-disco-whale

> DSH（DeepSeek Harness）桌面端 / Web 端的 **「鲸鱼蹦迪」彩蛋插件**。
> 发送「欧耶耶」，整个界面秒变舞厅。
>
> GitHub: <https://github.com/learnfrom325/dsh-disco-whale>

<p align="center">
  <img src="assets/char.png" width="220" alt="小鲸鱼角色">
</p>

## 效果

发送触发词（默认 **「欧耶耶」**）后：

- 🪩 **全屏舞厅灯光**：顶部迪斯科球 + 旋转彩色光幕 + 镜面球光斑 + 5 束长激光 + 舞池反光 + 扫描线 + 随拍频闪；
- 🐳 **小鲸鱼蹦迪**：按节拍上下压缩/拉伸（squash & stretch），并左右平移在整个屏幕里摇摆；
- 🔊 **音响**：角色旁边立起一只音响，低音喇叭随拍鼓动、指示灯闪烁；
- 💬 **气泡歌词**：小鲸鱼顶上的气泡每隔 9.2 秒换一句《朋友的酒》歌词；
- 🎵 **音乐**：优先播放你自备的舞曲（见下文），没有则用内置合成旋律兜底；整段音乐播完之前不会自己结束；
- 📝 **回复变歌词**：触发后紧接着的那条助手回复会被替换成 16 行歌词。

发送 **「？」**：助手回复被替换成一句——

> 发什么问号，严肃点全体保持Q弹！

**手动结束**：按 `Esc`，或双击小鲸鱼。

## 安装

插件是标准 DSH bundle 插件，装进 `web`（桌面端为 `desktop`）profile 即可。

### 方式 A：从 npm / GitHub 安装（推荐）

```bash
# 已发布到 npm 后
dsh plugin --profile web add dsh-disco-whale

# 或者直接从 GitHub 仓库安装
dsh plugin --profile web add github:learnfrom325/dsh-disco-whale
```

### 方式 B：本地目录（开发 / 自用）

```bash
git clone https://github.com/learnfrom325/dsh-disco-whale.git
dsh plugin --profile web add link:<克隆下来的绝对路径>
```

### 方式 C：手工复制

把本仓库的 `lib/`、`assets/`、`cordis.patch.yml`、`package.json` 复制到：

```
<DSH_HOME>/profiles/desktop/node_modules/dsh-disco-whale/
```

（`<DSH_HOME>` 默认是 `~/.dsh`，Windows 上是 `C:\Users\<你>\.dsh`）

安装完成后 **重启 DSH**，再刷新页面（桌面端 `Ctrl+R`）。控制台出现下面这行即成功：

```
[dsh-disco] ready v0.1.0：发送「欧耶耶」或「？」触发；控制台 dshDiscoTest() 手动播放
```

## 触发词

默认触发词：

```
欧耶耶 / 欧耶 / 欧也 / 耶耶耶 / oh yeah yeah / ohyeahyeah / our ye ye / ouyeye / oyeye
```

匹配规则是 **整条消息等于触发词**（忽略空白与标点、大小写），所以「把…欧耶耶…」这种长句不会误触发。

自定义触发词（浏览器控制台执行一次，刷新后生效）：

```js
localStorage.setItem('dsh-disco-words', '蹦迪,跳舞,ohyeahyeah')  // 英文逗号分隔
```

## 音乐（自备）

插件**不打包音乐**（体积与版权原因）。把你的舞曲放到下面任意一个位置，重启/reload 页面后即生效（无需重启 DSH）：

```
<DSH_HOME>/disco-whale/music.mp3      ← 推荐
<DSH_HOME>/disco-whale/dance.mp3      ← 旧命名，兼容
<DSH_HOME>/whale-audio/dance.mp3      ← 直接复用 dsh-whale-widget 的音频目录
<插件目录>/assets/music.mp3           ← 想随插件分发时放这里
```

支持 `mp3 / wav / ogg / m4a / flac / aac`。找不到文件时用内置的 150BPM 合成旋律兜底（8 小节，循环感强但很短）。

**节拍对齐**：默认按 130 BPM、首个拍点在音频 0.199s 处对齐（对一首 188 秒舞曲测出来的）。换成别的曲子后如果感觉"踩不准"，改 `assets/disco-widget.js` 顶部的：

```js
var DISCO_BPM = 130     // 改成分曲子的 BPM
var DISCO_PHASE = 0.199 // 首个拍点距音频开头的秒数
```

## 自定义

| 想改什么 | 怎么做 |
| --- | --- |
| 角色图 | 替换 `assets/char.png`（建议正方形、透明背景），或控制台 `localStorage.setItem('dsh-disco-char', 'https://…/你的图.png')` |
| 角色大小 | `localStorage.setItem('dsh-disco-size', '180px')`（任意 CSS 长度） |
| 左右摇摆幅度 | `localStorage.setItem('dsh-disco-sway', '40vw')` |
| 触发词 | 见上文 |
| 歌词 | 改 `assets/disco-widget.js` 里的 `DISCO_LYRICS` 数组 |
| 问号回复语 | 改 `DISCO_QUESTION_REPLY` |

清空自定义：`localStorage.removeItem('dsh-disco-char')` 等，刷新页面。

## 调试

浏览器控制台：

```js
dshDiscoTest()          // 立即放一次彩蛋（跳过触发词）
dshDiscoNow()           // 同上（走完整开始流程）
dshDiscoStop()          // 立即结束
dshDiscoSay('文字')     // 让气泡直接说一句话
dshDiscoReply('lyrics') // 让下一条助手回复变成歌词（'question' 变问号回复）
dshDiscoVersion         // 版本号
```

宿主侧：

- 信号：`GET /dsh-disco/signal.json` → `{ ok, seq, ts, kind }`
- 探针：前端每次加载会 `GET /dsh-disco/probe`，宿主把它记到 `<DSH_HOME>/.dsh-disco-probe.log` —— 用来确认「浏览器里跑的到底是不是这个插件」。

## 原理

```
┌─ 宿主插件 lib/index.js ────────────────────────────────────┐
│ ① webserver/index-inject  注入 <script src="/dsh-disco/widget.js">│
│ ② 注册路由：widget.js / char.png / audio / signal.json / probe│
│ ③ 监听 session/event 的 user/message：命中触发词或「？」    │
│    → 内存信号 seq++（带 kind: lyrics | question）           │
└───────────────────────────────────────────────────────────┘
                 ↑ 每秒轮询 signal.json
┌─ 前端挂件 assets/disco-widget.js（完全自包含）─────────────┐
│ 角色 + 气泡 + 音响 + 光效 + WebAudio 音乐：全部自己渲染    │
│ composer 回车/点发送：本地即时触发（0 延迟）               │
│ 聊天区替换：运行时解析 AssistantMarkdown 的 CSS Modules    │
│ hash，只隐藏 _body 再追加兄弟节点，不动 React 管理的节点    │
└───────────────────────────────────────────────────────────┘
```

两条触发通道写同一个自增 `seq`，1.5 秒内去重，所以「本地回车」和「宿主 user/message」不会叠成两轮。

## 目录结构

```
dsh-disco-whale/
├── package.json          # dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml      # 挂载声明（insert 到 web/desktop profile）
├── lib/index.js          # 宿主半区：注入 + 路由 + 触发判断
├── assets/
│   ├── disco-widget.js   # 前端挂件（自包含，约 1000 行）
│   ├── char.png          # 默认角色（小鲸鱼）
│   ├── char-alt.png      # 备用角色
│   └── icon.png          # 插件图标
└── tests/smoke.cjs       # 冒烟测试（vm + DOM/Audio stub）
```

## 已知限制

- **回复变歌词**依赖 DSH 前端 `AssistantMarkdown` 的 DOM 结构（`_root` / `_body`）。DSH 大版本更新后若失效，只影响这一项，灯光 / 蹦迪 / 音乐 / 气泡歌词照常。
- 桌面 Electron 端依赖宿主 `webserver/index-inject` 通道；极老版本没有该通道时，需要手动在页面里加载 `/dsh-disco/widget.js`。
- 浏览器自动播放策略：由点击 / 回车触发的播放有用户手势，正常出声；仅靠宿主信号触发（例如语音输入）时可能没有手势而静音——先点一下页面即可恢复。
- 长音乐（几分钟）播放期间，前端会每 20 秒「续约」一次 AudioContext，避免浏览器把音频上下文挂起。

## 素材与许可

- 代码：**MIT**（见 `LICENSE`）。
- `assets/char.png`、`assets/char-alt.png` 来自 [dsh-whale-widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（原始素材 as-is，原插件作者 @T7moris）。
- 歌词《朋友的酒》：著作权归原作者所有，此处仅作彩蛋示例，请勿用于商业用途。
- 音乐：插件不附带，请自备。

## 开发

```bash
node --check lib/index.js          # 宿主语法检查
node --check assets/disco-widget.js # 前端语法检查
node tests/smoke.cjs               # 冒烟测试（无需浏览器）
```

欢迎提 Issue / PR。
