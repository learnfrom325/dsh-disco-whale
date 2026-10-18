# dsh-disco-whale

> DSH（DeepSeek Harness）桌面端 / Web 端的 **「鲸鱼蹦迪」彩蛋插件**。
> 发送「欧耶耶」，整个界面秒变舞厅。
>
> GitHub: <https://github.com/learnfrom325/dsh-disco-whale>

**灵感来源**：B 站视频 `BV1kTp962EJG`（UP 主：幸羽雪雪）
**音频来源**：B 站视频 `BV1hXbN6VEKV`（UP 主：活跃黑江乐）——《朋友的酒》DJ 完整版

<p align="center">
  <img src="assets/char.png" width="220" alt="小鲸鱼角色">
</p>

## 效果

**平时完全隐身**：小鲸鱼、音响、气泡全部不显示（右下角只剩你的余额插件），不会挡任何界面。

发送触发词（默认 **「欧耶耶」**）后，角色带着整套舞台一起淡入：

- 🪩 **全屏舞厅灯光**：顶部迪斯科球 + 旋转彩色光幕 + 镜面球光斑 + 5 束长激光 + 舞池反光 + 扫描线 + 随拍频闪；
- 🐳 **小鲸鱼蹦迪**：按节拍上下压缩/拉伸（squash & stretch），并左右平移在整个屏幕里摇摆；
- 🔊 **音响**：角色旁边立起一只音响，低音喇叭随拍鼓动、指示灯闪烁；
- 💬 **气泡歌词**：小鲸鱼顶上的气泡每隔 9.2 秒换一句《朋友的酒》歌词；
- 🎵 **音乐**：插件内置一段 188 秒的舞曲（`assets/music.mp3`），装上就有声；也支持换成自己的曲子；整段音乐播完之前不会自己结束；
- 📝 **回复变歌词**：触发后紧接着的那条助手回复会被替换成 16 行歌词。

消息里带 **「新宿决战」或相关梗**：模型先在真实聊天回复里接住这个梗，自然把话题转到新宿决战；等回复完成，页面最上层才**全屏无边框播放彩蛋视频**。视频到 **00:28** 和 **01:28** 时，Q 版 DeepSeek 娘会在右下角发射球形虚式「茈」，白发龙角角色的 Q 版在旁边受击；**00:41** 双方以各自的结印姿势同时展开领域并产生碰撞。点画面 / 右上角小 ✕ / 按 `Esc` 关闭，放完自动关闭。

发送 **「？」**：助手回复被替换成一句——

> 发什么问号，严肃点全体保持Q弹！

**手动结束**：按 `Esc`，或双击小鲸鱼。音乐结束（或手动结束）后，整套角色与灯光**自动淡出消失**，回到平时隐身状态。

## 安装

插件是标准 DSH bundle 插件，装进 `web`（桌面端为 `desktop`）profile 即可。

### 方式 A：从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:learnfrom325/dsh-disco-whale
```

> 本插件目前**未发布到 npm**；也可以用 DSH 桌面端的插件管理器（市场）按 GitHub 地址安装。

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
[dsh-disco] ready v0.5.2：发送「欧耶耶」或「？」触发；提到「新宿决战」播放彩蛋视频
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

## 视频触发词

消息里**包含**以下辨识度高的梗（忽略空白与常见标点）就会播放视频：

- 新宿决战／人外魔境新宿决战／最强的战绩铭刻于新宿
- 五条悟赢了、你才是挑战者、2.5 条悟、一刻也来不及悼念五条悟
- 虚式「茈」、无限制虚式、没能让宿傩大人使出全力、我打宿傩？真的假的？
- 中间忘了后面也忘了
- B 站二创开头「真拿你没办法，坐好喽」、茈发动前的 41 秒、回到那个夏天依旧赌你会赢
- 「我已经 0.01 秒没看新宿决战了」、DeepSeek 娘 VS 豆包

「会赢的」单独发送或与五条悟等上下文同句时触发；「雨爱」「41 秒」需要与五条悟、宿傩、新宿等上下文同句。「两者皆有可能，这就是答案」需要与 DeepSeek、ChatGPT 或豆包同句，避免普通聊天误播。简繁体常见写法都支持。视频触发优先于蹦迪触发词。

新增词例参考 B 站的[《新宿决战》雨爱版](https://www.bilibili.com/video/BV1QC3G6DEKX/)、[音效版](https://www.bilibili.com/video/BV193Ye6BE9g/)、[41 秒二创](https://www.bilibili.com/video/BV1LPoXBSEUh/)与[DeepSeek 娘 VS 豆包](https://www.bilibili.com/video/BV1dsai6CErz/)；插件只匹配短语，不复制视频内容。

自定义视频地址（控制台执行一次，刷新后生效）：

```js
localStorage.setItem('dsh-disco-video', 'https://…/你的视频.mp4') // 换视频地址（相对路径 / https / data:video 均可）
```

## 音乐

插件**已内置**一段舞曲：`assets/music.mp3`（3.6 MB，48 kHz / 160 kbps 立体声，188 秒），装上即有音乐，无需任何配置。

> 音频来自 B 站视频 `BV1hXbN6VEKV`（UP 主：活跃黑江乐）的《朋友的酒》DJ 完整版，仅作彩蛋演示使用，版权归原作者。

想换曲子：把音频放到下面任意位置，命中的优先使用（越靠前优先级越高）：

```
<DSH_HOME>/disco-whale/music.mp3      ← 优先级最高（你自己的曲子）
<插件目录>/assets/music.mp3           ← 内置（仓库自带）
<DSH_HOME>/whale-audio/dance.mp3      ← 兜底：复用 dsh-whale-widget 的音频目录
```

支持 `mp3 / wav / ogg / m4a / flac / aac`；换曲子后刷新页面即可生效（无需重启 DSH）。所有候选都找不到时，用内置的 150BPM 合成旋律兜底。

**节拍对齐**：默认按 130 BPM、首个拍点距音频开头 0.199s 对齐（对应内置那段 188 秒舞曲）。换成别的曲子后如果"踩不准"，改 `assets/disco-widget.js` 顶部的 `DISCO_BPM` / `DISCO_PHASE`。

## 彩蛋视频

插件**已内置**彩蛋视频：`assets/video.mp4`（26 MB，1920×1080，1 分 33 秒，H.264 + AAC），触发后由前端 `<video>` 全屏无边框播放（宿主路由 `/dsh-disco/video.mp4`，支持 HTTP Range，可拖进度、秒开）。

想换视频：把 MP4 放到下面任意位置，命中的优先使用：

```
<DSH_HOME>/disco-whale/video.mp4      ← 优先级最高（你自己的视频）
<插件目录>/assets/video.mp4           ← 内置（仓库自带）
```

或控制台 `localStorage.setItem('dsh-disco-video', 'https://…/x.mp4')` 直接指到 URL。换完刷新页面即可生效（无需重启 DSH）。

> 视频素材来自 B 站 `BV1rNNQ6bEDH`（《新宿决战无水印版（雨爱）》），仅作彩蛋演示使用，版权归原作者。

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
dshDiscoVideo()         // 立即全屏播放彩蛋视频
dshDiscoVideoClose()    // 关闭彩蛋视频
dshDiscoVersion         // 版本号
```

宿主侧：

- 信号：`GET /dsh-disco/signal.json` → `{ ok, seq, ts, kind, meme }`，`kind` 为 `lyrics | question | video`
- 视频：`GET /dsh-disco/video.mp4`（支持 Range）
- 探针：前端每次加载会 `GET /dsh-disco/probe`，宿主把它记到 `<DSH_HOME>/.dsh-disco-probe.log` —— 用来确认「浏览器里跑的到底是不是这个插件」。

## 原理

```
┌─ 宿主插件 lib/index.js ────────────────────────────────────┐
│ ① webserver/index-inject  注入 <script src="/dsh-disco/widget.js">│
│ ② 注册路由：widget.js / char.png / audio / video.mp4 / signal.json / probe│
│ ③ user/message 命中视频梗：动态注入转场提示，让模型写聊天回复 │
│ ④ assistant/message + turn/end 完成后：发 video 信号        │
└───────────────────────────────────────────────────────────┘
                 ↑ 每秒轮询 signal.json
┌─ 前端挂件 assets/disco-widget.js（完全自包含）─────────────┐
│ 角色 + 气泡 + 音响 + 光效 + WebAudio 音乐：全部自己渲染    │
│ 彩蛋视频：全屏无边框 <video>，Range 流式播放，Esc/点击关闭 │
│ composer 回车/点发送：蹦迪仍可本地即时触发；视频等待模型     │
│ 聊天区替换：运行时解析 AssistantMarkdown 的 CSS Modules    │
│ hash，只隐藏 _body 再追加兄弟节点，不动 React 管理的节点    │
└───────────────────────────────────────────────────────────┘
```

蹦迪由本地输入与宿主事件共同触发；新宿决战视频只在模型回复完成后由宿主发信号，前端不会抢先播放，也不会伪造聊天文字。

## 目录结构

```
dsh-disco-whale/
├── package.json          # dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml      # 挂载声明（insert 到 web/desktop profile）
├── lib/index.js          # 宿主半区：注入 + 路由 + 触发判断
├── assets/
│   ├── disco-widget.js   # 前端挂件（自包含，约 1400 行）
│   ├── char.png          # 默认角色（小鲸鱼）
│   ├── char-alt.png      # 备用角色
│   ├── deepseek-cast.png # 新宿决战视频右下角的 Q 版施法角色
│   ├── dragon-chibi.png  # 白发龙角角色的 Q 版透明立绘
│   ├── deepseek-domain.png # DeepSeek 娘领域展开结印立绘
│   ├── dragon-domain.png   # 白发龙娘领域展开结印立绘
│   ├── music.mp3         # 内置舞曲（3.6 MB，可被用户目录的曲子覆盖）
│   ├── video.mp4         # 彩蛋视频（26 MB，可被用户目录的视频覆盖）
│   └── icon.png          # 插件图标
└── tests/smoke.cjs       # 冒烟测试（vm + DOM/Audio stub）
```

## 已知限制

- **回复变歌词**依赖 DSH 前端 `AssistantMarkdown` 的 DOM 结构（`_root` / `_body`）。DSH 大版本更新后若失效，只影响这一项，灯光 / 蹦迪 / 音乐 / 气泡歌词照常。
- 桌面 Electron 端依赖宿主 `webserver/index-inject` 通道；极老版本没有该通道时，需要手动在页面里加载 `/dsh-disco/widget.js`。
- 浏览器自动播放策略：由点击 / 回车触发的播放有用户手势，正常出声；仅靠宿主信号触发（例如语音输入）时可能没有手势而静音——先点一下页面即可恢复。彩蛋视频同理：被浏览器拒绝自动播放时画面仍在，点画面即可开始，点画面也会关闭视频。
- 长音乐（几分钟）播放期间，前端会每 20 秒「续约」一次 AudioContext，避免浏览器把音频上下文挂起。

## 素材与许可

- 代码：**MIT**（见 `LICENSE`）。
- `assets/char.png`、`assets/char-alt.png` 来自 [dsh-whale-widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（原始素材 as-is，原插件作者 @T7moris）。
- 歌词《朋友的酒》：著作权归原作者所有，此处仅作彩蛋示例，请勿用于商业用途。
- 内置音乐 `assets/music.mp3`：来自 B 站 `BV1hXbN6VEKV`（UP 主：活跃黑江乐）《朋友的酒》DJ 完整版，供本彩蛋演示使用，权利归原作者；如果你要再分发/商用，请自行替换成你有权使用的曲子（放 `<DSH_HOME>/disco-whale/music.mp3` 即可覆盖内置文件）。
- 内置彩蛋视频 `assets/video.mp4`：来自 B 站 `BV1rNNQ6bEDH`（《新宿决战无水印版（雨爱）》），供本彩蛋演示使用，权利归原作者；再分发/商用请自行替换（放 `<DSH_HOME>/disco-whale/video.mp4` 即可覆盖）。
- 灵感来源：B 站 `BV1kTp962EJG`（UP 主：幸羽雪雪）。

## 开发

```bash
node --check lib/index.js          # 宿主语法检查
node --check assets/disco-widget.js # 前端语法检查
node tests/smoke.cjs               # 冒烟测试（无需浏览器）
```

欢迎提 Issue / PR。
