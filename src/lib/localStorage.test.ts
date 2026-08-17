import { beforeEach, describe, expect, it } from "vitest"

import {
  getRecentResumeMetadata,
  loadResumeMetadata,
  loadResumeMetadataBySession,
  upsertResumeMetadata,
} from "@/lib/localStorage"
import { DEFAULT_AVATAR_KEY } from "@/types/domain"

describe("resume local storage helpers", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("loads by invite code and session id", () => {
    upsertResumeMetadata({
      inviteCode: "ROOM01",
      sessionId: "session-1",
      playerId: "player-1",
      displayName: "Taylor",
      avatarKey: "avatar-03",
      role: "player",
    })

    expect(loadResumeMetadata("ROOM01")?.playerId).toBe("player-1")
    expect(loadResumeMetadataBySession("session-1")?.displayName).toBe("Taylor")
    expect(loadResumeMetadataBySession("session-1")?.avatarKey).toBe(
      "avatar-03",
    )
  })

  it("replaces stale metadata for the same session or invite", () => {
    upsertResumeMetadata({
      inviteCode: "ROOM01",
      sessionId: "session-1",
      playerId: "player-1",
      displayName: "Taylor",
      avatarKey: "avatar-02",
      role: "player",
    })

    upsertResumeMetadata({
      inviteCode: "ROOM01",
      sessionId: "session-1",
      playerId: "player-2",
      displayName: "Taylor Reloaded",
      avatarKey: "avatar-04",
      role: "player",
    })

    expect(getRecentResumeMetadata()).toHaveLength(1)
    expect(loadResumeMetadata("ROOM01")?.playerId).toBe("player-2")
    expect(loadResumeMetadata("ROOM01")?.avatarKey).toBe("avatar-04")
  })

  it("backfills older saved entries without an avatar key", () => {
    localStorage.setItem(
      "pulse-quiz:resume",
      JSON.stringify([
        {
          inviteCode: "ROOM01",
          sessionId: "session-1",
          playerId: "player-1",
          displayName: "Taylor",
          role: "player",
        },
      ]),
    )

    expect(loadResumeMetadata("ROOM01")?.avatarKey).toBe(DEFAULT_AVATAR_KEY)
  })
})
