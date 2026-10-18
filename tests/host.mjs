// dsh-disco-whale 宿主冒烟测试：stub 最小 cordis ctx，验证注入、路由、触发信号与视频 Range。
// 运行：node tests/host.mjs
import { Writable } from 'node:stream'
import plugin from '../lib/index.js'

const routes = new Map()
const handlers = {}
const ctx = {
  effect(fn) {
    return fn()
  },
  webServer: {
    register(route) {
      routes.set(route.path, route)
      return () => {}
    },
  },
  on(name, fn) {
    ;(handlers[name] = handlers[name] || []).push(fn)
    return () => {}
  },
}

const root = {
  effect(fn) {
    try {
      fn()
    } catch (err) {
      /* 清理注册失败不影响测试 */
    }
    return () => {}
  },
  on(name, fn) {
    ;(handlers[name] = handlers[name] || []).push(fn)
    return () => {}
  },
  inject(services, cb) {
    cb(ctx)
    return () => {}
  },
}

plugin.apply(root)

let fails = 0
const ok = (name, cond) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name)
  if (!cond) fails++
}

// —— 1. 注入 ——
const table = []
for (const fn of handlers['webserver/index-inject'] || []) fn(table)
ok('注入表已追加 script 行', table.length === 1 && table[0].kind === 'script')
ok('注入脚本指向 widget.js', !!table[0] && table[0].text.indexOf('/dsh-disco/widget.js') >= 0)
for (const fn of handlers['webserver/index-inject'] || []) fn(table)
ok('重复注入不叠加', table.length === 1)

// —— 2. 路由 ——
for (const p of [
  '/dsh-disco/widget.js',
  '/dsh-disco/char.png',
  '/dsh-disco/icon.png',
  '/dsh-disco/deepseek-cast.png',
  '/dsh-disco/dragon-chibi.png',
  '/dsh-disco/deepseek-domain.png',
  '/dsh-disco/dragon-domain.png',
  '/dsh-disco/audio',
  '/dsh-disco/video.mp4',
  '/dsh-disco/signal.json',
  '/dsh-disco/probe',
]) {
  ok('路由已注册 ' + p, routes.has(p))
}
let dragonBytes = null
routes.get('/dsh-disco/dragon-chibi.png').handler({}, {
  setHeader() {},
  end(bytes) { dragonBytes = bytes },
})
ok('Q 版龙娘素材由宿主作为 PNG 发出', Buffer.isBuffer(dragonBytes) && dragonBytes.length > 10000 && dragonBytes.subarray(1, 4).toString('ascii') === 'PNG')
for (const name of ['deepseek-domain', 'dragon-domain']) {
  let bytes = null
  routes.get('/dsh-disco/' + name + '.png').handler({}, {
    setHeader() {},
    end(data) { bytes = data },
  })
  ok('结印素材可读取 ' + name, Buffer.isBuffer(bytes) && bytes[25] === 6)
}

// —— 3. 触发信号 ——
function fire(data, time) {
  for (const fn of handlers['session/event'] || []) {
    fn({ id: 'test-session' }, { type: 'user/message', time: time == null ? Date.now() : time, data })
  }
}
function completeReply() {
  for (const fn of handlers['session/event'] || []) {
    fn({ id: 'test-session' }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '那就看看新宿决战吧。' }] } } })
    fn({ id: 'test-session' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  }
}
async function preStep() {
  const hook = (handlers['agent/pre-step'] || [])[0]
  return hook ? hook({ agent: { id: 'test-session' } }, async () => ({ kind: 'enter', messages: [] })) : null
}
function signal() {
  let out = null
  routes.get('/dsh-disco/signal.json').handler(
    { url: '/dsh-disco/signal.json' },
    {
      setHeader() {},
      end(text) {
        out = JSON.parse(text)
      },
    },
  )
  return out
}

const beforeVideo = signal().seq
fire({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '新宿决战！宿傩来了' }] })
fire({ role: 'user', source: { kind: 'system-reminder' }, text: '会话工作区提示' })
fire({ role: 'user', source: { kind: 'time-context' }, text: '当前时间快照' })
ok('用户消息命中后不立即播放视频', signal().seq === beforeVideo)
const bridgeDecision = await preStep()
const bridgeText = bridgeDecision?.messages?.[0]?.content?.[0]?.text || ''
ok('内部 user/message 不清除转场提示', bridgeText.includes('真正的聊天回复') && bridgeText.includes('新宿决战'))
ok('转场提示在模型请求前作为消息注入', bridgeDecision?.messages?.[0]?.source?.kind === 'plugin:dsh-disco-whale')
completeReply()
ok('模型回复完成才发视频信号', signal().kind === 'video' && signal().seq === beforeVideo + 1)
ok('视频信号带梗类型', signal().meme === 'shinjuku')
const afterVideo = signal().seq
fire({ role: 'user', source: { kind: 'system-reminder' }, text: '新宿决战' })
ok('内部提示中的关键词不会误触发', signal().seq === afterVideo && (await preStep())?.messages?.length === 0)
fire({ role: 'user', source: { kind: 'user' }, text: '在茈发动前的41秒' })
fire({ role: 'user', source: { kind: 'time-context' }, text: '下一轮时间快照' })
ok('已有会话的下一轮仍注入对应转场', (await preStep())?.messages?.[0]?.content?.[0]?.text.includes('41 秒吟唱'))
completeReply()
ok('已有会话下一轮完成后播放', signal().seq === afterVideo + 1 && signal().meme === 'purple')
const quietSeq = signal().seq
fire({ text: '虚式「茈」' })
for (const fn of handlers['session/event'] || []) {
  fn({ id: 'test-session' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
}
ok('没有模型文字时不播视频', signal().seq === quietSeq)
fire({ text: '虚式「茈」' })
for (const fn of handlers['session/event'] || []) {
  fn({ id: 'test-session' }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '接上新宿决战。' }] } } })
  fn({ id: 'test-session' }, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
}
ok('中断的回复不播视频', signal().seq === quietSeq)
for (const [input, meme] of [
  ['五条悟赢了', 'win'],
  ['你才是挑战者', 'challenger'],
  ['2.5条悟', 'two-point-five'],
  ['虚式「茈」', 'purple'],
  ['没能让宿傩大人使出全力', 'sorry'],
  ['雨爱，五条悟的 41 秒', 'rain'],
  ['真拿你没办法，那坐好喽', 'intro'],
  ['茈发动前的41秒内', 'purple'],
  ['回到那个夏天，我依旧赌你会赢', 'win'],
  ['我已经0.01秒没看新宿绝战了', 'again'],
  ['DeepSeek娘VS豆包', 'deepseek-duel'],
  ['DeepSeek 与 ChatGPT：两者皆有可能，这就是答案', 'deepseek-duel'],
]) {
  fire({ text: input })
  completeReply()
  ok('触发梗 ' + input, signal().kind === 'video' && signal().meme === meme)
}
const seqNoVideo = signal().seq
fire({ text: '推荐几首雨爱风格的歌' })
fire({ text: '五条悟是谁？' })
fire({ text: '我会赢的比赛' })
fire({ text: '真拿你没办法' })
fire({ text: '已经0.01秒没看比赛了' })
fire({ text: '两者皆有可能，这就是答案' })
ok('泛用短词不误触发', signal().seq === seqNoVideo)
fire({ content: '欧耶耶' })
ok('「欧耶耶」→ kind=lyrics', signal().kind === 'lyrics')
fire({ content: [{ type: 'text', text: '？' }] })
ok('「？」→ kind=question', signal().kind === 'question')
fire({ text: '随便聊聊' })
ok('普通消息不触发', signal().kind === 'question')
const seqBefore = signal().seq
fire({ content: '新宿决战' }, Date.now() - 60000)
ok('20s 前的历史消息被忽略', signal().seq === seqBefore)

// —— 4. 视频路由：完整请求 + Range ——
function request(headers) {
  return new Promise((resolve) => {
    const chunks = []
    const res = new Writable({
      write(chunk, enc, cb) {
        chunks.push(Buffer.from(chunk))
        cb()
      },
    })
    res.statusCode = 200
    res.headers = {}
    res.setHeader = (k, v) => {
      res.headers[k.toLowerCase()] = String(v)
    }
    res.on('finish', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    try {
      routes.get('/dsh-disco/video.mp4').handler({ url: '/dsh-disco/video.mp4', headers }, res)
    } catch (err) {
      resolve({ status: -1, error: err })
    }
  })
}

const full = await request({})
ok('视频无 Range → 200', full.status === 200)
ok('Content-Type 为 video/mp4', full.headers['content-type'] === 'video/mp4')
ok('Accept-Ranges 已声明', full.headers['accept-ranges'] === 'bytes')
ok(
  'Content-Length 与实体一致且是真实视频',
  Number(full.headers['content-length']) === full.body.length && full.body.length > 1024 * 1024,
)

const part = await request({ range: 'bytes=0-1023' })
ok('视频 Range → 206', part.status === 206)
ok('Content-Range 正确', part.headers['content-range'] === 'bytes 0-1023/' + full.body.length)
ok('Range 片段 1024 字节', part.body.length === 1024)

const bad = await request({ range: 'bytes=999999999-' })
ok('越界 Range → 416', bad.status === 416)

console.log(fails ? 'FAILED ' + fails : 'ALL PASS')
process.exit(fails ? 1 : 0)
