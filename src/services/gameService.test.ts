import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/supabase", async () => {
  const mod = await import("@/test/mock-supabase")
  return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
})

import {
  gameService,
  isInvalidInviteError,
  normalizeSnapshot,
  validateQuestionMediaFile,
} from "@/services/gameService"
import {
  mockCalls,
  resetMockSupabase,
  setFunctionResult,
  setRpc,
  setRpcError,
  setTableResult,
} from "@/test/mock-supabase"
import { clearMediaUrlCache } from "@/lib/mediaUrl"
import { makeSnapshot } from "@/test/factories"
import { withTestPinia } from "@/test/pinia"
import type { GameWithQuestionsRow } from "@/types/dbRows"

function gameRow(
  overrides: Partial<GameWithQuestionsRow> = {},
): GameWithQuestionsRow {
  return {
    id: "game-1",
    title: "Trivia",
    owner_id: "owner-1",
    default_question_points: 1,
    default_section_intermission_seconds: 10,
    created_at: "2026-04-29T12:00:00.000Z",
    updated_at: "2026-04-29T12:00:20.000Z",
    questions: [
      {
        id: "question-1",
        section_id: "section-1",
        position: 0,
        prompt: "Prompt",
        duration_seconds: 20,
        points: 2,
        correct_option_id: "option-1",
        media: null,
        reveal_media: null,
        reveal_text: null,
        options: [
          { id: "option-1", text: "A" },
          { id: "option-2", text: "B" },
        ],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  resetMockSupabase()
  clearMediaUrlCache()
})

function presigned(paths: string[]) {
  const expiresAt = Math.floor(Date.now() / 1000) + 2 * 60 * 60
  return {
    data: {
      urls: Object.fromEntries(
        paths.map((path) => [
          path,
          { url: `https://r2.example/${path}?signed`, expiresAt },
        ]),
      ),
      legacy: [],
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("normalizeSnapshot", () => {
  it("keeps reveal-phase fields and fills derived counts", async () => {
    const snapshot = await normalizeSnapshot(makeSnapshot())

    expect(snapshot.game.questionCount).toBe(1)
    expect(snapshot.game.sectionCount).toBe(1)
    expect(snapshot.currentQuestion?.correctOptionId).toBe("option-2")
  })

  it("derives sectionCount from sections when absent", async () => {
    const base = makeSnapshot()
    const snapshot = await normalizeSnapshot({
      ...base,
      game: { ...base.game, sectionCount: undefined as unknown as number },
    })
    expect(snapshot.game.sectionCount).toBe(base.game.sections.length)
  })
})

describe("listGames", () => {
  it("queries the view and normalizes rows", async () => {
    setTableResult("games_with_questions", { data: [gameRow()] })

    const games = await gameService.listGames()

    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ id: "game-1", title: "Trivia" })
    expect(games[0].questions[0].points).toBe(2)
    expect(mockCalls.from.some((c) => c.name === "games_with_questions")).toBe(
      true,
    )
  })

  it("returns an empty list when the view yields null", async () => {
    setTableResult("games_with_questions", { data: null })
    expect(await gameService.listGames()).toEqual([])
  })

  it("throws when the query errors", async () => {
    setTableResult("games_with_questions", { error: new Error("db down") })
    await expect(gameService.listGames()).rejects.toThrow("db down")
  })
})

describe("getGame", () => {
  it("normalizes a single game", async () => {
    setTableResult("games_with_questions", { data: gameRow() })
    const game = await gameService.getGame("game-1")
    expect(game.id).toBe("game-1")
    expect(game.questions).toHaveLength(1)
  })
})

describe("rpc wrappers", () => {
  it("startSession returns the rpc payload", async () => {
    setRpc("create_live_session", {
      sessionId: "s-1",
      inviteCode: "ABC123",
      reusedExisting: false,
    })
    const result = await gameService.startSession("game-1")
    expect(result.sessionId).toBe("s-1")
    expect(mockCalls.rpc.at(-1)).toMatchObject({
      name: "create_live_session",
      params: { p_game_id: "game-1" },
    })
  })

  it("getServerTime coerces the payload to a number", async () => {
    setRpc("get_server_time", "1700000000000")
    expect(await gameService.getServerTime()).toBe(1700000000000)
  })

  it("joinSession normalizes the returned snapshot", async () => {
    setRpc("join_or_resume_session", makeSnapshot())
    const snapshot = await gameService.joinSession({
      inviteCode: "ABC123",
      displayName: "Ann",
      avatarKey: "avatar-01",
    })
    expect(snapshot.session.id).toBe("session-1")
    expect(snapshot.game.questionCount).toBe(1)
  })

  it("getInviteSessionSummary returns the rpc payload", async () => {
    setRpc("get_invite_session_summary", {
      sessionId: "s-1",
      inviteCode: "ABC123",
      isJoinable: true,
    })
    const summary = await gameService.getInviteSessionSummary("ABC123")
    expect(summary.isJoinable).toBe(true)
  })

  it("hostAdvanceSessionPhase passes the expected phase", async () => {
    setRpc("host_advance_session_phase", null)
    await gameService.hostAdvanceSessionPhase("s-1", "question_active")
    expect(mockCalls.rpc.at(-1)).toMatchObject({
      name: "host_advance_session_phase",
      params: { p_session_id: "s-1", p_expected_phase: "question_active" },
    })
  })

  it("submitAnswer forwards ids and a client timestamp", async () => {
    withTestPinia()
    setRpc("submit_answer", null)
    await gameService.submitAnswer("s-1", "q-1", "o-1")
    expect(mockCalls.rpc.at(-1)).toMatchObject({
      name: "submit_answer",
      params: { p_session_id: "s-1", p_question_id: "q-1", p_option_id: "o-1" },
    })
  })

  it("propagates rpc errors", async () => {
    setRpcError("create_live_session", new Error("rpc failed"))
    await expect(gameService.startSession("game-1")).rejects.toThrow(
      "rpc failed",
    )
  })
})

describe("deleteGame", () => {
  it("moves the game to trash without deleting its media", async () => {
    setRpc("move_game_to_trash", { trashed: true })
    const result = await gameService.deleteGame("game-1")

    expect(result.trashed).toBe(true)
    expect(mockCalls.rpc.at(-1)).toMatchObject({
      name: "move_game_to_trash",
      params: { p_game_id: "game-1" },
    })
    expect(mockCalls.storage.some((c) => c.name === "remove")).toBe(false)
  })

  it("restores a trashed game", async () => {
    setRpc("restore_game_from_trash", { restored: true })
    const result = await gameService.restoreGame("game-1")
    expect(result.restored).toBe(true)
  })
})

describe("uploadQuestionMedia", () => {
  it("posts the file to the upload gate and presigns the stored path", async () => {
    setFunctionResult("upload-question-media", {
      data: { assetId: "asset-1", path: "assets/asset-1.mp3", kind: "audio" },
    })
    setFunctionResult("media-url", presigned(["assets/asset-1.mp3"]))

    const media = await gameService.uploadQuestionMedia(
      new File(["x"], "a.mp3", { type: "audio/mpeg" }),
    )

    expect(media).toMatchObject({
      kind: "audio",
      path: "assets/asset-1.mp3",
      publicUrl: "https://r2.example/assets/asset-1.mp3?signed",
    })
    expect(mockCalls.storage.some((call) => call.name === "upload")).toBe(false)
  })

  it("surfaces the quota message the gate returns", async () => {
    setFunctionResult("upload-question-media", {
      error: Object.assign(new Error("Edge Function returned 409"), {
        context: new Response(
          JSON.stringify({
            error: "Storage quota reached",
            usedBytes: 524288000,
            limitBytes: 524288000,
          }),
          { status: 409 },
        ),
      }),
    })

    await expect(
      gameService.uploadQuestionMedia(
        new File(["x"], "a.mp3", { type: "audio/mpeg" }),
      ),
    ).rejects.toThrow("Storage quota reached: 500 MB of 500 MB used.")
  })
})

describe("deleteUploadedMedia", () => {
  it("marks the assets for the reaper instead of deleting objects", async () => {
    setRpc("schedule_media_deletion", 1)
    await gameService.deleteUploadedMedia(["assets/a.png"])

    expect(mockCalls.rpc.at(-1)).toMatchObject({
      name: "schedule_media_deletion",
      params: { p_paths: ["assets/a.png"] },
    })
    expect(mockCalls.storage.some((call) => call.name === "remove")).toBe(false)
  })

  it("does nothing for an empty list", async () => {
    await gameService.deleteUploadedMedia([])
    expect(mockCalls.rpc).toEqual([])
  })
})

describe("validateQuestionMediaFile", () => {
  it("accepts allowed media types within the size limit", () => {
    const file = new File(["x"], "a.png", { type: "image/png" })
    expect(() => validateQuestionMediaFile(file)).not.toThrow()
  })

  it("rejects disallowed types", () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" })
    expect(() => validateQuestionMediaFile(file)).toThrow(
      "Upload an image, audio, or video file.",
    )
  })

  it("rejects oversized files", () => {
    const big = new File([], "a.png", { type: "image/png" })
    Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 })
    expect(() => validateQuestionMediaFile(big)).toThrow(
      "Media files must be 25 MB or smaller.",
    )
  })
})

describe("isInvalidInviteError", () => {
  it("matches the plain Error message", () => {
    expect(isInvalidInviteError(new Error("Invalid invite code"))).toBe(true)
  })

  it("matches a Postgres P0001 error object", () => {
    expect(
      isInvalidInviteError({ code: "P0001", message: "Invalid invite code" }),
    ).toBe(true)
  })

  it("matches a 400 status error", () => {
    expect(isInvalidInviteError({ status: 400, message: "bad" })).toBe(true)
  })

  it("rejects unrelated errors and non-objects", () => {
    expect(isInvalidInviteError(new Error("network"))).toBe(false)
    expect(isInvalidInviteError(null)).toBe(false)
    expect(isInvalidInviteError("nope")).toBe(false)
  })
})
