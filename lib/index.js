/**
 * dsh-disco-whale —— 宿主半区
 * ============================================================================
 * 职责只有三件事：
 *
 *   1. 注入：向 Web 页面塞一段内联 script，加载 `/dsh-disco/widget.js`
 *      （桌面 Electron 端 tapIndex 不生效，`webserver/index-inject` 的
 *      结构化行是唯一稳定的注入通道）。
 *   2. 发资源：挂件脚本、角色图、音乐、信号、探针这几个 HTTP 路由。
 *   3. 判触发：监听会话里的 `user/message`，用户发出「欧耶耶」（或「？」）时
 *      把一次触发写进内存信号，前端每秒轮询后开始蹦迪。
 *
 * 为什么触发要分「前端 + 宿主」两路：
 *   - 前端在 composer 上监听回车，命中即可立刻开演，零延迟；
 *   - 宿主看到 user/message 更可靠：语音输入、快捷发送、程序化发送都不会漏。
 *   两路写的是同一个自增 seq，前端按 seq 去重，重复触发不会叠两轮。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

const WIDGET_FILE = path.join(PACKAGE_ROOT, 'assets', 'disco-widget.js')
const CHAR_FILE = path.join(PACKAGE_ROOT, 'assets', 'char.png')
const CHAR_ALT_FILE = path.join(PACKAGE_ROOT, 'assets', 'char-alt.png')
const ICON_FILE = path.join(PACKAGE_ROOT, 'assets', 'icon.png')

/**
 * 音乐文件搜索顺序（第一个存在的生效）：
 *   1. <DSH_HOME>/disco-whale/music.*   —— 本插件推荐位置
 *   2. <DSH_HOME>/disco-whale/dance.*   —— 旧命名，兼容
 *   3. <DSH_HOME>/whale-audio/dance.*   —— dsh-whale-widget 的音频目录，方便直接复用
 *   4. 插件自带 assets/music.*          —— 想随插件打包音乐时放这里
 */
const AUDIO_DIRS = [
  path.join(DSH_HOME, 'disco-whale'),
  path.join(DSH_HOME, 'whale-audio'),
  path.join(PACKAGE_ROOT, 'assets'),
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

/** 触发词：归一化（去空白 + 小写）后整条等于其中之一才算「发送了欧耶耶」。 */
const TRIGGER_WORDS = ['欧耶耶', '欧耶', '欧也', '耶耶耶', 'ohyeahyeah', 'ouyeye', 'oyeye']

/** 问号消息：整条只有问号（中英文皆可）时触发「严肃提醒」回复替换。 */
const QUESTION_RE = /^[?？]+$/

/** 只在事件时间与当前时间相差 20s 以内才接受，避免会话重连时重放历史消息。 */
const REPLAY_WINDOW_MS = 20000

/** 前端轮询的信号；seq 每次触发自增。 */
const signal = { seq: 0, ts: 0, kind: 'lyrics' }

/** 注入行的 scope：谁把脚本塞进页面。 */
const INJECT_ROW_TEXT =
  '(function(){try{var d=document.body||document.head||document.documentElement;' +
  'if(!d)return;var s=document.createElement("script");s.src="/dsh-disco/widget.js";' +
  's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

const utf8 = 'utf-8'

function normalize(text) {
  return String(text == null ? '' : text)
    .replace(/\s+/g, '')
    .toLowerCase()
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

          // 前端每秒轮询：{ ok, seq, ts, kind }
          register({
            kind: 'exact',
            path: '/dsh-disco/signal.json',
            handler: (req, res) => {
              sendJson(res, { ok: true, seq: signal.seq, ts: signal.ts, kind: signal.kind })
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

          // 会话事件：user/message → 触发词 / 问号
          const noteSignal = (kind) => {
            signal.seq += 1
            signal.ts = Date.now()
            signal.kind = kind
          }

          const handleUserMessage = (event) => {
            const data = event && event.data
            const text = messageText(data)
            if (!text) return
            const key = normalize(text)
            if (!key) return

            const at = eventMs(event && event.time)
            if (at && Math.abs(Date.now() - at) > REPLAY_WINDOW_MS) return // 历史回放，忽略

            if (TRIGGER_WORDS.indexOf(key) >= 0) {
              noteSignal('lyrics')
              return
            }
            if (QUESTION_RE.test(key)) {
              noteSignal('question')
            }
          }

          ctx.on('session/event', (session, event) => {
            try {
              if (!event || event.type !== 'user/message') return
              handleUserMessage(event)
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
