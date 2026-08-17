import { afterEach, describe, expect, it, vi } from "vitest"

import { setAppLocale } from "@/i18n"
import {
  canSubmitAnswer,
  deriveGameStatus,
  formatTimestamp,
  getCanonicalSessionRoute,
} from "@/lib/sessionHelpers"
import type { GameStatusSummary } from "@/types/domain"

describe("getCanonicalSessionRoute", () => {
  it("maps canonical routes from the session phase", () => {
    expect(getCanonicalSessionRoute("session-1", "lobby")).toBe(
      "/session/session-1/lobby",
    )
    expect(getCanonicalSessionRoute("session-1", "question_active")).toBe(
      "/session/session-1/play",
    )
    expect(getCanonicalSessionRoute("session-1", "answer_transition")).toBe(
      "/session/session-1/play",
    )
    expect(getCanonicalSessionRoute("session-1", "answer_reveal")).toBe(
      "/session/session-1/play",
    )
    expect(getCanonicalSessionRoute("session-1", "round_summary")).toBe(
      "/session/session-1/play",
    )
    expect(getCanonicalSessionRoute("session-1", "round_leaderboard")).toBe(
      "/session/session-1/play",
    )
    expect(getCanonicalSessionRoute("session-1", "finished")).toBe(
      "/session/session-1/results",
    )
  })
})

describe("canSubmitAnswer", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows submission only while the active question is still open", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-27T18:00:00.000Z"))

    expect(
      canSubmitAnswer({
        phase: "question_active",
        questionEndsAt: "2026-03-27T18:00:05.000Z",
        submittedOptionId: null,
      }),
    ).toBe(true)

    expect(
      canSubmitAnswer({
        phase: "question_active",
        questionEndsAt: "2026-03-27T17:59:59.000Z",
        submittedOptionId: null,
      }),
    ).toBe(false)

    expect(
      canSubmitAnswer({
        phase: "answer_reveal",
        questionEndsAt: "2026-03-27T18:00:05.000Z",
        submittedOptionId: null,
      }),
    ).toBe(false)

    expect(
      canSubmitAnswer({
        phase: "question_active",
        questionEndsAt: "2026-03-27T18:00:05.000Z",
        submittedOptionId: "option-1",
      }),
    ).toBe(false)
  })

  it("uses calibrated server time when a caller supplies it", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-27T18:00:00.000Z"))

    expect(
      canSubmitAnswer({
        phase: "question_active",
        questionEndsAt: "2026-03-27T18:00:05.000Z",
        submittedOptionId: null,
        nowMs: new Date("2026-03-27T18:00:06.000Z").getTime(),
      }),
    ).toBe(false)
  })
})

describe("deriveGameStatus", () => {
  function createGameStatus(
    partial: Partial<GameStatusSummary> = {},
  ): GameStatusSummary {
    return {
      gameId: "game-1",
      title: "Friday Trivia",
      updatedAt: "2026-03-27T18:00:00.000Z",
      questionCount: 8,
      activeSessionId: null,
      activeInviteCode: null,
      activePhase: null,
      activePlayerCount: 0,
      activeHostConnected: false,
      activeSessionUpdatedAt: null,
      ...partial,
    }
  }

  afterEach(() => {
    setAppLocale("en")
  })

  it("derives empty, lobby, and live status summaries for the game list", () => {
    setAppLocale("en")

    expect(deriveGameStatus(createGameStatus()).label).toBe("Ready")

    expect(
      deriveGameStatus(
        createGameStatus({
          activeSessionId: "session-1",
          activeInviteCode: "ROOM01",
          activePhase: "lobby",
          activePlayerCount: 3,
        }),
      ),
    ).toMatchObject({
      label: "Room Open",
      detail: "Players in the lobby: 3",
      canReopen: true,
    })

    expect(
      deriveGameStatus(
        createGameStatus({
          activeSessionId: "session-1",
          activeInviteCode: "ROOM01",
          activePhase: "question_active",
          activeHostConnected: false,
        }),
      ),
    ).toMatchObject({
      label: "Live Now",
      detail: "Host is away",
      canReopen: true,
    })

    expect(
      deriveGameStatus(
        createGameStatus({
          activeSessionId: "session-1",
          activeInviteCode: "ROOM01",
          activePhase: "answer_reveal",
          activeHostConnected: true,
        }),
      ),
    ).toMatchObject({
      label: "Live Now",
      detail: "Answer on screen",
      canReopen: true,
    })
  })

  it("uses the active locale for translated labels and timestamp formatting", () => {
    setAppLocale("pl")

    expect(deriveGameStatus(createGameStatus()).label).toBe("Gotowe")
    expect(
      deriveGameStatus(
        createGameStatus({
          activeSessionId: "session-1",
          activeInviteCode: "ROOM01",
          activePhase: "answer_reveal",
          activeHostConnected: true,
        }),
      ).detail,
    ).toBe("Na ekranie: Odpowiedź")

    const value = "2026-03-27T18:00:00.000Z"
    expect(formatTimestamp(value)).toBe(
      new Intl.DateTimeFormat("pl", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value)),
    )
    expect(formatTimestamp(null)).toBe("Nieznane")
  })
})
