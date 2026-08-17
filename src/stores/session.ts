import { defineStore } from "pinia"
import { computed, ref } from "vue"

import { translate } from "@/i18n"
import { jitterMs, withBackoff } from "@/lib/retry"
import {
  asBoolean,
  asNullableString,
  asNumber,
  asString,
} from "@/lib/typeGuards"
import { subscribeToSession } from "@/services/realtime"
import { gameService } from "@/services/gameService"
import { usePlayerStore } from "@/stores/player"
import { useServerClockStore } from "@/stores/serverClock"
import {
  isAvatarKey,
  isSessionPhase,
  type LiveSession,
  type SessionPlayer,
  type SessionSnapshot,
} from "@/types/domain"

const HEARTBEAT_BASE_MS = 20_000

type PrefetchedSnapshot = {
  sessionId: string
  snapshot: SessionSnapshot
  fetchedAt: number
}

const PREFETCH_TTL_MS = 5000
let prefetchedSnapshot: PrefetchedSnapshot | null = null

export function primeSessionSnapshot(
  sessionId: string,
  snapshot: SessionSnapshot,
) {
  prefetchedSnapshot = { sessionId, snapshot, fetchedAt: Date.now() }
}

function consumePrefetchedSnapshot(sessionId: string): SessionSnapshot | null {
  if (!prefetchedSnapshot || prefetchedSnapshot.sessionId !== sessionId)
    return null
  if (Date.now() - prefetchedSnapshot.fetchedAt > PREFETCH_TTL_MS) {
    prefetchedSnapshot = null
    return null
  }
  const { snapshot } = prefetchedSnapshot
  prefetchedSnapshot = null
  return snapshot
}

export const useSessionStore = defineStore("session", () => {
  const playerStore = usePlayerStore()
  const snapshot = ref<SessionSnapshot | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const isSyncing = ref(false)
  const realtimeStatus = ref<"connecting" | "connected" | "disconnected">(
    "connecting",
  )
  const currentSessionId = ref<string | null>(null)
  let unsubscribe: (() => Promise<void>) | null = null
  let pendingUnsubscribe: Promise<void> | null = null
  let heartbeatId: number | null = null
  let visibilityHandler: (() => void) | null = null
  let onlineHandler: (() => void) | null = null
  let debounceTimer: number | null = null
  let lifecycleGeneration = 0
  let activeRefresh: {
    sessionId: string
    generation: number
    promise: Promise<void>
    pending: boolean
  } | null = null

  function isCurrentLifecycle(sessionId: string, generation: number) {
    return (
      currentSessionId.value === sessionId && lifecycleGeneration === generation
    )
  }

  function scheduleHeartbeat() {
    if (heartbeatId) window.clearTimeout(heartbeatId)
    heartbeatId = window.setTimeout(() => {
      heartbeatId = null
      if (document.visibilityState !== "hidden") {
        void sendPresence(true)
      }
      scheduleHeartbeat()
    }, jitterMs(HEARTBEAT_BASE_MS))
  }

  async function refreshSession(sessionId = currentSessionId.value) {
    if (!sessionId) return
    const generation = lifecycleGeneration
    if (
      activeRefresh &&
      activeRefresh.sessionId === sessionId &&
      activeRefresh.generation === generation
    ) {
      activeRefresh.pending = true
      return activeRefresh.promise
    }

    const refresh = {
      sessionId,
      generation,
      pending: false,
      promise: Promise.resolve(),
    }
    refresh.promise = (async () => {
      try {
        if (!isCurrentLifecycle(sessionId, generation)) return
        isSyncing.value = true
        error.value = null
        const nextSnapshot = await withBackoff(
          () => gameService.getSessionSnapshot(sessionId),
          { retries: 2, baseMs: 400, maxMs: 2_000 },
        )
        if (!isCurrentLifecycle(sessionId, generation)) return
        snapshot.value = nextSnapshot
        playerStore.syncFromSnapshot(snapshot.value)
      } catch (refreshError) {
        if (!isCurrentLifecycle(sessionId, generation)) return
        error.value =
          refreshError instanceof Error
            ? refreshError.message
            : translate("storeErrors.sessionRefresh")
        throw refreshError
      } finally {
        if (isCurrentLifecycle(sessionId, generation)) {
          isSyncing.value = false
        }
      }
    })()
    activeRefresh = refresh

    try {
      await refresh.promise
    } finally {
      if (activeRefresh === refresh) activeRefresh = null
    }

    if (refresh.pending && isCurrentLifecycle(sessionId, generation)) {
      await refreshSession(sessionId)
    }
  }

  function resolveCurrentPlayerId() {
    return (
      snapshot.value?.currentPlayerId ??
      playerStore.currentResume?.playerId ??
      null
    )
  }

  async function sendPresence(isConnected = true) {
    if (!currentSessionId.value) return
    if (
      isConnected &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return
    }

    try {
      await gameService.updateSessionPresence(
        currentSessionId.value,
        resolveCurrentPlayerId(),
        isConnected,
      )
    } catch {
      // Presence is best effort. The next canonical snapshot still derives connected state from last_seen_at.
    }
  }

  function mergePlayerRow(row: Record<string, unknown>): boolean {
    const current = snapshot.value
    if (!current) return false

    const id = asString(row.id)
    if (!id) return false

    const role = asString(row.role)
    const isValidRole = (value: string): value is SessionPlayer["role"] =>
      value === "host" || value === "player"

    let nextPlayer: SessionPlayer | null = null
    const nextPlayers = current.players.map((existing) => {
      if (existing.id !== id) return existing
      nextPlayer = {
        ...existing,
        displayName: asString(row.display_name) ?? existing.displayName,
        avatarKey: isAvatarKey(row.avatar_key)
          ? row.avatar_key
          : existing.avatarKey,
        role: role && isValidRole(role) ? role : existing.role,
        lastSeenAt: asString(row.last_seen_at) ?? existing.lastSeenAt,
        isConnected: asBoolean(row.is_connected) ?? existing.isConnected,
        score: asNumber(row.score) ?? existing.score,
      }
      return nextPlayer
    })

    if (!nextPlayer) return false
    const merged: SessionPlayer = nextPlayer

    const nextLeaderboard = current.leaderboard
      .map((entry) =>
        entry.playerId === id
          ? {
              ...entry,
              score: merged.score,
              displayName: merged.displayName,
              avatarKey: merged.avatarKey,
            }
          : entry,
      )
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }))

    snapshot.value = {
      ...current,
      players: nextPlayers,
      leaderboard: nextLeaderboard,
    }
    return true
  }

  function mergeSessionRow(row: Record<string, unknown>): boolean {
    const current = snapshot.value
    if (!current) return false

    const id = asString(row.id)
    if (!id || id !== current.session.id) return false

    // Skip in-place merge when the current question or part changes: snapshot.currentQuestion
    // and snapshot.game-derived state would lag behind session.currentQuestionIndex, causing
    // AnimatePresence to render an intermediate frame (old question under the new phase)
    // before the next snapshot refresh catches up. Let queueRefresh handle this atomically.
    const nextQuestionIndex =
      asNumber(row.current_question_index) ??
      current.session.currentQuestionIndex
    const nextPartIndex = asNumber(row.part_index) ?? current.session.partIndex
    const nextPhase = isSessionPhase(row.phase)
      ? row.phase
      : current.session.phase
    if (
      nextQuestionIndex !== current.session.currentQuestionIndex ||
      nextPartIndex !== current.session.partIndex ||
      (nextPhase === "answer_reveal" &&
        current.session.phase === "answer_transition") ||
      nextPhase === "finished"
    ) {
      return false
    }

    const pickNullableString = (
      key: string,
      fallback: string | null,
    ): string | null =>
      Object.prototype.hasOwnProperty.call(row, key)
        ? asNullableString(row[key], fallback)
        : fallback

    const nextSession: LiveSession = {
      ...current.session,
      phase: nextPhase,
      currentQuestionIndex: nextQuestionIndex,
      partIndex: nextPartIndex,
      partCount: asNumber(row.part_count) ?? current.session.partCount,
      currentPartStartIndex:
        asNumber(row.current_part_start_index) ??
        current.session.currentPartStartIndex,
      currentPartEndIndex:
        asNumber(row.current_part_end_index) ??
        current.session.currentPartEndIndex,
      questionStartedAt: pickNullableString(
        "question_started_at",
        current.session.questionStartedAt,
      ),
      questionEndsAt: pickNullableString(
        "question_ends_at",
        current.session.questionEndsAt,
      ),
      phaseStartedAt: pickNullableString(
        "phase_started_at",
        current.session.phaseStartedAt,
      ),
      phaseEndsAt: pickNullableString(
        "phase_ends_at",
        current.session.phaseEndsAt,
      ),
      isPaused: row.paused_at != null,
      pausedAt: pickNullableString("paused_at", current.session.pausedAt),
      finishedAt: pickNullableString("finished_at", current.session.finishedAt),
      updatedAt: asString(row.updated_at) ?? current.session.updatedAt,
    }

    snapshot.value = {
      ...current,
      session: nextSession,
    }
    return true
  }

  function stopPresence() {
    if (heartbeatId) {
      window.clearTimeout(heartbeatId)
      heartbeatId = null
    }

    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler)
      visibilityHandler = null
    }

    if (onlineHandler) {
      window.removeEventListener("online", onlineHandler)
      onlineHandler = null
    }
  }

  function cleanupSessionBindings() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (unsubscribe) {
      const fn = unsubscribe
      unsubscribe = null
      pendingUnsubscribe = fn().catch(() => {
        // Removal errors are surfaced by the realtime layer; ignore here.
      })
      void pendingUnsubscribe.finally(() => {
        pendingUnsubscribe = null
      })
    }
    stopPresence()
    realtimeStatus.value = "disconnected"
  }

  function startPresence() {
    stopPresence()
    void sendPresence(true)
    scheduleHeartbeat()

    visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void refreshSession()
        void sendPresence(true)
      }
    }

    onlineHandler = () => {
      void refreshSession()
      void sendPresence(true)
    }

    document.addEventListener("visibilitychange", visibilityHandler)
    window.addEventListener("online", onlineHandler)
  }

  function teardown(sessionIdToRelease = currentSessionId.value) {
    if (
      sessionIdToRelease &&
      currentSessionId.value &&
      sessionIdToRelease !== currentSessionId.value
    ) {
      return
    }
    const sessionId = currentSessionId.value
    const playerId = resolveCurrentPlayerId()

    lifecycleGeneration += 1
    cleanupSessionBindings()
    useServerClockStore().stop()

    if (sessionId) {
      void gameService.updateSessionPresence(sessionId, playerId, false)
    }

    currentSessionId.value = null
    snapshot.value = null
    isLoading.value = false
    isSyncing.value = false
    error.value = null
  }

  async function loadSession(sessionId: string) {
    if (
      currentSessionId.value === sessionId &&
      snapshot.value?.session.id === sessionId &&
      unsubscribe
    ) {
      return
    }

    const generation = ++lifecycleGeneration
    cleanupSessionBindings()
    if (pendingUnsubscribe) await pendingUnsubscribe
    if (lifecycleGeneration !== generation) return
    isLoading.value = true
    error.value = null
    realtimeStatus.value = "connecting"
    useServerClockStore().start()

    try {
      currentSessionId.value = sessionId
      const prefetched = consumePrefetchedSnapshot(sessionId)
      let nextSnapshot: SessionSnapshot
      if (prefetched) {
        nextSnapshot = prefetched
      } else {
        nextSnapshot = await gameService.getSessionSnapshot(sessionId)
      }
      if (!isCurrentLifecycle(sessionId, generation)) return
      snapshot.value = nextSnapshot
      playerStore.syncFromSnapshot(snapshot.value)

      const queueRefresh = (delay = 250) => {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null
          void (async () => {
            try {
              await refreshSession(sessionId)
            } catch {
              // The session view already surfaces sync errors from store state.
            }
          })()
        }, delay)
      }

      let lastRealtimeStatus: "connecting" | "connected" | "disconnected" =
        realtimeStatus.value

      unsubscribe = subscribeToSession(
        sessionId,
        snapshot.value.currentPlayerId ?? null,
        {
          onSessionChange: (payload) => {
            if (payload.eventType === "UPDATE" && payload.new) {
              mergeSessionRow(payload.new as Record<string, unknown>)
            }
            queueRefresh(250)
          },
          onPlayerChange: (payload) => {
            if (payload.eventType === "UPDATE" && payload.new) {
              const merged = mergePlayerRow(
                payload.new as Record<string, unknown>,
              )
              if (merged) return
            }
            queueRefresh(400)
          },
          onAnswerChange: () => queueRefresh(250),
        },
        (status) => {
          const previous = lastRealtimeStatus
          realtimeStatus.value = status
          lastRealtimeStatus = status
          if (previous !== "connected" && status === "connected") {
            queueRefresh(150)
          }
        },
      )
      startPresence()
    } catch (loadError) {
      if (!isCurrentLifecycle(sessionId, generation)) return
      error.value =
        loadError instanceof Error
          ? loadError.message
          : translate("storeErrors.sessionLoad")
      throw loadError
    } finally {
      if (isCurrentLifecycle(sessionId, generation)) {
        isLoading.value = false
      }
    }
  }

  const session = computed(() => snapshot.value?.session ?? null)
  const game = computed(() => snapshot.value?.game ?? null)
  const players = computed(() => snapshot.value?.players ?? [])
  const leaderboard = computed(() => snapshot.value?.leaderboard ?? [])
  const roundSummary = computed(() => snapshot.value?.roundSummary ?? [])
  const currentQuestion = computed(
    () => snapshot.value?.currentQuestion ?? null,
  )
  const viewerRole = computed(() => snapshot.value?.viewerRole ?? null)
  const currentPlayer = computed(
    () =>
      snapshot.value?.players.find(
        (player) => player.id === snapshot.value?.currentPlayerId,
      ) ?? null,
  )

  return {
    snapshot,
    session,
    game,
    players,
    leaderboard,
    roundSummary,
    currentQuestion,
    viewerRole,
    currentPlayer,
    isLoading,
    isSyncing,
    error,
    realtimeStatus,
    loadSession,
    refreshSession,
    sendPresence,
    teardown,
  }
})
