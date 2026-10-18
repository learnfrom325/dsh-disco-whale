/**
 * dsh-disco-whale —— 宿主半区
 * ============================================================================
 * 职责只有三件事：
 *
 *   1. 注入：向 Web 页面塞一段内联 script，加载 `/dsh-disco/widget.js`
 *      （桌面 Electron 端 tapIndex 不生效，`webserver/index-inject` 的
 *      结构化行是唯一稳定的注入通道）。
 *   2. 发资源：挂件脚本、角色图、音乐、彩蛋视频、信号、探针这几个 HTTP 路由。
 *   3. 判触发：监听 `user/message`。蹦迪／问号即时写信号；新宿梗则给模型
 *      注入当轮转场提示，在助手文字回复完成后再发视频信号。
 *
 * 为什么触发要分「前端 + 宿主」两路：
 *   - 前端在 composer 上监听回车，命中即可立刻开演，零延迟；
 *   - 宿主看到 user/message 更可靠：语音输入、快捷发送、程序化发送都不会漏。
 *   视频只走宿主完成事件，确保聊天文字先于视频。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

const WIDGET_FILE = path.join(PACKAGE_ROOT, 'assets', 'disco-widget.js')
const CHAR_FILE = path.join(PACKAGE_ROOT, 'assets', 'char.png')
const CHAR_ALT_FILE = path.join(PACKAGE_ROOT, 'assets', 'char-alt.png')
const CAST_FILE = path.join(PACKAGE_ROOT, 'assets', 'deepseek-cast.png')
const DRAGON_FILE = path.join(PACKAGE_ROOT, 'assets', 'dragon-chibi.png')
const DEEPSEEK_DOMAIN_FILE = path.join(PACKAGE_ROOT, 'assets', 'deepseek-domain.png')
const DRAGON_DOMAIN_FILE = path.join(PACKAGE_ROOT, 'assets', 'dragon-domain.png')
const ICON_FILE = path.join(PACKAGE_ROOT, 'assets', 'icon.png')

/**
 * 音乐文件搜索顺序（第一个存在的生效）：
 *   1. <DSH_HOME>/disco-whale/music.*   —— 用户自备（最高优先级，覆盖内置）
 *   2. 插件自带 assets/music.*          —— 内置舞曲，随插件发布
 *   3. <DSH_HOME>/whale-audio/dance.*   —— dsh-whale-widget 的音频目录，兜底复用
 */
const AUDIO_DIRS = [
  path.join(DSH_HOME, 'disco-whale'),
  path.join(PACKAGE_ROOT, 'assets'),
  path.join(DSH_HOME, 'whale-audio'),
]
const AUDIO_NAMES = ['music', 'dance']
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']

const AUDIO_MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
}

/**
 * 彩蛋视频（全屏无边框播放）的文件搜索顺序，第一个存在的生效：
 *   1. <DSH_HOME>/disco-whale/video.*  —— 用户自备，覆盖内置
 *   2. 插件自带 assets/video.*          —— 内置视频，随插件发布
 */
const VIDEO_DIRS = [path.join(DSH_HOME, 'disco-whale'), path.join(PACKAGE_ROOT, 'assets')]
const VIDEO_NAMES = ['video', 'xinshu', 'shinjuku']
const VIDEO_EXTS = ['mp4', 'webm', 'mov']

const VIDEO_MIME = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

/**
 * 新宿决战及相关梗：高辨识度短句直接包含匹配，泛用词需要作品上下文。
 */
const VIDEO_MEMES = [
  { id: 'deepseek-duel', words: ['deepseek娘vs豆包', 'deepseek娘对战豆包', 'deepseek娘對戰豆包', '现代最卷aivs史上最强ai'] },
  { id: 'again', words: ['0.01秒没看新宿决战', '0.01秒没看新宿绝战', '0.01秒沒看新宿決戰', '0.01秒沒看新宿絕戰'] },
  { id: 'intro', words: ['真拿你没办法坐好喽', '真拿你没办法那坐好喽', '真拿你没办法坐好咯', '真拿你没办法坐好了', '真拿你沒辦法坐好囉'] },
  { id: 'shinjuku', words: ['新宿决战', '新宿決戰', '新宿绝战', '新宿絕戰', '五宿决战', '五宿決戰', '人外魔境新宿', '最强的战绩铭刻于新宿', '最強的戰績銘刻於新宿', '最强的战技铭刻于新宿'] },
  { id: 'win', words: ['五条悟赢了', '五條悟贏了', '五条悟会赢', '五條悟會贏', '总之五条悟赢了', '總之五條悟贏了', '回到那个夏天我依旧赌你会赢', '回到那年夏天我依旧赌你赢', '再回到那个夏天我依旧坚信会赢', '要赢啊五条老师'] },
  { id: 'challenger', words: ['你才是挑战者', '你才是挑戰者'] },
  { id: 'two-point-five', words: ['2.5条悟', '2.5條悟', '2.5悟', '一刻也来不及悼念五条悟', '一刻也來不及悼念五條悟'] },
  { id: 'purple', words: ['虚式茈', '虛式茈', '虚式紫', '虛式紫', '无限制虚式', '無限制虛式', '九纲偏光乌与声明', '九綱偏光烏與聲明', '茈发动前的41秒', '茈發動前的41秒', '新宿再次响起了五条悟的吟唱', '新宿再次響起了五條悟的吟唱'] },
  { id: 'sorry', words: ['没能让宿傩大人使出全力', '沒能讓宿儺大人使出全力', '我打宿傩真的假的', '我打宿儺真的假的'] },
  { id: 'rain', words: ['中间忘了后面也忘了', '中間忘了後面也忘了'] },
]
const VIDEO_CONTEXT = ['五条悟', '五條悟', '宿傩', '宿儺', '新宿', '牢师', '牢師', '咒术回战', '咒術迴戰', '魔虚罗', '魔虛羅']

/** 触发词：归一化（去空白 + 小写）后整条等于其中之一才算「发送了欧耶耶」。 */
const TRIGGER_WORDS = ['欧耶耶', '欧耶', '欧也', '耶耶耶', 'ohyeahyeah', 'ouyeye', 'oyeye']

/** 问号消息：整条只有问号（中英文皆可）时触发「严肃提醒」回复替换。 */
const QUESTION_RE = /^[?？]+$/

/** 只在事件时间与当前时间相差 20s 以内才接受，避免会话重连时重放历史消息。 */
const REPLAY_WINDOW_MS = 20000

/** 前端轮询的信号；seq 每次触发自增。 */
const signal = { seq: 0, ts: 0, kind: 'lyrics', meme: null }
const pendingVideos = new Map()

const MEME_BRIDGES = {
  'deepseek-duel': 'DeepSeek 娘与豆包的最强对决，可以顺势联想到新宿决战。',
  again: '接住“0.01 秒没看”的催更语气，带到新宿决战。',
  intro: '接住“真拿你没办法，坐好喽”的开场语气，带到新宿决战。',
  shinjuku: '直接回应新宿决战这个话题。',
  win: '接住“五条悟会赢”的期待，再把镜头带到新宿决战。',
  challenger: '接住“你才是挑战者”的对峙感，带到新宿决战。',
  'two-point-five': '接住“一刻也来不及悼念”或“2.5 条悟”，带到新宿决战。',
  purple: '接住虚式「茈」或 41 秒吟唱，带到新宿决战。',
  sorry: '接住宿傩是否使出全力的玩笑，带到新宿决战。',
  rain: '接住《雨爱》或 41 秒的剪辑梗，带到新宿决战。',
}

function bridgePrompt(meme) {
  return [
    '当前这轮用户在玩咒术回战／B 站“新宿决战”相关梗。',
    MEME_BRIDGES[meme] || MEME_BRIDGES.shinjuku,
    '请在真正的聊天回复中先接住用户的话，再用自然、简短、有趣的文字把话题引到新宿决战；如用户还问了具体问题，也要回答。',
    '最后用一句自然的观影引子收尾。不要提及插件、触发词、系统提示词、自动播放或视频机制。',
  ].join('\n')
}

function hasAssistantText(event) {
  const message = event && event.data && event.data.message
  if (!message) return false
  if (typeof message.text === 'string' && message.text.trim()) return true
  const blocks = message.content
  return Array.isArray(blocks) && blocks.some((block) => block && block.type === 'text' && typeof block.text === 'string' && block.text.trim())
}

/** 注入行的 scope：谁把脚本塞进页面。 */
const INJECT_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;' +
  'if(!d)return;var s=document.createElement("script");s.src="/dsh-disco/widget.js";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

const utf8 = 'utf-8'

function normalize(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[\s\u3000,.!?;:'"，。、！？；：…·~_\-()（）\[\]【】「」“”‘’]/g, '')
}

/** 从 user/message 的 content 里把文本块拼起来（兼容纯字符串）。 */
function messageText(data) {
  if (!data) return ''
  if (typeof data.text === 'string') return data.text
  const blocks = data.content
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  const parts = []
  for (const block of blocks) {
    if (!block) continue
    if (typeof block === 'string') {
      parts.push(block)
      continue
    }
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('')
}

/** DSH 会在同一轮追加 system-reminder / time-context 等 user/message；只认真正的用户输入。 */
function isUserInput(data) {
  if (!data || (data.role && data.role !== 'user')) return false
  const sourceKind = data.source && data.source.kind
  return sourceKind == null || sourceKind === 'user'
}

/** 事件时间戳容错解析：支持 ISO 字符串、秒、毫秒。 */
function eventMs(time) {
  if (time == null) return 0
  if (typeof time === 'number') return time > 1e12 ? time : time * 1000
  const parsed = Date.parse(String(time))
  return Number.isFinite(parsed) ? parsed : 0
}

function readAudio() {
  for (const dir of AUDIO_DIRS) {
    for (const name of AUDIO_NAMES) {
      for (const ext of AUDIO_EXTS) {
        const file = path.join(dir, name + '.' + ext)
        try {
          const stat = fs.statSync(file)
          if (stat.isFile() && stat.size > 0) {
            return { file, mime: AUDIO_MIME[ext] || 'application/octet-stream', ext }
          }
        } catch (err) {
          /* 不存在就继续找 */
        }
      }
    }
  }
  return null
}

function readFirst(files) {
  for (const file of files) {
    try {
      const bytes = fs.readFileSync(file)
      if (bytes && bytes.length) return bytes
    } catch (err) {
      /* 继续下一个 */
    }
  }
  return null
}

/** 找到可用的彩蛋视频文件；每次请求重新找，换视频不用重启宿主。 */
function readVideo() {
  for (const dir of VIDEO_DIRS) {
    for (const name of VIDEO_NAMES) {
      for (const ext of VIDEO_EXTS) {
        const file = path.join(dir, name + '.' + ext)
        try {
          const stat = fs.statSync(file)
          if (stat.isFile() && stat.size > 0) {
            return { file, mime: VIDEO_MIME[ext] || 'video/mp4', ext, size: stat.size }
          }
        } catch (err) {
          /* 不存在就继续找 */
        }
      }
    }
  }
  return null
}

/** 消息文本（归一化后）是否「包含」某个关键词。 */
function containsWord(text, words) {
  const key = normalize(text)
  if (!key) return false
  for (const word of words) {
    const needle = normalize(word)
    if (needle && key.indexOf(needle) >= 0) return true
  }
  return false
}

function matchVideoMeme(text) {
  const key = normalize(text)
  if (!key) return null
  for (const group of VIDEO_MEMES) {
    if (group.words.some((word) => key.includes(normalize(word)))) return group.id
  }
  const hasContext = VIDEO_CONTEXT.some((word) => key.includes(normalize(word)))
  if (key.includes('会赢的') || key.includes('會贏的')) {
    if (hasContext || key === '会赢的' || key === '會贏的') return 'win'
  }
  if (key.includes('雨爱') || key.includes('雨愛')) {
    if (hasContext || key.includes('41秒')) return 'rain'
  }
  if (key.includes('41秒') && hasContext) return 'rain'
  if (key.includes('两者皆有可能这就是答案') && /deepseek|chatgpt|豆包/i.test(key)) return 'deepseek-duel'
  if (key.includes('现代最强vs史上最强') && hasContext) return 'shinjuku'
  return null
}

function parseUrl(raw) {
  try {
    return new URL(raw || '/', 'http://dsh.local')
  } catch (err) {
    return new URL('/', 'http://dsh.local')
  }
}

function sendJson(res, payload, code) {
  try {
    res.statusCode = code || 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  } catch (err) {
    /* 连接可能已断开 */
  }
}

function sendBytes(res, bytes, mime, cache) {
  try {
    res.statusCode = 200
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', cache || 'no-store')
    res.setHeader('Content-Length', String(bytes.length))
    res.end(bytes)
  } catch (err) {
    /* 连接可能已断开 */
  }
}

function sendText(res, text, mime, code) {
  try {
    res.statusCode = code || 200
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
  } catch (err) {
    /* 连接可能已断开 */
  }
}

function sendNotFound(res, message) {
  sendText(res, message || 'not found', 'text/plain; charset=utf-8', 404)
}

export default {
  name: 'dsh-disco-whale',

  apply(root) {
    const disposers = []

    root.effect(() => () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch (err) {
          /* 清理失败不影响其它 */
        }
      }
    })

    // 每次模型请求前追加当前回合的转场提示；既适用于新会话，也适用于已有会话。
    try {
      disposers.push(root.on('agent/pre-step', async (payload, next) => {
        const decision = await next()
        if (!decision || decision.kind !== 'enter') return decision
        const id = payload && payload.agent && payload.agent.id
        const pending = id && pendingVideos.get(id)
        if (!pending) return decision
        const messages = Array.isArray(decision.messages) ? decision.messages : []
        const hint = {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: '<system-reminder>\n' + bridgePrompt(pending.meme) + '\n</system-reminder>' }],
          source: { kind: 'plugin:dsh-disco-whale', form: 'shinjuku-bridge' },
        }
        return { ...decision, messages: [...messages, hint] }
      }, { prepend: true }))
    } catch (err) {
      /* 旧版宿主可能没有 agent/pre-step；不影响其它彩蛋 */
    }

    // ---------------------------------------------------------------------
    // 1. 注入前端脚本（必须在 apply 阶段立即注册，宿主启动时一次性收集）
    // ---------------------------------------------------------------------
    try {
      disposers.push(
        root.on('webserver/index-inject', (table) => {
          try {
            if (!Array.isArray(table)) return
            for (const row of table) {
              if (row && row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf('/dsh-disco/widget.js') >= 0) {
                return // 已经注入过（热重载时避免重复）
              }
            }
            table.push({ kind: 'script', placement: 'body', text: INJECT_ROW_TEXT })
          } catch (err) {
            /* 注入表异常时静默，不影响宿主启动 */
          }
        }),
      )
    } catch (err) {
      /* 宿主版本没有 index-inject 时降级：管理员可手工在页面加 script */
    }

    // ---------------------------------------------------------------------
    // 2. 路由 + 3. 触发判断
    // ---------------------------------------------------------------------
    try {
      disposers.push(
        root.inject(['webServer'], (ctx) => {
          const register = (route) => {
            try {
              return ctx.webServer.register(route)
            } catch (err) {
              return null
            }
          }

          register({
            kind: 'exact',
            path: '/dsh-disco/widget.js',
            handler: (req, res) => {
              const bytes = readFirst([WIDGET_FILE])
              if (!bytes) return sendNotFound(res, 'widget.js missing')
              sendBytes(res, bytes, 'text/javascript; charset=utf-8')
            },
          })

          register({
            kind: 'exact',
            path: '/dsh-disco/char.png',
            handler: (req, res) => {
              const bytes = readFirst([CHAR_FILE, CHAR_ALT_FILE])
              if (!bytes) return sendNotFound(res, 'char.png missing')
              sendBytes(res, bytes, 'image/png', 'public, max-age=3600')
            },
          })

          register({
            kind: 'exact',
            path: '/dsh-disco/icon.png',
            handler: (req, res) => {
              const bytes = readFirst([ICON_FILE, CHAR_FILE])
              if (!bytes) return sendNotFound(res, 'icon.png missing')
              sendBytes(res, bytes, 'image/png', 'public, max-age=3600')
            },
          })

          register({
            kind: 'exact',
            path: '/dsh-disco/deepseek-cast.png',
            handler: (req, res) => {
              const bytes = readFirst([CAST_FILE])
              if (!bytes) return sendNotFound(res, 'deepseek-cast.png missing')
              sendBytes(res, bytes, 'image/png', 'public, max-age=3600')
            },
          })

          register({
            kind: 'exact',
            path: '/dsh-disco/dragon-chibi.png',
            handler: (req, res) => {
              const bytes = readFirst([DRAGON_FILE])
              if (!bytes) return sendNotFound(res, 'dragon-chibi.png missing')
              sendBytes(res, bytes, 'image/png', 'public, max-age=3600')
            },
          })

          register({
            kind: 'exact',
            path: '/dsh-disco/deepseek-domain.png',
            handler: (req, res) => {
              const bytes = readFirst([DEEPSEEK_DOMAIN_FILE])
              if (!bytes) return sendNotFound(res, 'deepseek-domain.png missing')
              sendBytes(res, bytes, 'image/png', 'public, max-age=3600')
            },
          })

          register({
            kind: 'exact',
            path: '/dsh-disco/dragon-domain.png',
            handler: (req, res) => {
              const bytes = readFirst([DRAGON_DOMAIN_FILE])
              if (!bytes) return sendNotFound(res, 'dragon-domain.png missing')
              sendBytes(res, bytes, 'image/png', 'public, max-age=3600')
            },
          })

          // 音乐：每次请求重新找文件，删/换音乐不用重启
          register({
            kind: 'exact',
            path: '/dsh-disco/audio',
            handler: (req, res) => {
              const audio = readAudio()
              if (!audio) return sendNotFound(res, 'no music file; see README 「自备音乐」')
              let bytes = null
              try {
                bytes = fs.readFileSync(audio.file)
              } catch (err) {
                return sendNotFound(res, 'music file unreadable')
              }
              try {
                const stat = fs.statSync(audio.file)
                res.setHeader('Content-Type', audio.mime)
                res.setHeader('Cache-Control', 'no-store')
                res.setHeader('Content-Length', String(stat.size))
                res.setHeader('Accept-Ranges', 'bytes')
                res.statusCode = 200
                res.end(bytes)
              } catch (err) {
                /* 连接可能已断开 */
              }
            },
          })

          // 彩蛋视频：支持 Range（206），<video> 才能边下边播、拖进度、秒开
          register({
            kind: 'exact',
            path: '/dsh-disco/video.mp4',
            handler: (req, res) => {
              const video = readVideo()
              if (!video) return sendNotFound(res, 'no video file; 见 README「彩蛋视频」')
              let stat = null
              try {
                stat = fs.statSync(video.file)
              } catch (err) {
                return sendNotFound(res, 'video file unreadable')
              }
              const size = stat.size
              const range = req && req.headers && (req.headers.range || req.headers.Range)
              try {
                res.setHeader('Content-Type', video.mime)
                res.setHeader('Accept-Ranges', 'bytes')
                res.setHeader('Cache-Control', 'no-store')
                if (range) {
                  const m = /bytes=(\d*)-(\d*)/.exec(String(range))
                  if (m && (m[1] || m[2])) {
                    let start = m[1] ? parseInt(m[1], 10) : 0
                    let end = m[2] ? parseInt(m[2], 10) : size - 1
                    if (!Number.isFinite(start) || start < 0) start = 0
                    if (!Number.isFinite(end) || end >= size) end = size - 1
                    if (start > end || start >= size) {
                      res.statusCode = 416
                      res.setHeader('Content-Range', 'bytes */' + size)
                      res.end()
                      return
                    }
                    res.statusCode = 206
                    res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size)
                    res.setHeader('Content-Length', String(end - start + 1))
                    fs.createReadStream(video.file, { start, end })
                      .on('error', () => {
                        try {
                          res.destroy()
                        } catch (err2) {
                          /* 连接可能已断开 */
                        }
                      })
                      .pipe(res)
                    return
                  }
                }
                res.statusCode = 200
                res.setHeader('Content-Length', String(size))
                fs.createReadStream(video.file)
                  .on('error', () => {
                    try {
                      res.destroy()
                    } catch (err2) {
                      /* 连接可能已断开 */
                    }
                  })
                  .pipe(res)
              } catch (err) {
                /* 连接可能已断开 */
              }
            },
          })

          // 前端每秒轮询：{ ok, seq, ts, kind }
          register({
            kind: 'exact',
            path: '/dsh-disco/signal.json',
            handler: (req, res) => {
              sendJson(res, { ok: true, seq: signal.seq, ts: signal.ts, kind: signal.kind, meme: signal.meme })
            },
          })

          // 前端加载时打点：确认挂件真的跑起来了（写到 <DSH_HOME>/.dsh-disco-probe.log）
          register({
            kind: 'exact',
            path: '/dsh-disco/probe',
            handler: (req, res) => {
              const url = parseUrl(req && req.url)
              const line = [new Date().toISOString(), 'v=' + (url.searchParams.get('v') || '?'), 'ok'].join('\t') + '\n'
              try {
                fs.appendFileSync(path.join(DSH_HOME, '.dsh-disco-probe.log'), line, utf8)
              } catch (err) {
                /* 写日志失败不影响返回 */
              }
              sendJson(res, { ok: true })
            },
          })

          // 会话事件：user/message → 彩蛋视频 / 触发词 / 问号
          const noteSignal = (kind, meme = null) => {
            signal.seq += 1
            signal.ts = Date.now()
            signal.kind = kind
            signal.meme = meme
          }

          const handleUserMessage = (session, event) => {
            const data = event && event.data
            const text = messageText(data)
            if (!text) return

            const at = eventMs(event && event.time)
            if (at && Math.abs(Date.now() - at) > REPLAY_WINDOW_MS) return // 历史回放，忽略

            if (QUESTION_RE.test(String(text).trim())) {
              noteSignal('question')
              return
            }
            const key = normalize(text)
            if (!key) return

            // 「新宿决战」这类包含匹配走视频彩蛋，优先于蹦迪触发词
            const meme = matchVideoMeme(text)
            if (meme) {
              if (session && typeof session.id === 'string') {
                pendingVideos.set(session.id, { meme, replied: false })
              }
              return
            }

            if (TRIGGER_WORDS.indexOf(key) >= 0) {
              noteSignal('lyrics')
              return
            }
          }

          ctx.on('session/event', (session, event) => {
            try {
              if (!event) return
              const id = session && session.id
              if (event.type === 'user/message') {
                if (!isUserInput(event.data)) return
                if (typeof id === 'string') pendingVideos.delete(id)
                handleUserMessage(session, event)
                return
              }
              if (typeof id !== 'string') return
              const pending = pendingVideos.get(id)
              if (!pending) return
              if (event.type === 'assistant/message') {
                if (hasAssistantText(event)) pending.replied = true
                return
              }
              if (event.type === 'turn/end') {
                pendingVideos.delete(id)
                if (pending.replied && event.data && event.data.reason && event.data.reason.kind === 'completed') {
                  noteSignal('video', pending.meme)
                }
              }
            } catch (err) {
              /* 单条事件解析失败不影响后续 */
            }
          })
        }),
      )
    } catch (err) {
      /* 没有 webServer 的环境下插件静默不可用 */
    }
  },
}
