// dsh-disco-whale 冒烟测试：用最小 DOM / Audio / fetch stub 在 Node 里跑一遍前端挂件。
// 运行：node tests/smoke.js
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const code = fs.readFileSync(path.join(__dirname, '..', 'assets', 'disco-widget.js'), 'utf8')

// ---------------------------------------------------------------------------
// 最小 DOM stub
// ---------------------------------------------------------------------------

function makeStyle() {
  return {
    _v: {},
    setProperty(k, v) {
      this._v[k] = v
    },
    removeProperty(k) {
      delete this._v[k]
    },
  }
}

function makeClassList(owner) {
  const read = () => String(owner.className || '').split(/\s+/).filter(Boolean)
  return {
    add(c) {
      const list = read()
      if (list.indexOf(c) < 0) list.push(c)
      owner.className = list.join(' ')
    },
    remove(c) {
      owner.className = read()
        .filter((x) => x !== c)
        .join(' ')
    },
    contains(c) {
      return read().indexOf(c) >= 0
    },
  }
}

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    style: makeStyle(),
    textContent: '',
    children: [],
    parentNode: null,
    attrs: {},
    src: '',
    alt: '',
    draggable: false,
    _listeners: {},
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      return child
    },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parentNode = null
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v)
      if (k === 'class') this.className = String(v)
    },
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null
    },
    removeAttribute(k) {
      delete this.attrs[k]
    },
    play() {
      return Promise.resolve()
    },
    pause() {},
    load() {},
    addEventListener(type, fn) {
      ;(this._listeners[type] = this._listeners[type] || []).push(fn)
    },
    closest() {
      return null
    },
    querySelector(sel) {
      if (String(sel).startsWith('.')) return this.children.find((c) => c.className === String(sel).slice(1)) || null
      return this.children.find((c) => c.tagName.toLowerCase() === String(sel).toLowerCase()) || null
    },
    querySelectorAll() {
      return []
    },
  }
  el.classList = makeClassList(el)
  Object.defineProperty(el, 'firstElementChild', {
    get() {
      return this.children[0] || null
    },
  })
  Object.defineProperty(el, 'firstChild', {
    get() {
      return this.children[0] || null
    },
  })
  return el
}

const doc = {
  readyState: 'complete',
  listeners: {},
  _qs: () => null,
  _qsa: () => [],
  addEventListener(type, fn) {
    ;(this.listeners[type] = this.listeners[type] || []).push(fn)
  },
  querySelector(sel) {
    return this._qs(sel)
  },
  querySelectorAll(sel) {
    return this._qsa(sel)
  },
  createElement(tag) {
    return makeEl(tag)
  },
  documentElement: makeEl('html'),
  body: makeEl('body'),
  head: makeEl('head'),
  activeElement: null,
}

// ---------------------------------------------------------------------------
// AudioContext stub
// ---------------------------------------------------------------------------

function makeParam() {
  return {
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  }
}

function makeNode() {
  return {
    connect() {},
    start() {},
    stop() {},
    frequency: makeParam(),
    gain: makeParam(),
    type: '',
    buffer: null,
    onended: null,
    loop: false,
  }
}

function makeAudioContext() {
  return {
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume() {},
    createGain: makeNode,
    createOscillator: makeNode,
    createBiquadFilter: makeNode,
    createBufferSource: makeNode,
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) }
    },
    decodeAudioData() {
      return Promise.reject(new Error('stub: no real audio'))
    },
  }
}

// ---------------------------------------------------------------------------
// fetch stub：信号 0，探针 ok，音乐 404（走合成兜底）
// ---------------------------------------------------------------------------

const fetched = []
function fetchStub(url) {
  fetched.push(String(url))
  const target = String(url)
  if (target.indexOf('/dsh-disco/signal.json') >= 0) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, seq: 0, ts: 0, kind: 'lyrics' }) })
  }
  if (target.indexOf('/dsh-disco/probe') >= 0) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
  }
  return Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.reject(new Error('404')) })
}

// ---------------------------------------------------------------------------
// 装配上下文
// ---------------------------------------------------------------------------

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Math,
  Date,
  String,
  Number,
  Array,
  Object,
  JSON,
  Promise,
  RegExp,
  Float32Array,
  Error,
  document: doc,
  localStorage: { getItem: () => null, setItem() {} },
  fetch: fetchStub,
  AudioContext: makeAudioContext,
  webkitAudioContext: undefined,
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(code, sandbox)

const run = (s) => vm.runInContext(s, sandbox)
let fails = 0
const ok = (name, cond) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name)
  if (!cond) fails++
}

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------

console.log('loaded ok')
ok('标志位已设', run('window.__dshDiscoWhale') === true)
ok('版本号存在', typeof run('window.dshDiscoVersion') === 'string')
ok('角色已挂载', !!run('window.dshDiscoTest') && !!doc.body.children.find((c) => c.className === 'dshdw-root'))
const rootIdle = doc.body.children.find((c) => c.className === 'dshdw-root')
ok('平时隐身：默认无 active 类', !!rootIdle && !rootIdle.classList.contains('dshdw-active'))
ok('CSS 已注入', !!doc.head.children.find((c) => c.attrs && c.attrs['data-dsh-disco-css'] === '1'))
ok('角色图指向路由', (() => {
  const root = doc.body.children.find((c) => c.className === 'dshdw-root')
  const bodyEl = root && root.children.find((c) => c.className === 'dshdw-body')
  const img = bodyEl && bodyEl.children.find((c) => c.className === 'dshdw-img')
  return !!img && img.src === '/dsh-disco/char.png'
})())
ok('探针已请求', fetched.some((u) => u.indexOf('/dsh-disco/probe') >= 0))

// —— 触发：dshDiscoTest() ——
run('window.dshDiscoTest()')
const rootEl = doc.body.children.find((c) => c.className.indexOf('dshdw-root') >= 0)
ok('开始后带 dancing 类', !!rootEl && rootEl.classList.contains('dshdw-dancing'))
ok('开始后显示：带 active 类', !!rootEl && rootEl.classList.contains('dshdw-active'))
const fx = doc.body.children.find((c) => c.className === 'dshdw-fx')
ok('光效层已创建', !!fx)
ok('光效 9 层', !!fx && fx.children.length === 9)
ok('5 束激光', !!fx && fx.children[2] && fx.children[2].children.length === 5)
ok('节拍变量写入', !!doc.documentElement.style._v['--dshdw-beat'])
const bodyEl = rootEl && rootEl.children.find((c) => c.className === 'dshdw-body')
ok('音响已挂上', !!bodyEl && !!bodyEl.children.find((c) => c.className === 'dshdw-speaker'))

// 气泡文字
run('window.dshDiscoSay("昨日一去不复回 哦也", 5000)')
const pop = rootEl.children.find((c) => c.className.indexOf('dshdw-pop') >= 0)
ok('气泡已打开', !!pop && pop.classList.contains('is-open'))
ok('气泡文字正确', !!pop && pop.children[0] && pop.children[0].textContent === '昨日一去不复回 哦也')

// —— 停止 ——
run('window.dshDiscoStop()')
ok('停止后移除 dancing', !!rootEl && !rootEl.classList.contains('dshdw-dancing'))
ok('停止后隐身：移除 active 类', !!rootEl && !rootEl.classList.contains('dshdw-active'))
ok('停止后清理光效', !doc.body.children.find((c) => c.className === 'dshdw-fx'))
ok('停止后移除音响', !!bodyEl && !bodyEl.children.find((c) => c.className === 'dshdw-speaker'))

// —— 聊天区回复替换 ——
const styleEl = makeEl('style')
styleEl.attrs['data-plugin-css'] = 'x/AssistantMarkdown.module.css'
styleEl.textContent = '.v5IAXa_root{color:red}.v5IAXa_body{margin:0}'
const oldBody = makeEl('div')
oldBody.className = 'v5IAXa_body'
oldBody.textContent = 'old reply'
const rootA = makeEl('div')
rootA.className = 'v5IAXa_root'
rootA.appendChild(oldBody)
let roots = [rootA]
doc._qsa = (sel) => {
  if (sel === 'style[data-plugin-css]') return [styleEl]
  if (sel === '[class*="_root"]') return roots
  if (sel === '.v5IAXa_root') return roots
  return []
}
run('window.dshDiscoReply("lyrics")')
const newBody = makeEl('div')
newBody.textContent = 'new reply'
const rootB = makeEl('div')
rootB.className = 'v5IAXa_root'
rootB.appendChild(newBody)
roots = [rootA, rootB]
// 400ms 的 tickReply 会在下面的 setTimeout 之前跑到
setTimeout(() => {
  const box = rootB.children.find((c) => c.attrs && c.attrs['data-dshdw-lines-box'] === '1')
  ok('回复已替换（root 标记）', rootB.attrs['data-dshdw-lines'] === '1')
  ok('旧正文只隐藏不删除', newBody.style.display === 'none' && newBody.parentNode === rootB)
  ok('回复写入 16 行歌词', !!box && box.children.length === 16)
  ok('旧回复未被误动', !rootA.attrs['data-dshdw-lines'])

  // —— 视频彩蛋：控制台入口 ——
  run('window.dshDiscoVideo()')
  const videoBox = doc.body.children.find((c) => c.className === 'dshdw-video')
  const videoEl = videoBox && videoBox.children.find((c) => c.tagName === 'VIDEO')
  ok('视频层已创建', !!videoBox)
  ok('video 指向视频路由', !!videoEl && videoEl.src === '/dsh-disco/video.mp4')
  ok('全屏播放时 body 标记', doc.body.classList.contains('dshdw-video-on'))
  ok('video 带 autoplay', !!videoEl && videoEl.autoplay === true)
  videoEl.currentTime = 28.1
  videoEl._listeners.timeupdate.forEach((fn) => fn())
  let cast = videoBox.children.find((c) => c.className === 'dshdw-cast')
  ok('28 秒右下角施法', !!cast && cast.children.some((c) => c.src === '/dsh-disco/deepseek-cast.png'))
  let target = videoBox.children.find((c) => c.className === 'dshdw-target')
  ok('28 秒 Q 版龙娘受击', !!target && target.children.some((c) => c.src === '/dsh-disco/dragon-chibi.png') && target.children.some((c) => c.className === 'dshdw-target-burst'))
  videoEl.currentTime = 41.1
  videoEl._listeners.timeupdate.forEach((fn) => fn())
  const domains = videoBox.children.find((c) => c.className === 'dshdw-domains')
  const left = domains && domains.children.find((c) => c.className === 'dshdw-domain left')
  const right = domains && domains.children.find((c) => c.className === 'dshdw-domain right')
  ok('41 秒双方领域展开', !!left && !!right && domains.children.some((c) => c.className === 'dshdw-domain-clash'))
  ok('双方领域显示各自结印姿势', !!left && left.children.some((c) => c.src === '/dsh-disco/dragon-domain.png') && !!right && right.children.some((c) => c.src === '/dsh-disco/deepseek-domain.png'))
  videoEl.currentTime = 88.1
  videoEl._listeners.timeupdate.forEach((fn) => fn())
  cast = videoBox.children.filter((c) => c.className === 'dshdw-cast')
  target = videoBox.children.filter((c) => c.className === 'dshdw-target')
  ok('88 秒再次施法且不叠层', cast.length === 1)
  ok('88 秒再次受击且不叠层', target.length === 1)
  run('window.dshDiscoVideoClose()')
  ok('关闭后移除视频层', !doc.body.children.find((c) => c.className === 'dshdw-video'))
  ok('关闭后移除 body 标记', !doc.body.classList.contains('dshdw-video-on'))

  // —— 视频彩蛋：composer 回车含「新宿决战」 ——
  const enterEvent = {
    key: 'Enter',
    isComposing: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { value: '今晚新宿决战该上了' },
    preventDefault() {},
    stopPropagation() {},
  }
  doc.listeners['keydown'].forEach((fn) => fn(enterEvent))
  ok('回车发送含「新宿决战」时等待模型回复', !doc.body.children.find((c) => c.className === 'dshdw-video'))
  const replyBody = makeEl('div')
  replyBody.className = 'v5IAXa_body'
  replyBody.textContent = '原本的回答仍然在这里'
  const replyRoot = makeEl('div')
  replyRoot.className = 'v5IAXa_root'
  replyRoot.appendChild(replyBody)
  roots = [rootA, rootB, replyRoot]

  enterEvent.target.value = '真拿你没办法，那坐好喽'
  doc.listeners['keydown'].forEach((fn) => fn(enterEvent))
  ok('B站开场梗发送后仍等待模型回复', !doc.body.children.find((c) => c.className === 'dshdw-video'))

  setTimeout(() => {
    const meme = replyRoot.children.find((c) => c.className === 'dshdw-meme')
    ok('不在 DOM 里伪造梗回复', !meme)
    console.log(fails ? 'FAILED ' + fails : 'ALL PASS')
    process.exit(fails ? 1 : 0)
  }, 500)
}, 700)
