import { characterById, storyById } from '../data/characters'
import type {
  CharacterId,
  ChatMessage,
  ConversationBeat,
  Opportunity,
  UserIntent,
  WorldSnapshot
} from './types'

function timeLabel(now: number): string {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function newsDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function replyText(
  speaker: CharacterId,
  intent: UserIntent,
  userText: string,
  index: number,
  world: WorldSnapshot
): string {
  const location = world.location.data
  const weather = world.weather.data
  if (intent === 'NONSENSE') return '我没看懂这句，你愿意再说一次吗？'
  if (intent === 'NEWS_QUERY') {
    const evidence =
      world.localNews &&
      !world.localNews.isSimulated &&
      world.localNews.expiresAt > Date.now()
        ? world.localNews.data
        : []
    if (!evidence.length) {
      if (index === 0) {
        return '我现在没有拿到可核验的本地资讯，先不拿传闻凑答案。你可以到“世界状态”同步一次。'
      }
      if (index === 1) {
        return '等资讯源返回标题、来源和发布时间后，我们再一起看；没有来源的消息先不当事实。'
      }
      return '这轮先停在“无法确认”，比为了热闹临时编一条消息靠谱。'
    }
    const item = evidence[Math.min(index, evidence.length - 1)]
    if (index === 0) {
      return `我查到一条较新的本地信息：“${item.title.slice(0, 68)}”。来源是${item.sourceName}，发布于${newsDate(item.publishedAt)}。`
    }
    if (index < evidence.length) {
      return `还有一条是“${item.title.slice(0, 68)}”，同样先记来源：${item.sourceName}，${newsDate(item.publishedAt)}发布。`
    }
    if (index > evidence.length) {
      return '先把它当作带来源的线索，不替原发布者补充原因或结论；要确认细节，还是打开原文更稳。'
    }
    return `这条目前能确认的摘要是：${item.summary.slice(0, 92)}。原文链接放在“世界状态”里，别只凭标题下结论。`
  }
  if (intent === 'WEATHER_QUERY') {
    const simulated = world.weather.isSimulated
    if (speaker === 'ning') {
      return simulated
        ? `模拟状态里现在是${weather.condition}，${weather.temperature}℃。真实天气尚未同步。`
        : `天气数据当前显示${weather.condition}，${weather.temperature}℃，体感${weather.feelsLike}℃。来源是${weather.sources.join('、') || world.weather.provider}。`
    }
    if (speaker === 'qiao') {
      return simulated
        ? '先别让模拟数据替你决定要不要带伞——这一版只验证我们会不会接住天气话题。'
        : `过去一小时降水量是${weather.precipitation}毫米；数据有观测延迟，出门前还得看窗外。`
    }
    return weather.warning ? `当前有预警：${weather.warning}。先按预警提示安排更稳。` : '当前数据里没有生效的天气预警。'
  }
  if (intent === 'LOCATION_QUERY') {
    if (speaker === 'axing') {
      return world.location.isSimulated
        ? `当前只拿到模拟地点“${location.landmark}”，所以我不会把它说成你的真实位置。`
        : `当前前台定位在${location.city || location.province || '未知城市'}，精度约${Math.round(location.accuracy)}米。详细街道还没有接地图逆地理编码。`
    }
    if (speaker === 'qiao') return '路线和附近地点还没接数据源，这时候硬给建议就属于瞎指路。'
    return '等真实定位获得授权后，我们会同时说明精度、来源和更新时间。'
  }
  if (intent === 'EMOTION') {
    if (speaker === 'ning') return '我在听。你不用急着把情绪整理得很完整，可以先说最让你难受的那一点。'
    if (speaker === 'qiao') return '今天先不负责表现得若无其事，难受就按难受来。'
    return '要是你愿意，我们就陪你把眼前这一小步先走过去。'
  }
  if (intent === 'ACTION') {
    if (speaker === 'axing') return '听起来可以行动了。先确认时间、路程和你最在意的那件事。'
    if (speaker === 'qiao') return '计划不错，给它补一个“如果临时变了怎么办”，就更稳了。'
    return '别把行程排得太满，给自己留一点可以改变主意的余地。'
  }
  if (intent === 'OPINION' || intent === 'QUESTION' || intent === 'REQUEST') {
    if (speaker === 'qiao') return `“${userText.slice(0, 28)}”这个问题挺大，我先说最值得争的那一处，省得把三种答案一起倒给你。`
    if (speaker === 'axing') return '我想得直接一点：先挑一个最具体的方向试试，聊到能做什么才算没有白聊。'
    return '我更在意你为什么会在这时候问起它。答案可以慢一点，但这层心思别漏掉。'
  }
  if (speaker === 'axing') return '这事我有兴趣。你先说，我想到具体的就接，不抢着替你总结。'
  if (speaker === 'qiao') return '行，这个话头比客套话有意思。先看看谁会第一个忍不住反对。'
  return '我听着。你不用把它说得很完整，有些话本来就是边说边清楚的。'
}

function storyLeadText(speaker: CharacterId, title: string): string {
  if (speaker === 'axing') return `有。我刚想到“${title}”那次，说起来还有点丢人，但确实让我改了。`
  if (speaker === 'qiao') return `有一件。“${title}”听着不算光彩，不过比硬装成一直正确有意思。`
  return `我想起“${title}”这件事。它不热闹，却在我心里留了很久。`
}

function storyReactionText(speaker: CharacterId, storyId: string): string {
  const story = storyById[storyId]
  if (!story) return '这件事我先记着。里面还有一句话，值得晚一点再接。'
  if (speaker === story.autonomousPartnerId) return story.autonomousReply
  if (speaker === story.ownerId) return `我后来留下的教训其实很简单：${story.emotionalMeaning}`
  if (speaker === 'axing') return `这次我不催着往下跑。${story.emotionalMeaning}`
  if (speaker === 'qiao') return `这话我接得住。说到底，${story.emotionalMeaning}`
  return `我记住的也是这一点：${story.emotionalMeaning}`
}

export function makeUserMessage(text: string, topicId: string, now = Date.now()): ChatMessage {
  return {
    id: `user-${now}`,
    senderType: 'user',
    speakerId: null,
    speakerName: '我',
    text,
    createdAt: now,
    timeLabel: timeLabel(now),
    topicId,
    replyToMessageId: null,
    isAiGenerated: false
  }
}

export function makePrototypeReplies(
  beats: ConversationBeat[],
  maxAiBubbles: number,
  intent: UserIntent,
  userText: string,
  topicId: string,
  replyToMessageId: string,
  world: WorldSnapshot,
  now = Date.now(),
  trigger: ChatMessage['trigger'] = 'user'
): ChatMessage[] {
  let previousId = replyToMessageId
  const messages: ChatMessage[] = []
  const roundStoryId = beats.find((candidate) => candidate.storyId)?.storyId ?? null

  for (const [beatIndex, beat] of beats.entries()) {
    if (messages.length >= Math.min(3, maxAiBubbles)) break
    const profile = characterById[beat.speakerId]
    const story = beat.storyId ? storyById[beat.storyId] : null
    const bubbleTexts: string[] = []

    if (beat.motive === 'share_story' && story) {
      bubbleTexts.push(story.autonomousHook)
    } else if (beat.motive === 'react' && story && beat.speakerId === story.autonomousPartnerId) {
      bubbleTexts.push(story.autonomousReply)
    } else if (!story && beatIndex > 0 && roundStoryId) {
      bubbleTexts.push(storyReactionText(beat.speakerId, roundStoryId))
    } else {
      bubbleTexts.push(
        story
          ? storyLeadText(beat.speakerId, story.title)
          : replyText(beat.speakerId, intent, userText, beatIndex, world)
      )
      if (story && beat.maxBubbles === 2 && messages.length + bubbleTexts.length < maxAiBubbles) {
        bubbleTexts.push(story.autonomousHook)
      }
    }

    for (const [bubbleIndex, text] of bubbleTexts.entries()) {
      if (messages.length >= Math.min(3, maxAiBubbles)) break
      const id = `ai-${now}-${beatIndex}-${bubbleIndex}`
      const createdAt = now + messages.length * 1000
      const message: ChatMessage = {
        id,
        senderType: 'ai',
        speakerId: beat.speakerId,
        speakerName: profile.name,
        text,
        createdAt,
        timeLabel: timeLabel(createdAt),
        topicId,
        replyToMessageId: previousId,
        isAiGenerated: true,
        motive: beat.motive,
        delayProfile: beat.delayProfile,
        required: beat.required && bubbleIndex === 0,
        storyId: beat.storyId,
        turnId: `fallback-turn-${now}-${beatIndex}`,
        bubbleIndex,
        trigger
      }
      previousId = id
      messages.push(message)
    }
  }

  return messages
}

function continuationText(
  speaker: CharacterId,
  topicTitle: string,
  previousText: string,
  index: number,
  relatedStoryId: string | null
): string {
  if (relatedStoryId) return storyReactionText(speaker, relatedStoryId)
  const topic = topicTitle.slice(0, 24) || '刚才那件事'
  const previous = previousText.replace(/[。！？!?]+$/g, '').slice(-26)
  if (index === 0 && speaker === 'axing') return `等一下，我顺着“${previous || topic}”又想到一步：这事可以继续往行动上聊。`
  if (index === 0 && speaker === 'qiao') return `我对“${previous || topic}”只同意一半。说得太稳了，真正麻烦的地方还没碰到。`
  if (index === 0) return `“${previous || topic}”这句我又想了一下。答案之外，你为什么在意它也值得聊。`
  if (speaker === 'axing') return '对，这就比各说各的有意思了。要继续，我想先抓最具体的那一步。'
  if (speaker === 'qiao') return '这次我同意一半。先把没说透的地方留下，等会儿用户想接哪边都行。'
  return '你们总算没急着下结论。这个话头先放在这里，它还可以继续长。'
}

export function makeTopicContinuationReplies(
  beats: ConversationBeat[],
  maxAiBubbles: number,
  topicId: string,
  topicTitle: string,
  previousMessage: ChatMessage,
  relatedStoryId: string | null = null,
  now = Date.now()
): ChatMessage[] {
  let previousId = previousMessage.id
  const messages: ChatMessage[] = []
  for (const [index, beat] of beats.entries()) {
    if (messages.length >= Math.min(2, maxAiBubbles)) break
    const id = `continuation-${now}-${index}`
    const createdAt = now + index * 1000
    messages.push({
      id,
      senderType: 'ai',
      speakerId: beat.speakerId,
      speakerName: characterById[beat.speakerId].name,
      text: continuationText(beat.speakerId, topicTitle, previousMessage.text, index, relatedStoryId),
      createdAt,
      timeLabel: timeLabel(createdAt),
      topicId,
      replyToMessageId: previousId,
      isAiGenerated: true,
      motive: beat.motive,
      delayProfile: beat.delayProfile,
      required: beat.required,
      storyId: null,
      turnId: `fallback-continuation-${now}-${index}`,
      bubbleIndex: 0,
      trigger: 'continuation'
    })
    previousId = id
  }
  return messages
}

export function makeOpportunityReplies(
  beats: ConversationBeat[],
  opportunity: Opportunity,
  topicId: string,
  now = Date.now()
): ChatMessage[] {
  let previousId: string | null = null
  return beats.slice(0, 2).map((beat, index) => {
    const id = `world-${opportunity.id}-${index}`
    const createdAt = now + index * 1000
    let text = ''
    if (index === 0) {
      text =
        opportunity.type === 'location'
          ? `刚同步到一个位置变化：${opportunity.title}。${opportunity.description}。`
          : `刚同步到天气变化：${opportunity.title}。${opportunity.description}。`
    } else if (beat.speakerId === 'qiao') {
      text = '这次有明确数据才提一句；先别急着把变化扩写成我们不知道的情况。'
    } else if (beat.speakerId === 'ning') {
      text = opportunity.type === 'weather' ? '如果你正准备出门，先按这个变化重新看一眼安排。' : '地方变了，刚才那段路也算被我们一起记住了。'
    } else {
      text = opportunity.type === 'location' ? '到了新地方就慢一点确认方向，别让兴奋带着跑偏。' : '这变化挺明显，出门前再看一眼实时情况。'
    }
    const message: ChatMessage = {
      id,
      senderType: 'ai',
      speakerId: beat.speakerId,
      speakerName: characterById[beat.speakerId].name,
      text,
      createdAt,
      timeLabel: timeLabel(createdAt),
      topicId,
      replyToMessageId: previousId,
      isAiGenerated: true,
      motive: beat.motive,
      delayProfile: beat.delayProfile,
      required: beat.required,
      storyId: null,
      turnId: `world-turn-${opportunity.id}`,
      bubbleIndex: 0,
      trigger: 'world'
    }
    previousId = id
    return message
  })
}
