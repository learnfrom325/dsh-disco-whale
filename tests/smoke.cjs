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
    addEventListener(type, fn) {
      ;(this._listeners[type] = this._listeners[type] || []).push(fn)
    },
    closest() {
      return null
    },
    querySelector() {
      return null
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

  console.log(fails ? 'FAILED ' + fails : 'ALL PASS')
  process.exit(fails ? 1 : 0)
}, 700)
