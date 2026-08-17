import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js"

import { supabase } from "@/services/supabase"

export type SessionRealtimeStatus = "connecting" | "connected" | "disconnected"

type SessionPlayerRow = Record<string, unknown> & {
  id: string
  session_id: string
}
type AnswerSubmissionRow = Record<string, unknown> & {
  id: string
  session_id: string
  question_id: string
}
type LiveSessionRow = Record<string, unknown> & { id: string }

export type SessionRealtimeHandlers = {
  onSessionChange: (
    payload: RealtimePostgresChangesPayload<LiveSessionRow>,
  ) => void
  onPlayerChange: (
    payload: RealtimePostgresChangesPayload<SessionPlayerRow>,
  ) => void
  onAnswerChange: (
    payload: RealtimePostgresChangesPayload<AnswerSubmissionRow>,
  ) => void
}

export function subscribeToSession(
  sessionId: string,
  currentPlayerId: string | null,
  handlers: SessionRealtimeHandlers,
  onStatusChange?: (status: SessionRealtimeStatus) => void,
) {
  const channels: RealtimeChannel[] = []
  const channelStatuses = new Map<string, string>()
  const sessionKey = `session:${sessionId}`
  const playersKey = `session-players:${sessionId}`
  const answersKey = currentPlayerId
    ? `session-answers:${sessionId}:${currentPlayerId}`
    : null

  const deriveAggregateStatus = (): SessionRealtimeStatus => {
    for (const status of channelStatuses.values()) {
      if (
        status === "CHANNEL_ERROR" ||
        status === "CLOSED" ||
        status === "TIMED_OUT"
      ) {
        return "disconnected"
      }
    }

    const allSubscribed =
      channelStatuses.get(sessionKey) === "SUBSCRIBED" &&
      channelStatuses.get(playersKey) === "SUBSCRIBED" &&
      (!answersKey || channelStatuses.get(answersKey) === "SUBSCRIBED")

    if (allSubscribed) return "connected"
    return "connecting"
  }

  const updateChannelStatus = (channelKey: string, status: string) => {
    channelStatuses.set(channelKey, status)
    onStatusChange?.(deriveAggregateStatus())
  }

  const sessionChannel = supabase
    .channel(sessionKey)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "live_sessions",
        filter: `id=eq.${sessionId}`,
      },
      handlers.onSessionChange,
    )
    .subscribe((status) => updateChannelStatus(sessionKey, status))

  channels.push(sessionChannel)

  const playersChannel = supabase
    .channel(playersKey)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "session_players",
        filter: `session_id=eq.${sessionId}`,
      },
      handlers.onPlayerChange,
    )
    .subscribe((status) => updateChannelStatus(playersKey, status))

  channels.push(playersChannel)

  if (answersKey && currentPlayerId) {
    const answersChannel = supabase
      .channel(answersKey)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "answer_submissions",
          filter: `player_id=eq.${currentPlayerId}`,
        },
        handlers.onAnswerChange,
      )
      .subscribe((status) => updateChannelStatus(answersKey, status))

    channels.push(answersChannel)
  }

  return async () => {
    await Promise.all(
      channels.map((channel) =>
        Promise.resolve(supabase.removeChannel(channel)).catch(() => {
          // Removal failures shouldn't block teardown; the channel will
          // be GC'd when the client reconnects.
        }),
      ),
    )
  }
}
