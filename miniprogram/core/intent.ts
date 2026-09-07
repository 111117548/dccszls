import type { TopicKind, UserIntent } from './types'

const newsPattern = /(新闻|资讯|本地热点|当地热点|身边.{0,6}(消息|热点|新闻)|附近.{0,8}(消息|热点|新闻|发生))/

const locationPattern = /(附近|哪里|在哪|位置|地址|怎么走|路线|导航|多远)/
const weatherPattern = /(天气|气温|温度|下雨|雨|冷不冷|热不热|风|带伞)/
const emotionPattern = /(难过|伤心|烦|焦虑|累死|疲惫|开心|高兴|孤独|害怕|崩溃)/
const requestPattern = /(帮我|请你|麻烦|能不能|可以帮|提醒我)/
const opinionPattern = /(你觉得|怎么看|意见|建议|选哪个|哪个好)/
const actionPattern = /(我准备|我打算|我要去|我想去|出发|回家|去吃|去逛)/
const topicChangePattern = /^(换个话题|不说这个了|说点别的|聊聊|对了)[，,：:\s]?/

export function classifyIntent(rawText: string): UserIntent {
  const text = rawText.trim()
  if (!text || /^[\s！？!?.,，。…~～、]+$/.test(text)) return 'NONSENSE'
  if (topicChangePattern.test(text)) return 'TOPIC_CHANGE'
  if (newsPattern.test(text)) return 'NEWS_QUERY'
  if (locationPattern.test(text)) return 'LOCATION_QUERY'
  if (weatherPattern.test(text)) return 'WEATHER_QUERY'
  if (requestPattern.test(text)) return 'REQUEST'
  if (opinionPattern.test(text)) return 'OPINION'
  if (emotionPattern.test(text)) return 'EMOTION'
  if (actionPattern.test(text)) return 'ACTION'
  if (/[?？]$/.test(text) || /^(为什么|怎么|什么|谁|是否|有没有|能否)/.test(text)) return 'QUESTION'
  return 'CHAT'
}

export function topicKindForIntent(intent: UserIntent, text = ''): TopicKind {
  if (intent === 'WEATHER_QUERY') return 'weather'
  if (intent === 'LOCATION_QUERY') return 'location'
  if (intent === 'NEWS_QUERY') return 'news'
  if (intent === 'EMOTION') return 'emotion'
  if (intent === 'ACTION') return /吃|餐|饭|咖啡/.test(text) ? 'food' : 'action'
  if (intent === 'OPINION') return 'opinion'
  return 'general'
}
