import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"

const clock = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
const rt = vi.hoisted(() => ({
  subscribeToSession: vi.fn(),
  unsubscribe: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/services/gameService", () => ({
  gameService: {
    getSessionSnapshot: vi.fn(),
    updateSessionPresence: vi.fn(() => Promise.resolve(null)),
  },
}))

vi.mock("@/services/realtime", () => ({
  subscribeToSession: rt.subscribeToSession,
}))

vi.mock("@/stores/serverClock", () => ({
  useServerClockStore: () => ({
    start: clock.start,
    stop: clock.stop,
    now: () => 0,
  }),
  serverNow: () => 0,
}))

import { gameService } from "@/services/gameService"
import { primeSessionSnapshot, useSessionStore } from "@/stores/session"
import {
  makeLeaderboardEntry,
  makePlayer,
  makeSession,
  makeSnapshot,
} from "@/test/factories"
import { withTestPinia } from "@/test/pinia"

const getSessionSnapshot = gameService.getSessionSnapshot as Mock
const updateSessionPresence = gameService.updateSessionPresence as Mock

function lastSubscribeArgs() {
  return rt.subscribeToSession.mock.calls.at(-1) as [
    string,
    string | null,
    {
      onSessionChange: (p: unknown) => void
      onPlayerChange: (p: unknown) => void
      onAnswerChange: (p: unknown) => void
    },
    (status: "connecting" | "connected" | "disconnected") => void,
  ]
}

describe("session store", () => {
  beforeEach(() => {
    withTestPinia()
    vi.clearAllMocks()
    rt.subscribeToSession.mockReturnValue(rt.unsubscribe)
    updateSessionPresence.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("computeds with no snapshot", () => {
    it("default to null/empty", () => {
      const store = useSessionStore()
      expect(store.session).toBeNull()
      expect(store.game).toBeNull()
      expect(store.players).toEqual([])
      expect(store.leaderboard).toEqual([])
      expect(store.currentQuestion).toBeNull()
      expect(store.currentPlayer).toBeNull()
    })
  })

  describe("loadSession", () => {
    it("loads a snapshot, populates state, subscribes, and starts the clock", async () => {
      const snap = makeSnapshot({ currentPlayerId: "player-1" })
      getSessionSnapshot.mockResolvedValue(snap)

      const store = useSessionStore()
      await store.loadSession("session-1")

      expect(getSessionSnapshot).toHaveBeenCalledWith("session-1")
      expect(store.session?.id).toBe("session-1")
      expect(store.isLoading).toBe(false)
      expect(clock.start).toHaveBeenCalled()
      expect(rt.subscribeToSession).toHaveBeenCalledTimes(1)
      expect(lastSubscribeArgs()[1]).toBe("player-1")

      store.teardown()
    })

    it("consumes a primed prefetch without hitting the network", async () => {
      const snap = makeSnapshot({ currentPlayerId: "player-1" })
      primeSessionSnapshot("session-1", snap)

      const store = useSessionStore()
      await store.loadSession("session-1")

      expect(getSessionSnapshot).not.toHaveBeenCalled()
      expect(store.session?.id).toBe("session-1")
      store.teardown()
    })

    it("falls back to the network once the prefetch TTL expires", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000_000)
      primeSessionSnapshot("session-1", makeSnapshot())
      vi.setSystemTime(1_000_000 + 6000) // past the 5s TTL

      getSessionSnapshot.mockResolvedValue(makeSnapshot())
      const store = useSessionStore()
      await store.loadSession("session-1")

      expect(getSessionSnapshot).toHaveBeenCalledTimes(1)
      store.teardown()
    })

    it("records and rethrows a load error", async () => {
      getSessionSnapshot.mockRejectedValue(new Error("load failed"))
      const store = useSessionStore()

      await expect(store.loadSession("session-1")).rejects.toThrow(
        "load failed",
      )
      expect(store.error).toBe("load failed")
      expect(store.isLoading).toBe(false)
    })
  })

  describe("refreshSession", () => {
    it("re-fetches and updates the snapshot", async () => {
      getSessionSnapshot.mockResolvedValue(
        makeSnapshot({ currentPlayerId: "player-1" }),
      )
      const store = useSessionStore()
      await store.loadSession("session-1")

      getSessionSnapshot.mockResolvedValue(
        makeSnapshot({
          currentPlayerId: "player-1",
          session: makeSession({ phase: "question_active" }),
        }),
      )
      await store.refreshSession()

      expect(store.session?.phase).toBe("question_active")
      expect(store.isSyncing).toBe(false)
      store.teardown()
    })

    it("does nothing without a current session id", async () => {
      const store = useSessionStore()
      await store.refreshSession()
      expect(getSessionSnapshot).not.toHaveBeenCalled()
    })
  })

  describe("realtime handlers", () => {
    it("merges an in-place player score update and re-ranks the leaderboard", async () => {
      const snap = makeSnapshot({
        currentPlayerId: "player-1",
        players: [
          makePlayer({ id: "player-1", score: 0 }),
          makePlayer({ id: "player-2", score: 10 }),
        ],
        leaderboard: [
          makeLeaderboardEntry({ playerId: "player-2", score: 10, rank: 1 }),
          makeLeaderboardEntry({ playerId: "player-1", score: 0, rank: 2 }),
        ],
      })
      getSessionSnapshot.mockResolvedValue(snap)

      const store = useSessionStore()
      await store.loadSession("session-1")

      const [, , handlers] = lastSubscribeArgs()
      handlers.onPlayerChange({
        eventType: "UPDATE",
        new: { id: "player-1", score: 50 },
      })

      const player = store.players.find((p) => p.id === "player-1")
      expect(player?.score).toBe(50)
      expect(store.leaderboard[0].playerId).toBe("player-1")
      expect(store.leaderboard[0].rank).toBe(1)
      store.teardown()
    })

    it("merges a same-phase session row update", async () => {
      const snap = makeSnapshot({
        currentPlayerId: "player-1",
        session: makeSession({
          phase: "question_active",
          updatedAt: "2026-04-29T12:00:00.000Z",
        }),
      })
      getSessionSnapshot.mockResolvedValue(snap)

      const store = useSessionStore()
      await store.loadSession("session-1")

      const [, , handlers] = lastSubscribeArgs()
      handlers.onSessionChange({
        eventType: "UPDATE",
        new: {
          id: "session-1",
          phase: "question_active",
          updated_at: "2026-04-29T12:05:00.000Z",
        },
      })

      expect(store.session?.updatedAt).toBe("2026-04-29T12:05:00.000Z")
      store.teardown()
    })

    it("updates realtime status from the status callback", async () => {
      getSessionSnapshot.mockResolvedValue(makeSnapshot())
      const store = useSessionStore()
      await store.loadSession("session-1")

      const [, , , onStatus] = lastSubscribeArgs()
      onStatus("connected")
      expect(store.realtimeStatus).toBe("connected")

      onStatus("disconnected")
      expect(store.realtimeStatus).toBe("disconnected")
      store.teardown()
    })
  })

  describe("teardown", () => {
    it("clears state, reports disconnection, and stops the clock", async () => {
      getSessionSnapshot.mockResolvedValue(
        makeSnapshot({ currentPlayerId: "player-1" }),
      )
      const store = useSessionStore()
      await store.loadSession("session-1")

      updateSessionPresence.mockClear()
      store.teardown()

      expect(store.snapshot).toBeNull()
      expect(store.error).toBeNull()
      expect(clock.stop).toHaveBeenCalled()
      expect(rt.unsubscribe).toHaveBeenCalled()
      // Presence is reported as disconnected on teardown.
      expect(updateSessionPresence).toHaveBeenCalledWith(
        "session-1",
        "player-1",
        false,
      )
    })
  })

  describe("sendPresence", () => {
    it("is a no-op without an active session", async () => {
      const store = useSessionStore()
      await store.sendPresence(true)
      expect(updateSessionPresence).not.toHaveBeenCalled()
    })
  })
})
