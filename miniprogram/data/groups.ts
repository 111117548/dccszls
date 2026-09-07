import type { GroupDefinition, GroupMode } from '../core/group-contract'
import { characterById } from './characters'

export const DEFAULT_GROUP_ID = 'evening-breeze-companion'

export const groupDefinitions: GroupDefinition[] = [
  {
    id: DEFAULT_GROUP_ID,
    name: '晚风生活群',
    description: '三个性格不同的 AI 群友，会接住你的话，也会在合适的时候彼此聊几句。',
    mode: 'companion',
    memberIds: ['axing', 'qiao', 'ning'],
    disclosure: '群成员均为 AI 角色。角色故事属于虚构设定；现实信息只在可靠数据可用时使用。',
    welcome: {
      speakerId: 'ning',
      text: '你来了。今天想从哪儿说起都行；一时不想说，我们也各自待会儿。'
    },
    capabilities: {
      worldAware: true,
      proactiveWorld: true,
      autonomousConversation: true,
      structuredDiscussion: false,
      narrativeProgression: false,
      imageUnderstanding: true
    },
    modeLabel: '陪伴群',
    modeInstructions: [
      '优先接住用户当下感受，不把每句话变成建议。',
      '角色可以彼此接话和分享已登记故事，但没有理由时允许安静。'
    ],
    memberRoles: {
      axing: '行动派群友',
      qiao: '轻松锐评群友',
      ning: '细腻陪伴群友'
    }
  },
  {
    id: 'clear-table-discussion',
    name: '把话说清楚讨论群',
    description: '围绕一个具体问题拆解事实、分歧、选择和下一步，不用一个答案假装代表所有人。',
    mode: 'discussion',
    memberIds: ['qiao', 'ning', 'axing'],
    disclosure: '群成员均为 AI 角色。本群用于梳理思路，不替代医疗、法律、财务等专业意见。',
    welcome: {
      speakerId: 'qiao',
      text: '把问题丢进来吧。我们先确认你真正要决定什么，再各自从不同角度拆。'
    },
    capabilities: {
      worldAware: true,
      proactiveWorld: false,
      autonomousConversation: false,
      structuredDiscussion: true,
      narrativeProgression: false,
      imageUnderstanding: true
    },
    modeLabel: '讨论群',
    modeInstructions: [
      '先复述需要解决的核心问题，再区分事实、假设、分歧与行动。',
      '角色必须提供不同视角，可以反对，但不能为了热闹制造伪分歧。',
      '最后给出暂时结论、仍待确认的信息或下一步。'
    ],
    memberRoles: {
      qiao: '逻辑拆解与反方检查',
      ning: '感受、关系与隐含代价',
      axing: '行动方案与低成本试验'
    }
  },
  {
    id: 'crossworld-convention-salon',
    name: '跨次元漫展会客厅',
    description: '来自不同原创世界的角色在中立漫展会客区碰面，用身份和价值观反差产生有趣碰撞。',
    mode: 'crossover_salon',
    memberIds: ['axing', 'qiao', 'ning'],
    disclosure: '群成员均为 AI 演绎的原创虚构角色。这里是跨世界中立会客场景，不代表任何现实人物或第三方作品官方设定。',
    welcome: {
      speakerId: 'axing',
      text: '会客区开门了！我们三个来自完全不同的故事，你随便抛个东西，看谁先理解歪。'
    },
    capabilities: {
      worldAware: false,
      proactiveWorld: false,
      autonomousConversation: true,
      structuredDiscussion: false,
      narrativeProgression: false,
      imageUnderstanding: true
    },
    modeLabel: '跨IP沙龙',
    modeInstructions: [
      '每个角色只从自己的原创世界身份、能力边界和价值观看问题。',
      '乐趣来自身份反差、误解和互相修正，不建立强行统一的世界背景。',
      '不得冒充第三方商业IP官方角色，不引用未提供的原作事实。'
    ],
    memberRoles: {
      axing: '来自群岛冒险世界的见习航路领队，重行动和伙伴',
      qiao: '来自术式学院世界的规则分析者，擅长看漏洞',
      ning: '来自旧城书信世界的记录者，重语言、礼数与情感细节'
    }
  },
  {
    id: 'mist-harbor-story',
    name: '雾港来信·沉浸故事群',
    description: '用户以收信人的主观视角进入连续故事，群里的角色只知道各自掌握的线索。',
    mode: 'story',
    memberIds: ['ning', 'qiao', 'axing'],
    disclosure: '这是由 AI 角色演绎的原创虚构故事群。群内地点、事件和人物均属于故事设定，不是现实世界信息。',
    welcome: {
      speakerId: 'ning',
      text: '你终于进群了。那封没有署名的信还在我这里，信封上只写着：雾散以前，不要去旧钟楼。'
    },
    capabilities: {
      worldAware: false,
      proactiveWorld: false,
      autonomousConversation: true,
      structuredDiscussion: false,
      narrativeProgression: true,
      imageUnderstanding: true
    },
    modeLabel: '故事群',
    modeInstructions: [
      '用户是刚抵达雾港的收信人，只能从群消息和自己的选择感知故事。',
      '角色只说自己知道的内容，不使用全知旁白，不替用户决定行动。',
      '每轮推进一个细节、选择或关系变化，线索必须保持连续。'
    ],
    memberRoles: {
      ning: '保管匿名来信的旧城记录员',
      qiao: '怀疑钟楼传言的线路调查员',
      axing: '愿意陪用户实地行动的港口向导'
    }
  }
]

const groupById = Object.fromEntries(groupDefinitions.map((group) => [group.id, group])) as Record<
  string,
  GroupDefinition
>

export function getGroupDefinition(groupId: string | undefined): GroupDefinition {
  return (groupId && groupById[groupId]) || groupById[DEFAULT_GROUP_ID]
}

export function hasGroupMode(mode: GroupMode): boolean {
  return groupDefinitions.some((group) => group.mode === mode)
}

export function validateGroupDefinitions(): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const group of groupDefinitions) {
    if (!group.id || ids.has(group.id)) errors.push(`duplicate_or_empty_group_id:${group.id}`)
    ids.add(group.id)
    if (!group.memberIds.length) errors.push(`group_has_no_members:${group.id}`)
    if (!group.modeInstructions.length) errors.push(`group_has_no_mode_instructions:${group.id}`)
    for (const characterId of group.memberIds) {
      if (!characterById[characterId]) errors.push(`unknown_character:${group.id}:${characterId}`)
      if (!group.memberRoles[characterId]) errors.push(`missing_member_role:${group.id}:${characterId}`)
    }
    if (!group.memberIds.includes(group.welcome.speakerId)) {
      errors.push(`welcome_speaker_not_member:${group.id}:${group.welcome.speakerId}`)
    }
  }
  return errors
}
