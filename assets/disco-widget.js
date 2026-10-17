/**
 * dsh-disco-whale —— 前端挂件（浏览器侧，完全自包含）
 * ============================================================================
 * 这个文件由宿主插件通过 `/dsh-disco/widget.js` 下发，注入到 DSH Web 页面里。
 * 它不依赖 dsh-whale-widget：角色、气泡、音响、特效、音乐全部自己渲染。
 *
 * 触发方式（两路，写同一个自增 seq，1.5s 内去重）：
 *   1. 本地：composer 回车 / 点发送按钮时读输入框文本，命中触发词立即开演（0 延迟）；
 *   2. 宿主：插件监听会话 `user/message`，命中后把信号写进 `/dsh-disco/signal.json`，
 *      前端每秒轮询到新 seq 再开演（语音输入、快捷发送也不会漏）。
 *
 * 手动结束：Esc，或双击小鲸鱼。
 * 控制台调试：dshDiscoNow() / dshDiscoTest() / dshDiscoStop() / dshDiscoSay(text)
 */
(function () {
  'use strict'

  try {
    if (window.__dshDiscoWhale) return
    window.__dshDiscoWhale = true

    // =======================================================================
    // 配置
    // =======================================================================

    var DISCO_VERSION = '0.1.1'

    /** 触发词：归一化（去空白/标点 + 小写）后整条等于其中之一才算。 */
    var DISCO_WORDS = ['欧耶耶', '欧耶', '欧也', '耶耶耶', 'oh yeah yeah', 'ohyeahyeah', 'our ye ye', 'ouyeye', 'oyeye']

    /** 问号消息的固定回复。 */
    var DISCO_QUESTION_REPLY = '发什么问号，严肃点全体保持Q弹！'

    /** 气泡歌词轮播间隔（放慢到一句 9.2s）；聊天区回复固定为 16 行歌词。 */
    var DISCO_LYRIC_MS = 9200

    /** 兜底时长：只在音乐还没加载出来/加载失败时用；正常由真实音频时长决定。 */
    var DISCO_FALLBACK_MS = 6000

    /** 对内置音乐做能量包络自相关得到的节拍：130 BPM，首个拍点 0.199s。 */
    var DISCO_BPM = 130
    var DISCO_PHASE = 0.199

    /** 角色尺寸与左右摇摆幅度（都可被 localStorage / CSS 变量覆盖）。 */
    var DISCO_SIZE = 'clamp(130px, 16vw, 210px)'
    var DISCO_SWAY = '52vw'

    /** 《朋友的酒》歌词（著作权归原作者；本插件仅作示例/彩蛋用途）。 */
    var DISCO_LYRICS = [
      '昨日一去不复回 哦也',
      '开心比什么都贵',
      '覆水不能再收回 哦也',
      '桃花谢了有玫瑰',
      '人生几十年 总会有风雨来陪',
      '潇潇洒洒赴会 今不醉不归',
      '往事后不后悔 慢慢去体会',
      '此刻朋友这杯酒最珍贵',
      '快把酒满上 干了这杯 大声歌唱',
      '好朋友好朋友 今宵多欢畅',
      '理想改变了 我们的模样',
      '也让我懂得了要珍惜 朋友的肩膀',
      '阳光总会在 风雨之后 撒向苍茫',
      '让我们抬起头 学会了坚强',
      '就像朋友的这杯烈酒 烫我心上温暖我',
      '凡事别再放心上',
      '今天我们来相会 哦也',
      '深情斟满了酒杯',
      '岁月匆匆如流水 哦也',
      '管他昨天谁是谁',
      '人生的旅程 有苦有甜也有泪',
      '好汉不提当年 酒再干一杯',
      '往事决不后悔 不必再理会',
      '金杯里斟满了醇香的奶酒',
      '朋友们欢聚一堂共同来干一杯'
    ]

    /** 歌词放慢后，聊天区回复里一次展示 16 行（放不下的滚动也够看）。 */
    var DISCO_REPLY_LINES = 16

    // 允许用户自定义角色图（URL 或 data: URI）
    var DISCO_CHAR_URL = '/dsh-disco/char.png'
    try {
      var customChar = window.localStorage && window.localStorage.getItem('dsh-disco-char')
      if (customChar && /^(https?:|data:image\/|\/)/.test(customChar)) DISCO_CHAR_URL = customChar
      // 触发词覆盖（英文逗号分隔，例如 "欧耶耶,ohyeahyeah,蹦迪"）
      var storedWords = window.localStorage && window.localStorage.getItem('dsh-disco-words')
      if (storedWords) {
        var parsedWords = String(storedWords)
          .split(',')
          .map(function (s) {
            return String(s).trim()
          })
          .filter(Boolean)
        if (parsedWords.length) DISCO_WORDS = parsedWords
      }
      // 尺寸/摇摆幅度覆盖（任意 CSS 长度值，如 "180px" / "40vw"）
      var storedSize = window.localStorage && window.localStorage.getItem('dsh-disco-size')
      if (storedSize) DISCO_SIZE = String(storedSize)
      var storedSway = window.localStorage && window.localStorage.getItem('dsh-disco-sway')
      if (storedSway) DISCO_SWAY = String(storedSway)
    } catch (err) {
      /* 隐私模式下 localStorage 可能不可用 */
    }

    // =======================================================================
    // CSS
    // =======================================================================

    var CSS = String.raw`
:root{--dshdw-beat:.4615s;--dshdw-beat-delay:0s}
/* ---------- 角色本体 ---------- */
.dshdw-root{position:fixed;right:14px;bottom:0;width:var(--dshdw-size,clamp(130px,16vw,210px));height:var(--dshdw-size,clamp(130px,16vw,210px));z-index:2147482900;pointer-events:none;transform-origin:50% 100%;will-change:transform;opacity:0;visibility:hidden;transition:opacity .3s ease,visibility 0s linear .3s}
/* 平时完全隐身，只在播放动画时整体淡入 */
.dshdw-root.dshdw-active{opacity:1;visibility:visible;transition:opacity .3s ease,visibility 0s linear 0s}
.dshdw-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%}
.dshdw-img{position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35))}
.dshdw-root.dshdw-dancing .dshdw-body{animation:dshdw-bounce var(--dshdw-beat,.4615s) cubic-bezier(.28,1.45,.44,1) infinite;animation-delay:var(--dshdw-beat-delay,0s);will-change:transform}
@keyframes dshdw-bounce{0%{transform:translateY(0) scale(1.1,.84)}16%{transform:translateY(-18px) scale(.9,1.14)}44%{transform:translateY(-5px) scale(1.05,.96)}70%{transform:translateY(0) scale(1.07,.9)}100%{transform:translateY(0) scale(1.1,.84)}}
.dshdw-root.dshdw-dancing{animation:dshdw-sway calc(var(--dshdw-beat,.4615s) * 8) ease-in-out infinite alternate;will-change:transform}
@keyframes dshdw-sway{from{transform:translateX(0)}to{transform:translateX(calc(-1 * var(--dshdw-sway,52vw)))}}
/* ---------- 角色气泡 ---------- */
.dshdw-pop{position:absolute;left:50%;bottom:calc(100% - 2px);transform:translate(-50%,10px) scale(.92);transform-origin:50% 100%;max-width:min(260px,64vw);padding:9px 14px;border-radius:16px;background:linear-gradient(180deg,#fff,#eef3ff);color:#1c2a4a;font:600 14px/1.45 system-ui,"Microsoft YaHei","PingFang SC",sans-serif;box-shadow:0 8px 22px rgba(20,30,70,.28);opacity:0;transition:opacity .22s ease,transform .22s ease;pointer-events:none;white-space:normal;word-break:break-word;text-align:center;z-index:3}
.dshdw-pop.is-open{opacity:1;transform:translate(-50%,0) scale(1)}
.dshdw-pop::after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-top-color:#eef3ff;border-bottom:0}
/* ---------- 音响 ---------- */
.dshdw-speaker{position:absolute;left:-8%;bottom:3%;width:34%;height:48%;border-radius:14%/10%;background:linear-gradient(165deg,#3d4363 0%,#1a1e30 42%,#0c0e18 100%);box-shadow:inset 0 0 14px rgba(0,0,0,.85),inset 0 2px 0 rgba(255,255,255,.18),0 8px 20px rgba(0,0,0,.45);transform-origin:50% 100%;display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:8% 0;box-sizing:border-box;pointer-events:none;z-index:2}
.dshdw-speaker::before{content:"";width:34%;height:34%;border-radius:50%;background:radial-gradient(circle at 36% 30%,#8f9ac8,#2a2f4a 62%,#07080f 100%);box-shadow:inset 0 0 6px rgba(0,0,0,.9),0 0 8px rgba(120,140,255,.45);animation:dshdw-woofer var(--dshdw-beat,.4615s) ease-out infinite;animation-delay:var(--dshdw-beat-delay,0s)}
.dshdw-speaker::after{content:"";width:54%;height:22%;border-radius:999px;background:radial-gradient(ellipse at 50% 45%,#aab4d8,#303650 58%,#080a12 100%);box-shadow:inset 0 0 8px rgba(0,0,0,.9)}
@keyframes dshdw-woofer{0%{transform:scale(1)}8%{transform:scale(1.22)}30%{transform:scale(.94)}60%{transform:scale(1.06)}100%{transform:scale(1)}}
.dshdw-speaker-led{position:absolute;right:8%;top:6%;width:9%;height:9%;border-radius:50%;background:#39ffb0;box-shadow:0 0 8px #39ffb0,0 0 16px rgba(57,255,176,.7);animation:dshdw-led var(--dshdw-beat,.4615s) steps(2) infinite}
@keyframes dshdw-led{0%,49%{opacity:1}50%,100%{opacity:.25}}
/* ---------- 全屏舞厅光效 ---------- */
.dshdw-fx{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;overflow:hidden;contain:strict}
/* 顶灯吊杆 + 迪斯科球 */
.dshdw-fx-rig{position:absolute;left:50%;top:0;width:3px;height:5vh;margin-left:-1.5px;background:linear-gradient(180deg,rgba(150,160,200,.9),rgba(30,34,50,.95));box-shadow:0 0 8px rgba(0,0,0,.6);z-index:6}
.dshdw-fx-ball{position:absolute;left:50%;top:5vh;width:11vmin;height:11vmin;margin-left:-5.5vmin;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff 0,#eef3ff 12%,#a3aee2 28%,#4a5286 52%,#191d33 78%,#080a12 100%);box-shadow:0 0 30px rgba(160,180,255,.95),0 0 110px rgba(120,140,255,.6),inset -8px -8px 18px rgba(0,0,0,.75),inset 8px 8px 16px rgba(255,255,255,.32);overflow:hidden;z-index:7;animation:dshdw-ballSpin calc(var(--dshdw-beat,.4615s) * 6) linear infinite}
.dshdw-fx-ball::before{content:"";position:absolute;inset:-20%;border-radius:50%;background:conic-gradient(from 0deg,rgba(255,255,255,.85) 0deg 5deg,rgba(255,255,255,0) 5deg 16deg,rgba(255,255,255,.7) 16deg 21deg,rgba(255,255,255,0) 21deg 34deg,rgba(255,255,255,.8) 34deg 38deg,rgba(255,255,255,0) 38deg 60deg,rgba(255,255,255,.6) 60deg 64deg,rgba(255,255,255,0) 64deg 90deg,rgba(255,255,255,.85) 90deg 95deg,rgba(255,255,255,0) 95deg 130deg,rgba(255,255,255,.7) 130deg 135deg,rgba(255,255,255,0) 135deg 180deg,rgba(255,255,255,.8) 180deg 185deg,rgba(255,255,255,0) 185deg 220deg,rgba(255,255,255,.65) 220deg 225deg,rgba(255,255,255,0) 225deg 270deg,rgba(255,255,255,.85) 270deg 275deg,rgba(255,255,255,0) 275deg 320deg,rgba(255,255,255,.7) 320deg 325deg,rgba(255,255,255,0) 325deg 360deg);mix-blend-mode:screen;animation:dshdw-ballSpin calc(var(--dshdw-beat,.4615s) * 3) linear infinite}
@keyframes dshdw-ballSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
/* ① 全屏旋转彩色光幕 */
.dshdw-fx-hall{position:absolute;inset:-25%;background:conic-gradient(from 0deg,rgba(255,0,150,.42),rgba(0,255,255,.34),rgba(255,230,0,.36),rgba(120,0,255,.42),rgba(0,255,140,.34),rgba(255,90,0,.38),rgba(255,0,150,.42));filter:blur(52px) saturate(1.35);opacity:.62;mix-blend-mode:screen;animation:dshdw-hallSpin 26s linear infinite;will-change:transform}
@keyframes dshdw-hallSpin{from{transform:rotate(0deg) scale(1.05)}to{transform:rotate(360deg) scale(1.05)}}
/* ② 全屏径向光晕（随拍脉冲） */
.dshdw-fx-glow{position:absolute;inset:0;background:radial-gradient(52% 46% at 50% 38%,rgba(190,140,255,.5),rgba(120,80,255,.16) 46%,rgba(0,0,0,0) 76%);mix-blend-mode:screen;animation:dshdw-glowPulse calc(var(--dshdw-beat,.4615s) * 2) ease-in-out infinite alternate}
@keyframes dshdw-glowPulse{from{opacity:.55;filter:hue-rotate(0deg)}to{opacity:1;filter:hue-rotate(160deg)}}
/* ③ 镜面球光斑 */
.dshdw-fx-dots{position:absolute;inset:-30%;background-image:radial-gradient(circle at 24% 18%,rgba(255,255,255,.95) 0 1.1vmin,rgba(255,255,255,0) 1.9vmin),radial-gradient(circle at 62% 9%,rgba(255,240,255,.9) 0 .9vmin,rgba(255,255,255,0) 1.6vmin),radial-gradient(circle at 86% 34%,rgba(210,255,255,.9) 0 1.3vmin,rgba(255,255,255,0) 2.1vmin),radial-gradient(circle at 12% 52%,rgba(255,255,230,.92) 0 1vmin,rgba(255,255,255,0) 1.7vmin),radial-gradient(circle at 44% 66%,rgba(255,220,255,.9) 0 1.4vmin,rgba(255,255,255,0) 2.2vmin),radial-gradient(circle at 74% 84%,rgba(220,240,255,.9) 0 1.15vmin,rgba(255,255,255,0) 1.9vmin),radial-gradient(circle at 33% 92%,rgba(255,255,255,.85) 0 .95vmin,rgba(255,255,255,0) 1.6vmin),radial-gradient(circle at 92% 62%,rgba(255,245,255,.88) 0 1.05vmin,rgba(255,255,255,0) 1.8vmin);mix-blend-mode:screen;opacity:.95;animation:dshdw-dotsSpin 17s linear infinite;will-change:transform}
@keyframes dshdw-dotsSpin{from{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.12)}to{transform:rotate(360deg) scale(1)}}
/* ④ 五束长激光 */
.dshdw-fx-beams{position:absolute;left:50%;top:calc(5vh + 5.5vmin);width:0;height:0}
.dshdw-fx-beam{position:absolute;left:0;top:0;width:48vmax;height:135vh;transform-origin:0 0;mix-blend-mode:screen;pointer-events:none;clip-path:polygon(0 0,100% 100%,0 100%);opacity:.55;animation:dshdw-beamA 4.6s ease-in-out infinite alternate;filter:blur(1px)}
.dshdw-fx-beam.b1{background:linear-gradient(180deg,rgba(255,64,200,.95),rgba(255,0,140,.3) 42%,rgba(0,0,0,0) 86%)}
.dshdw-fx-beam.b2{background:linear-gradient(180deg,rgba(0,255,255,.9),rgba(0,180,255,.28) 42%,rgba(0,0,0,0) 86%);animation-name:dshdw-beamB;animation-duration:5.4s;animation-delay:-1.4s;opacity:.48}
.dshdw-fx-beam.b3{background:linear-gradient(180deg,rgba(255,214,0,.9),rgba(255,140,0,.26) 44%,rgba(0,0,0,0) 88%);animation-name:dshdw-beamC;animation-duration:6.2s;animation-delay:-2.6s;opacity:.46}
.dshdw-fx-beam.b4{background:linear-gradient(180deg,rgba(140,255,120,.85),rgba(0,200,120,.24) 44%,rgba(0,0,0,0) 88%);animation-name:dshdw-beamD;animation-duration:5.9s;animation-delay:-3.3s;opacity:.42}
.dshdw-fx-beam.b5{background:linear-gradient(180deg,rgba(150,140,255,.9),rgba(90,60,255,.26) 44%,rgba(0,0,0,0) 88%);animation-name:dshdw-beamE;animation-duration:6.8s;animation-delay:-4.7s;opacity:.44}
@keyframes dshdw-beamA{from{transform:rotate(-40deg)}to{transform:rotate(34deg)}}
@keyframes dshdw-beamB{from{transform:rotate(30deg)}to{transform:rotate(-36deg)}}
@keyframes dshdw-beamC{from{transform:rotate(-12deg)}to{transform:rotate(44deg)}}
@keyframes dshdw-beamD{from{transform:rotate(12deg)}to{transform:rotate(-46deg)}}
@keyframes dshdw-beamE{from{transform:rotate(-52deg)}to{transform:rotate(6deg)}}
/* ⑤ 底部舞池反光 */
.dshdw-fx-floor{position:absolute;left:0;bottom:0;width:100%;height:52vh;background:linear-gradient(0deg,rgba(255,60,220,.34),rgba(120,80,255,.22) 34%,rgba(0,220,255,.12) 62%,rgba(0,0,0,0) 100%);mix-blend-mode:screen;animation:dshdw-floorPulse calc(var(--dshdw-beat,.4615s) * 2) ease-in-out infinite alternate;animation-delay:var(--dshdw-beat-delay,0s)}
@keyframes dshdw-floorPulse{from{opacity:.5;filter:hue-rotate(0deg)}to{opacity:1;filter:hue-rotate(90deg)}}
/* ⑥ 扫描线 */
.dshdw-fx-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.055) 0 2px,rgba(0,0,0,0) 2px 7px);mix-blend-mode:screen;opacity:.55;animation:dshdw-scanMove 3.6s linear infinite}
@keyframes dshdw-scanMove{from{transform:translateY(0)}to{transform:translateY(7px)}}
/* ⑦ 全屏频闪 */
.dshdw-fx-strobe{position:absolute;left:0;top:0;width:100%;height:100%;background:radial-gradient(70% 60% at 50% 42%,rgba(255,255,255,.9),rgba(255,240,255,.24) 42%,rgba(255,255,255,0) 76%);mix-blend-mode:screen;opacity:0;animation:dshdw-strobe var(--dshdw-beat,.4615s) steps(1) infinite;animation-delay:var(--dshdw-beat-delay,0s)}
@keyframes dshdw-strobe{0%{opacity:.34}12%{opacity:0}100%{opacity:0}}
/* ---------- 聊天区被替换的回复 ---------- */
.dshdw-lines{margin:2px 0 0;padding:0}
.dshdw-lines p{margin:4px 0;line-height:1.6}
`

    // =======================================================================
    // 状态
    // =======================================================================

    var root = null
    var body = null
    var img = null
    var popEl = null
    var popTextEl = null
    var speakerEl = null
    var fxEl = null

    var dancing = false
    var token = 0
    var startAt = 0
    var stopTimer = null
    var keepAliveTimer = null
    var lyricTimer = null
    var lyricIdx = 0
    var popTimer = null
    var audioStop = null
    var lastComposerText = ''
    var signalSeq = 0
    var signalReady = false
    var composingNow = false

    var replyWatch = null
    var replyTicker = null
    var assistSelector = null

    // =======================================================================
    // 工具
    // =======================================================================

    function normalize(text) {
      try {
        return String(text == null ? '' : text)
          .toLowerCase()
          .replace(/[\s\u3000,.!?;:'"，。、！？；：…·~_\-()（）[\]【】]/g, '')
      } catch (err) {
        return ''
      }
    }

    function matchWord(text) {
      var n = normalize(text)
      if (!n) return false
      for (var i = 0; i < DISCO_WORDS.length; i++) {
        if (normalize(DISCO_WORDS[i]) === n) return true
      }
      return false
    }

    function matchQuestion(text) {
      try {
        var t = String(text == null ? '' : text).trim()
        return !!t && /^[?？\s]+$/.test(t)
      } catch (err) {
        return false
      }
    }

    function log(message) {
      try {
        console.log('[dsh-disco] ' + message)
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // DOM：角色 + 气泡 + 音响
    // =======================================================================

    function mount() {
      if (root && root.parentNode) return root
      try {
        var style = document.createElement('style')
        style.setAttribute('data-dsh-disco-css', '1')
        style.textContent = CSS
        ;(document.head || document.documentElement).appendChild(style)

        root = document.createElement('div')
        root.className = 'dshdw-root'
        root.style.setProperty('--dshdw-size', DISCO_SIZE)
        root.style.setProperty('--dshdw-sway', DISCO_SWAY)

        body = document.createElement('div')
        body.className = 'dshdw-body'

        img = document.createElement('img')
        img.className = 'dshdw-img'
        img.src = DISCO_CHAR_URL
        img.alt = ''
        img.draggable = false

        popEl = document.createElement('div')
        popEl.className = 'dshdw-pop'
        popTextEl = document.createElement('span')
        popTextEl.className = 'dshdw-pop-text'
        popEl.appendChild(popTextEl)

        body.appendChild(img)
        root.appendChild(popEl)
        root.appendChild(body)
        ;(document.body || document.documentElement).appendChild(root)
        if (dancing) {
          try {
            root.classList.add('dshdw-active')
          } catch (err) {
            /* 忽略 */
          }
        }
        return root
      } catch (err) {
        return null
      }
    }

    function unmount() {
      try {
        if (root && root.parentNode) root.parentNode.removeChild(root)
      } catch (err) {
        /* 忽略 */
      }
      root = null
      body = null
      img = null
      popEl = null
      popTextEl = null
    }

    // =======================================================================
    // 角色说话
    // =======================================================================

    function say(text, ttl) {
      try {
        if (!popEl || !popTextEl) return
        popTextEl.textContent = String(text == null ? '' : text)
        popEl.classList.add('is-open')
        if (popTimer) clearTimeout(popTimer)
        popTimer = setTimeout(function () {
          popTimer = null
          try {
            popEl.classList.remove('is-open')
          } catch (err) {
            /* 忽略 */
          }
        }, ttl > 0 ? ttl : 5200)
      } catch (err) {
        /* 忽略 */
      }
    }

    function hideSay() {
      try {
        if (popTimer) {
          clearTimeout(popTimer)
          popTimer = null
        }
        if (popEl) popEl.classList.remove('is-open')
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 音响
    // =======================================================================

    function speaker(on) {
      try {
        if (!on) {
          if (speakerEl && speakerEl.parentNode) speakerEl.parentNode.removeChild(speakerEl)
          speakerEl = null
          return
        }
        if (speakerEl && speakerEl.parentNode) return
        if (!body) return
        var sp = document.createElement('div')
        sp.className = 'dshdw-speaker'
        var led = document.createElement('i')
        led.className = 'dshdw-speaker-led'
        sp.appendChild(led)
        body.appendChild(sp)
        speakerEl = sp
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 节拍 & 光效
    // =======================================================================

    function applyBeat(bpm, phase) {
      try {
        var b = Number(bpm) > 0 ? Number(bpm) : 130
        var period = 60 / b
        var d = document.documentElement
        d.style.setProperty('--dshdw-beat', period.toFixed(4) + 's')
        var ph = Number(phase) > 0 ? Number(phase) : 0
        // 负延迟让动画 0% 落在音频第一个拍点
        d.style.setProperty('--dshdw-beat-delay', (-(period - (ph % period))).toFixed(4) + 's')
      } catch (err) {
        /* 忽略 */
      }
    }

    function spawnFx() {
      try {
        if (fxEl && fxEl.parentNode) fxEl.parentNode.removeChild(fxEl)
        var fx = document.createElement('div')
        fx.className = 'dshdw-fx'
        var add = function (cls, parent) {
          var el = document.createElement('div')
          el.className = cls
          ;(parent || fx).appendChild(el)
          return el
        }
        add('dshdw-fx-hall')
        add('dshdw-fx-dots')
        var beamsBox = add('dshdw-fx-beams')
        for (var i = 1; i <= 5; i++) add('dshdw-fx-beam b' + i, beamsBox)
        add('dshdw-fx-glow')
        add('dshdw-fx-floor')
        add('dshdw-fx-scan')
        add('dshdw-fx-rig')
        add('dshdw-fx-ball')
        add('dshdw-fx-strobe')
        ;(document.body || document.documentElement).appendChild(fx)
        fxEl = fx
      } catch (err) {
        /* 忽略 */
      }
    }

    function clearFx() {
      try {
        if (fxEl && fxEl.parentNode) fxEl.parentNode.removeChild(fxEl)
      } catch (err) {
        /* 忽略 */
      }
      fxEl = null
      try {
        document.documentElement.style.removeProperty('--dshdw-beat-delay')
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 音乐
    // =======================================================================

    var audioCtx = null

    function ctx() {
      try {
        if (!audioCtx) {
          var Ctor = window.AudioContext || window.webkitAudioContext
          if (!Ctor) return null
          audioCtx = new Ctor()
        }
        if (audioCtx.state === 'suspended') {
          try {
            audioCtx.resume()
          } catch (err) {
            /* 可能没有用户手势 */
          }
        }
        return audioCtx
      } catch (err) {
        return null
      }
    }

    function playMusic(onDuration) {
      var myToken = token
      var doneOnce = false
      var done = function (seconds) {
        if (doneOnce) return
        doneOnce = true
        if (myToken !== token) return
        try {
          if (onDuration) onDuration(seconds)
        } catch (err) {
          /* 忽略 */
        }
      }
      var fallback = function () {
        try {
          syntheticTune()
        } catch (err) {
          /* 忽略 */
        }
        done(DISCO_FALLBACK_MS / 1000)
      }
      try {
        var c = ctx()
        if (!c || typeof fetch !== 'function') return fallback()
        fetch('/dsh-disco/audio', { cache: 'no-store' })
          .then(function (r) {
            if (!r || !r.ok) throw new Error('no audio')
            return r.arrayBuffer()
          })
          .then(function (ab) {
            return c.decodeAudioData(ab)
          })
          .then(function (buf) {
            try {
              if (myToken !== token) return
              if (!buf || !buf.duration) return fallback()
              var src = c.createBufferSource()
              src.buffer = buf
              src.loop = false
              var gain = c.createGain()
              gain.gain.value = 0.8
              src.connect(gain)
              gain.connect(c.destination)
              audioStop = function () {
                try {
                  gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.15)
                } catch (err) {
                  /* 忽略 */
                }
                try {
                  src.stop(c.currentTime + 0.45)
                } catch (err) {
                  /* 忽略 */
                }
              }
              src.onended = function () {
                // 只有"当前这一轮"的音频自然结束才收尾
                if (myToken === token) stop()
              }
              src.start(0)
              done(buf.duration)
            } catch (err) {
              fallback()
            }
          })
          .catch(fallback)
      } catch (err) {
        fallback()
      }
    }

    /** 没有自备音乐时的兜底：150BPM 欢快八分音符 + 底鼓/军鼓/踩镲。 */
    function syntheticTune() {
      var c = ctx()
      if (!c) return
      try {
        var t0 = c.currentTime + 0.03
        var total = DISCO_FALLBACK_MS / 1000
        var master = c.createGain()
        master.gain.setValueAtTime(0.0001, t0)
        master.gain.exponentialRampToValueAtTime(0.55, t0 + 0.06)
        master.gain.setValueAtTime(0.55, t0 + Math.max(0.1, total - 0.9))
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + total)
        master.connect(c.destination)

        var freqOf = function (midi) {
          return 440 * Math.pow(2, (midi - 69) / 12)
        }
        var step = 60 / 150 / 2 // 150BPM 的八分音符
        var noiseBuf = null
        var noise = function (when, dur, vol, hpf) {
          try {
            if (!noiseBuf) {
              noiseBuf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * 0.3)), c.sampleRate)
              var data = noiseBuf.getChannelData(0)
              for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
            }
            var s = c.createBufferSource()
            s.buffer = noiseBuf
            var f = c.createBiquadFilter()
            f.type = 'highpass'
            f.frequency.value = hpf || 4000
            var g = c.createGain()
            g.gain.setValueAtTime(vol, when)
            g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
            s.connect(f)
            f.connect(g)
            g.connect(master)
            s.start(when)
            s.stop(when + dur + 0.02)
          } catch (err) {
            /* 忽略 */
          }
        }
        var kick = function (when) {
          try {
            var o = c.createOscillator()
            var g = c.createGain()
            o.type = 'sine'
            o.frequency.setValueAtTime(120, when)
            o.frequency.exponentialRampToValueAtTime(45, when + 0.14)
            g.gain.setValueAtTime(0.5, when)
            g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16)
            o.connect(g)
            g.connect(master)
            o.start(when)
            o.stop(when + 0.18)
          } catch (err) {
            /* 忽略 */
          }
        }
        var tone = function (when, dur, midi, type, vol) {
          try {
            var o = c.createOscillator()
            var g = c.createGain()
            o.type = type || 'square'
            o.frequency.setValueAtTime(freqOf(midi), when)
            g.gain.setValueAtTime(0.0001, when)
            g.gain.exponentialRampToValueAtTime(vol, when + 0.012)
            g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
            o.connect(g)
            g.connect(master)
            o.start(when)
            o.stop(when + dur + 0.02)
          } catch (err) {
            /* 忽略 */
          }
        }

        var melody = [
          72, 72, 76, 79, 81, 79, 76, 72,
          69, 72, 76, 81, 79, 76, 72, 69,
          65, 69, 72, 77, 76, 72, 69, 65,
          67, 71, 74, 79, 76, 74, 71, 67
        ]
        var bass = [48, 48, 45, 45, 41, 41, 43, 43]
        for (var b = 0; b < 4; b++) {
          var bt = t0 + b * step * 8
          tone(bt, step * 2.6, bass[b * 2], 'triangle', 0.11)
          tone(bt + step * 4, step * 2.6, bass[b * 2 + 1], 'triangle', 0.11)
          for (var k = 0; k < 4; k++) kick(bt + k * step * 2)
          for (var s2 = 0; s2 < 8; s2++) {
            var when = bt + s2 * step
            if (s2 % 2 === 1) noise(when, 0.1, 0.12, 3000)
            else noise(when, 0.03, 0.05, 7000)
            var mi = melody[b * 8 + s2]
            tone(when, step * 0.9, mi, 'square', s2 % 4 === 0 ? 0.2 : 0.16)
            tone(when, step * 0.5, mi + 12, 'triangle', 0.045)
          }
        }
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 歌词轮播
    // =======================================================================

    function lyricsLoop() {
      try {
        lyricsStop()
        var nextLine = function () {
          try {
            if (!dancing) return
            say(DISCO_LYRICS[lyricIdx % DISCO_LYRICS.length], DISCO_LYRIC_MS - 600)
            lyricIdx += 1
          } catch (err) {
            /* 忽略 */
          }
        }
        window.setTimeout(nextLine, 1400)
        lyricTimer = window.setInterval(nextLine, DISCO_LYRIC_MS)
      } catch (err) {
        /* 忽略 */
      }
    }

    function lyricsStop() {
      try {
        if (lyricTimer) {
          window.clearInterval(lyricTimer)
          lyricTimer = null
        }
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 聊天区回复替换：把那条助手回复换成歌词 / 固定句子
    // =======================================================================

    /**
     * DSH 助手消息：<div class="<hash>_root" [data-streaming]><div class="<hash>_body">…</div></div>
     * <hash> 是构建期生成的 CSS Modules 名，不能写死。两条解析路线：
     *   ① 注入的 <style data-plugin-css="…AssistantMarkdown…"> 里抠出 .<hash>_root；
     *   ② 扫 DOM：class 带 `_root` 且首个子元素 class 带 `_body` 的容器。
     */
    function assistantSelector() {
      if (assistSelector) return assistSelector
      try {
        var styles = document.querySelectorAll('style[data-plugin-css]')
        for (var i = 0; i < styles.length; i++) {
          var name = styles[i].getAttribute('data-plugin-css') || ''
          if (name.indexOf('AssistantMarkdown') < 0) continue
          var m = /\.([A-Za-z0-9]+)_root\b/.exec(styles[i].textContent || '')
          if (m) {
            assistSelector = '.' + m[1] + '_root'
            return assistSelector
          }
        }
      } catch (err) {
        /* 忽略 */
      }
      try {
        var els = document.querySelectorAll('[class*="_root"]')
        for (var j = 0; j < els.length; j++) {
          var cls = els[j].className || ''
          var mm = /(?:^|\s)([A-Za-z0-9]+_root)(?:\s|$)/.exec(cls)
          if (!mm) continue
          var sub = els[j].firstElementChild
          if (sub && /_body/.test(sub.className || '')) {
            assistSelector = '.' + mm[1]
            return assistSelector
          }
        }
      } catch (err) {
        /* 忽略 */
      }
      return null
    }

    function assistantRoots() {
      var sel = assistantSelector()
      if (!sel) return []
      try {
        return Array.prototype.slice.call(document.querySelectorAll(sel))
      } catch (err) {
        return []
      }
    }

    function replyTextOf(el) {
      try {
        var b = el.firstElementChild
        return b ? String(b.textContent || '') : ''
      } catch (err) {
        return ''
      }
    }

    function watchReply(kind) {
      try {
        var roots = assistantRoots()
        var last = roots.length ? roots[roots.length - 1] : null
        replyWatch = {
          kind: kind === 'question' ? 'question' : 'lyrics',
          baseText: last ? replyTextOf(last) : '',
          deadline: Date.now() + 90000,
          patched: 0
        }
        if (!replyTicker) replyTicker = window.setInterval(tickReply, 400)
      } catch (err) {
        /* 忽略 */
      }
    }

    /** 不删 React 管理的节点：只隐藏 _body，再追加自己的兄弟节点。 */
    function patchReply(el, lines) {
      try {
        if (el.getAttribute('data-dshdw-lines')) return true
        var bodyEl = el.firstElementChild
        if (!bodyEl) return false
        el.setAttribute('data-dshdw-lines', '1')
        try {
          bodyEl.style.display = 'none'
        } catch (err) {
          /* 忽略 */
        }
        var box = null
        try {
          box = el.querySelector ? el.querySelector('[data-dshdw-lines-box]') : null
        } catch (err) {
          /* 忽略 */
        }
        if (!box) {
          box = document.createElement('div')
          box.className = 'dshdw-lines'
          box.setAttribute('data-dshdw-lines-box', '1')
          el.appendChild(box)
        }
        while (box.firstChild) box.removeChild(box.firstChild)
        for (var i = 0; i < lines.length; i++) {
          var p = document.createElement('p')
          p.textContent = lines[i]
          box.appendChild(p)
        }
        return true
      } catch (err) {
        return false
      }
    }

    function tickReply() {
      try {
        var w = replyWatch
        if (!w) {
          stopReplyTicker()
          return
        }
        if (Date.now() > w.deadline) {
          replyWatch = null
          stopReplyTicker()
          return
        }
        var roots = assistantRoots()
        if (!roots.length) return
        for (var i = roots.length - 1; i >= 0; i--) {
          var el = roots[i]
          if (!el.firstElementChild) continue
          if (el.getAttribute('data-dshdw-lines')) return
          if (el.getAttribute('data-streaming') !== null) return
          if (replyTextOf(el) === w.baseText) return
          var lines = w.kind === 'question' ? [DISCO_QUESTION_REPLY] : DISCO_LYRICS.slice(0, DISCO_REPLY_LINES)
          if (patchReply(el, lines)) {
            w.patched += 1
            if (w.patched >= 2) {
              replyWatch = null
              stopReplyTicker()
            }
          }
          return
        }
      } catch (err) {
        /* 忽略 */
      }
    }

    function stopReplyTicker() {
      try {
        if (replyTicker) {
          window.clearInterval(replyTicker)
          replyTicker = null
        }
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 开演 / 收场
    // =======================================================================

    function start() {
      try {
        var now = Date.now()
        if (now - startAt < 1500) return // 本地 + 宿主两路触发的去重
        startAt = now
        var myToken = ++token
        dancing = true
        log('dance! 蹦迪开始（Esc / 双击小鲸鱼 可手动结束）')

        if (stopTimer) {
          clearTimeout(stopTimer)
          stopTimer = null
        }
        try {
          if (audioStop) {
            audioStop()
            audioStop = null
          }
        } catch (err) {
          /* 忽略 */
        }

        mount()
        try {
          if (root) root.classList.add('dshdw-active')
        } catch (err) {
          /* 忽略 */
        }
        applyBeat(DISCO_BPM, DISCO_PHASE)
        spawnFx()
        speaker(true)
        lyricsLoop()
        try {
          root.classList.add('dshdw-dancing')
        } catch (err) {
          /* 忽略 */
        }

        // 先挂兜底时长，拿到音乐真实时长后覆盖
        stopTimer = setTimeout(function () {
          stop()
        }, DISCO_FALLBACK_MS)

        playMusic(function (seconds) {
          try {
            if (myToken !== token) return
            var ms = Math.max(1200, Math.round(Number(seconds) * 1000) + 300)
            if (stopTimer) clearTimeout(stopTimer)
            stopTimer = setTimeout(function () {
              stop()
            }, ms)
          } catch (err) {
            /* 忽略 */
          }
        })

        // AudioContext 空闲会被浏览器挂起：播放期间每 20s 续约
        if (keepAliveTimer) {
          try {
            window.clearInterval(keepAliveTimer)
          } catch (err) {
            /* 忽略 */
          }
        }
        keepAliveTimer = window.setInterval(function () {
          try {
            ctx()
          } catch (err) {
            /* 忽略 */
          }
        }, 20000)
      } catch (err) {
        /* 忽略 */
      }
    }

    function stop() {
      try {
        token += 1
        dancing = false
        if (stopTimer) {
          clearTimeout(stopTimer)
          stopTimer = null
        }
        if (keepAliveTimer) {
          try {
            window.clearInterval(keepAliveTimer)
          } catch (err) {
            /* 忽略 */
          }
          keepAliveTimer = null
        }
        try {
          if (audioStop) {
            audioStop()
            audioStop = null
          }
        } catch (err) {
          /* 忽略 */
        }
        lyricsStop()
        speaker(false)
        stopReplyTicker()
        replyWatch = null
        hideSay()
        try {
          if (root) root.classList.remove('dshdw-dancing')
        } catch (err) {
          /* 忽略 */
        }
        // 收场后整体隐身，只在下次播放时再出现
        try {
          if (root) root.classList.remove('dshdw-active')
        } catch (err) {
          /* 忽略 */
        }
        clearFx()
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // composer 监听（本地即时触发）
    // =======================================================================

    function composerText() {
      try {
        var candidates = []
        try {
          if (document.activeElement) candidates.push(document.activeElement)
        } catch (err) {
          /* 忽略 */
        }
        var selectors = [
          '[data-composer-input]',
          '[data-composer-card] [contenteditable="true"]',
          '[data-composer-card]',
          '[data-composer-seat]',
          'textarea',
          '[contenteditable="true"]'
        ]
        for (var i = 0; i < selectors.length; i++) {
          try {
            var el = document.querySelector(selectors[i])
            if (el && candidates.indexOf(el) < 0) candidates.push(el)
          } catch (err) {
            /* 忽略 */
          }
        }
        for (var j = 0; j < candidates.length; j++) {
          var node = candidates[j]
          var text = ''
          try {
            if (typeof node.value === 'string') text = node.value
          } catch (err) {
            /* 忽略 */
          }
          if (!text) {
            try {
              text = node.textContent || ''
            } catch (err) {
              /* 忽略 */
            }
          }
          if (!text) {
            try {
              text = node.innerText || ''
            } catch (err) {
              /* 忽略 */
            }
          }
          if (text && String(text).trim()) return text
        }
        if (lastComposerText) return lastComposerText
      } catch (err) {
        /* 忽略 */
      }
      return ''
    }

    function maybeTrigger(text) {
      try {
        if (composingNow) return
        var t = text == null ? composerText() : text
        if (matchWord(t)) {
          watchReply('lyrics')
          start()
          return
        }
        if (matchQuestion(t)) watchReply('question')
      } catch (err) {
        /* 忽略 */
      }
    }

    function bind() {
      try {
        // 输入缓存：发送瞬间 DOM 可能先被清空，Enter 时读不到内容
        document.addEventListener(
          'input',
          function (e) {
            try {
              var target = e && e.target
              if (!target) return
              var value = ''
              try {
                if (typeof target.value === 'string') value = target.value
              } catch (err) {
                /* 忽略 */
              }
              if (!value) {
                try {
                  value = String(target.textContent || '')
                } catch (err) {
                  /* 忽略 */
                }
              }
              if (value && value.trim()) lastComposerText = value
            } catch (err) {
              /* 忽略 */
            }
          },
          true,
        )

        // 输入法组字状态（读 DOM 会打断组字，先标记）
        try {
          document.addEventListener(
            'compositionstart',
            function () {
              composingNow = true
            },
            true,
          )
          document.addEventListener(
            'compositionend',
            function () {
              window.setTimeout(function () {
                composingNow = false
              }, 0)
            },
            true,
          )
        } catch (err) {
          /* 忽略 */
        }

        document.addEventListener(
          'keydown',
          function (e) {
            try {
              if (!e || e.key !== 'Enter') return
              if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
              if (e.isComposing) return
              var live = ''
              try {
                var target = e.target
                if (target) {
                  live = typeof target.value === 'string' ? target.value : String(target.textContent || '')
                  if (live && live.trim()) lastComposerText = live
                }
              } catch (err) {
                /* 忽略 */
              }
              maybeTrigger(live || null)
            } catch (err) {
              /* 忽略 */
            }
          },
          true,
        )

        document.addEventListener(
          'click',
          function (e) {
            try {
              var node = e.target
              var button = null
              while (node && node !== document.body) {
                try {
                  if (node.tagName === 'BUTTON' || (node.getAttribute && node.getAttribute('role') === 'button')) {
                    button = node
                    break
                  }
                } catch (err) {
                  /* 忽略 */
                }
                node = node.parentNode
              }
              if (!button) return
              var inComposer = false
              try {
                inComposer = !!(
                  button.closest &&
                  (button.closest('[data-composer-card]') || button.closest('[data-composer-seat]') || button.closest('form'))
                )
              } catch (err) {
                /* 忽略 */
              }
              if (!inComposer) return
              maybeTrigger(null)
            } catch (err) {
              /* 忽略 */
            }
          },
          true,
        )

        // 手动结束：Esc（捕捉阶段，避免被 composer 抢走）
        document.addEventListener(
          'keydown',
          function (e) {
            try {
              if (!e || e.key !== 'Escape') return
              if (!dancing) return
              try {
                e.preventDefault()
                e.stopPropagation()
              } catch (err) {
                /* 忽略 */
              }
              stop()
            } catch (err) {
              /* 忽略 */
            }
          },
          true,
        )

        // 双击小鲸鱼结束
        try {
          if (img) {
            img.addEventListener(
              'dblclick',
              function (e) {
                try {
                  if (!dancing) return
                  e.preventDefault()
                  e.stopPropagation()
                  stop()
                } catch (err) {
                  /* 忽略 */
                }
              },
              true,
            )
          }
        } catch (err) {
          /* 忽略 */
        }
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 宿主信号轮询
    // =======================================================================

    function pollSignal() {
      try {
        if (typeof fetch !== 'function') return
        fetch('/dsh-disco/signal.json', { cache: 'no-store' })
          .then(function (r) {
            return r && r.ok ? r.json() : null
          })
          .then(function (data) {
            if (!data || typeof data.seq !== 'number') return
            if (!signalReady) {
              signalReady = true
              signalSeq = data.seq
              return
            }
            if (data.seq > signalSeq) {
              signalSeq = data.seq
              if (data.kind === 'question') {
                watchReply('question')
                return
              }
              watchReply('lyrics')
              start()
            }
          })
          .catch(function () {
            /* 宿主还没起来/路由 404：忽略 */
          })
      } catch (err) {
        /* 忽略 */
      }
    }

    function probe() {
      try {
        if (typeof fetch !== 'function') return
        fetch('/dsh-disco/probe?v=' + DISCO_VERSION, { cache: 'no-store' }).catch(function () {
          /* 忽略 */
        })
      } catch (err) {
        /* 忽略 */
      }
    }

    // =======================================================================
    // 启动
    // =======================================================================

    function boot() {
      try {
        if (!mount()) return
        bind()
        window.setInterval(pollSignal, 1000)
        try {
          window.setTimeout(pollSignal, 300)
        } catch (err) {
          /* 忽略 */
        }
        probe()
        log('ready v' + DISCO_VERSION + '：发送「欧耶耶」或「？」触发；控制台 dshDiscoTest() 手动播放')
      } catch (err) {
        /* 忽略 */
      }
    }

    // 控制台 / 外部调试入口
    try {
      window.dshDiscoNow = function () {
        try {
          start()
        } catch (err) {
          /* 忽略 */
        }
      }
      window.dshDiscoTest = function () {
        try {
          lastComposerText = DISCO_WORDS[0]
          start()
        } catch (err) {
          /* 忽略 */
        }
      }
      window.dshDiscoStop = function () {
        try {
          stop()
        } catch (err) {
          /* 忽略 */
        }
      }
      window.dshDiscoSay = function (text, ttl) {
        try {
          say(text || DISCO_LYRICS[0], ttl || 5200)
        } catch (err) {
          /* 忽略 */
        }
      }
      window.dshDiscoReply = function (kind) {
        try {
          watchReply(kind === 'question' ? 'question' : 'lyrics')
        } catch (err) {
          /* 忽略 */
        }
      }
      window.dshDiscoVersion = DISCO_VERSION
    } catch (err) {
      /* 忽略 */
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true })
    } else {
      boot()
    }

    // 角色被其它脚本移除时，下次演出会重新 mount
    try {
      window.setInterval(function () {
        if (!root || !root.parentNode) {
          if (document.body) {
            unmount()
            mount()
          }
        }
      }, 4000)
    } catch (err) {
      /* 忽略 */
    }
  } catch (err) {
    /* 插件整体失败时静默：不能影响 DSH 页面 */
  }
})()
