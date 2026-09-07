export interface MessageBudgetPolicy {
  hourly: number
  threeHours: number
  daily: number
  hardUnreadCap: number
}

export const defaultBudgetPolicy: MessageBudgetPolicy = {
  hourly: 3,
  threeHours: 10,
  daily: 20,
  hardUnreadCap: 30
}

export interface MessageBudgetResult {
  allowed: boolean
  reason: 'allowed' | 'hourly_limit' | 'three_hour_limit' | 'daily_limit' | 'hard_unread_cap'
  remaining: number
}

function countSince(timestamps: number[], since: number): number {
  return timestamps.filter((timestamp) => timestamp >= since).length
}

export function checkActiveMessageBudget(
  aiMessageTimestamps: number[],
  unreadCount: number,
  requestedMessages: number,
  now = Date.now(),
  policy = defaultBudgetPolicy
): MessageBudgetResult {
  const requested = Math.max(0, requestedMessages)
  if (unreadCount + requested > policy.hardUnreadCap) {
    return { allowed: false, reason: 'hard_unread_cap', remaining: Math.max(0, policy.hardUnreadCap - unreadCount) }
  }

  const windows = [
    { count: countSince(aiMessageTimestamps, now - 60 * 60 * 1000), limit: policy.hourly, reason: 'hourly_limit' as const },
    {
      count: countSince(aiMessageTimestamps, now - 3 * 60 * 60 * 1000),
      limit: policy.threeHours,
      reason: 'three_hour_limit' as const
    },
    { count: countSince(aiMessageTimestamps, now - 24 * 60 * 60 * 1000), limit: policy.daily, reason: 'daily_limit' as const }
  ]

  for (const window of windows) {
    if (window.count + requested > window.limit) {
      return { allowed: false, reason: window.reason, remaining: Math.max(0, window.limit - window.count) }
    }
  }

  const remaining = Math.min(...windows.map((window) => window.limit - window.count), policy.hardUnreadCap - unreadCount)
  return { allowed: true, reason: 'allowed', remaining: Math.max(0, remaining - requested) }
}
