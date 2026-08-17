import { beforeEach, describe, expect, it } from "vitest"

import { usePlayerStore } from "@/stores/player"
import { upsertResumeMetadata } from "@/lib/localStorage"
import { DEFAULT_AVATAR_KEY, type ResumeMetadata } from "@/types/domain"
import { makePlayer, makeSnapshot } from "@/test/factories"
import { withTestPinia } from "@/test/pinia"

function resume(overrides: Partial<ResumeMetadata> = {}): ResumeMetadata {
  return {
    inviteCode: "ABC123",
    sessionId: "session-1",
    playerId: "player-1",
    displayName: "Stored Name",
    avatarKey: "avatar-03",
    role: "player",
    ...overrides,
  }
}

describe("player store", () => {
  beforeEach(() => {
    withTestPinia()
  })

  describe("hydrateForInvite", () => {
    it("resets to defaults when no resume is stored", () => {
      const store = usePlayerStore()
      store.displayName = "leftover"

      store.hydrateForInvite("UNKNOWN")

      expect(store.currentResume).toBeNull()
      expect(store.avatarKey).toBe(DEFAULT_AVATAR_KEY)
    })

    it("hydrates name and avatar from a stored resume", () => {
      upsertResumeMetadata(resume())
      const store = usePlayerStore()

      store.hydrateForInvite("ABC123")

      expect(store.currentResume).toMatchObject({ playerId: "player-1" })
      expect(store.displayName).toBe("Stored Name")
      expect(store.avatarKey).toBe("avatar-03")
    })
  })

  describe("hydrateForSession", () => {
    it("hydrates from a resume matched by session id", () => {
      upsertResumeMetadata(resume({ sessionId: "session-9" }))
      const store = usePlayerStore()

      store.hydrateForSession("session-9")

      expect(store.currentResume?.sessionId).toBe("session-9")
      expect(store.displayName).toBe("Stored Name")
    })

    it("resets to defaults when the session is unknown", () => {
      const store = usePlayerStore()
      store.hydrateForSession("missing")
      expect(store.currentResume).toBeNull()
      expect(store.avatarKey).toBe(DEFAULT_AVATAR_KEY)
    })
  })

  describe("saveResume", () => {
    it("updates state and persists to localStorage", () => {
      const store = usePlayerStore()
      store.saveResume(resume({ displayName: "Saved", avatarKey: "avatar-02" }))

      expect(store.displayName).toBe("Saved")
      expect(store.avatarKey).toBe("avatar-02")
      expect(store.currentResume?.displayName).toBe("Saved")

      // A fresh store reads the persisted entry back.
      const other = usePlayerStore()
      expect(other.recentSessions).toHaveLength(1)
    })
  })

  describe("syncFromSnapshot", () => {
    it("does nothing without a current player id", () => {
      const store = usePlayerStore()
      store.syncFromSnapshot(makeSnapshot({ currentPlayerId: undefined }))
      expect(store.currentResume).toBeNull()
    })

    it("does nothing when the current player is not in the roster", () => {
      const store = usePlayerStore()
      store.syncFromSnapshot(
        makeSnapshot({ currentPlayerId: "ghost", players: [] }),
      )
      expect(store.currentResume).toBeNull()
    })

    it("saves a resume derived from the matched player", () => {
      const store = usePlayerStore()
      const player = makePlayer({
        id: "player-7",
        displayName: "Live Name",
        avatarKey: "avatar-04",
        role: "host",
      })

      store.syncFromSnapshot(
        makeSnapshot({ currentPlayerId: "player-7", players: [player] }),
      )

      expect(store.currentResume).toMatchObject({
        playerId: "player-7",
        displayName: "Live Name",
        avatarKey: "avatar-04",
        role: "host",
      })
      expect(store.displayName).toBe("Live Name")
    })
  })
})
