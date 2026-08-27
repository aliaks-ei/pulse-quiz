import { serverNow } from "@/stores/serverClock"
import { normalizeAvatarImage } from "@/lib/avatarUpload"
import { detectMediaKind } from "@/lib/mediaKind"
import { defaultAppLocale, type AppLocale } from "@/i18n/locale"
import { readMediaDimensions } from "@/lib/mediaDimensions"
import { resolveMediaUrls, type MediaUrlOptions } from "@/lib/mediaUrl"
import { supabase } from "@/services/supabase"
import type {
  GameQuestionRow,
  GameSectionRow,
  GameWithQuestionsRow,
  GameStatusRow,
  I18nMapRow,
  PastSessionRow,
} from "@/types/dbRows"
import type {
  Game,
  GameSection,
  GameStatusSummary,
  I18nMap,
  InviteSessionSummary,
  JoinSessionPayload,
  LocalizedText,
  PastSessionSummary,
  QuestionMedia,
  SessionSnapshot,
  StartSessionResult,
} from "@/types/domain"
import {
  DEFAULT_ANSWER_REVEAL_SECONDS,
  DEFAULT_QUESTION_POINTS as DEFAULT_POINTS,
  DEFAULT_SECTION_INTERMISSION_SECONDS,
} from "@/types/domain"

const MAX_QUESTION_MEDIA_BYTES = 25 * 1024 * 1024
const ALLOWED_MEDIA_TYPE_PREFIXES = ["image/", "audio/", "video/"] as const

export type UploadedAvatarAsset = {
  id: string
  objectPath: string
}

function isAllowedQuestionMediaType(file: File) {
  return ALLOWED_MEDIA_TYPE_PREFIXES.some((prefix) =>
    file.type.startsWith(prefix),
  )
}

export function validateQuestionMediaFile(file: File) {
  if (!isAllowedQuestionMediaType(file)) {
    throw new Error("Upload an image, audio, or video file.")
  }

  if (file.size > MAX_QUESTION_MEDIA_BYTES) {
    throw new Error("Media files must be 25 MB or smaller.")
  }
}

type UploadedQuestionMedia = {
  assetId: string
  path: string
  kind: QuestionMedia["kind"]
  width?: number
  height?: number
}

function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

// The upload gate answers with a JSON body the browser should show verbatim,
// so unwrap it rather than surfacing supabase-js's generic status message.
async function readFunctionError(error: unknown): Promise<Error> {
  const fallback =
    error instanceof Error ? error : new Error("Media upload failed.")
  const response = (error as { context?: unknown } | null)?.context
  if (!(response instanceof Response)) return fallback

  let body: {
    error?: unknown
    usedBytes?: unknown
    limitBytes?: unknown
  } = {}

  try {
    body = await response.clone().json()
  } catch {
    return fallback
  }

  if (
    response.status === 409 &&
    typeof body.usedBytes === "number" &&
    typeof body.limitBytes === "number"
  ) {
    return new Error(
      `Storage quota reached: ${formatMegabytes(body.usedBytes)} of ${formatMegabytes(body.limitBytes)} used. Remove some media first.`,
    )
  }

  return typeof body.error === "string" ? new Error(body.error) : fallback
}

// Question media lives in a private bucket, so a row carries a path and the
// playable URL is minted per caller. Paths are gathered per game or per snapshot
// and resolved in one batch, then attached synchronously from the result.
function collectMediaPaths(
  medias: Array<QuestionMedia | null | undefined>,
): string[] {
  const paths = new Set<string>()

  for (const media of medias) {
    if (media?.path && !media.publicUrl) paths.add(media.path)
  }

  return [...paths]
}

function attachMediaUrl(
  media: QuestionMedia | null,
  urls: Map<string, string>,
) {
  if (!media?.path || media.publicUrl) return media

  const publicUrl = urls.get(media.path)
  return publicUrl ? { ...media, publicUrl } : media
}

async function resolveMedia(
  medias: Array<QuestionMedia | null | undefined>,
  options: MediaUrlOptions = {},
) {
  const paths = collectMediaPaths(medias)
  if (!paths.length) return new Map<string, string>()
  return resolveMediaUrls(paths, options)
}

function normalizeI18nMap(row: I18nMapRow | undefined): I18nMap {
  if (!row) return {}

  const result: I18nMap = {}
  for (const [locale, entry] of Object.entries(row)) {
    const key = locale as keyof I18nMap
    if (!entry) {
      result[key] = null
      continue
    }

    result[key] = {
      text: entry.text,
      sourceHash: entry.source_hash,
    } satisfies LocalizedText
  }

  return result
}

function denormalizeI18nMap(
  map: I18nMap,
): Record<string, { text: string; source_hash: string } | null> {
  const result: Record<string, { text: string; source_hash: string } | null> =
    {}

  for (const [locale, entry] of Object.entries(map)) {
    result[locale] = entry
      ? { text: entry.text, source_hash: entry.sourceHash }
      : null
  }

  return result
}

function normalizeQuestionRecord(
  question: GameQuestionRow,
  urls: Map<string, string>,
) {
  return {
    id: question.id,
    type: "single_choice" as const,
    sectionId: question.section_id,
    position: question.position,
    prompt: question.prompt,
    promptI18n: normalizeI18nMap(question.prompt_i18n),
    durationSeconds: question.duration_seconds,
    points: question.points ?? DEFAULT_POINTS,
    correctOptionId: question.correct_option_id,
    media: attachMediaUrl(question.media, urls),
    revealMedia: attachMediaUrl(question.reveal_media, urls),
    revealText: question.reveal_text,
    revealTextI18n: normalizeI18nMap(question.reveal_text_i18n),
    options: (question.options ?? []).map((option) => ({
      id: option.id,
      text: option.text,
      textI18n: normalizeI18nMap(option.text_i18n),
    })),
  }
}

function deriveSections(
  questions: Game["questions"],
  rawSections?: GameSectionRow[],
): GameSection[] {
  if (rawSections?.length) {
    const validQuestionIds = new Set(questions.map((question) => question.id))
    return rawSections
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section, index) => {
        const questionIds =
          section.question_ids ??
          (section.questions ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((question) => question.id)

        return {
          id: section.id,
          title: section.title,
          titleI18n: normalizeI18nMap(section.title_i18n),
          position: section.position ?? index,
          questionIds: questionIds.filter((questionId) =>
            validQuestionIds.has(questionId),
          ),
          intermissionMode: section.intermission_mode ?? "inherit",
          intermissionSeconds: section.intermission_seconds ?? null,
        }
      })
  }

  const fallbackQuestions = questions.map((question) => question.id)

  return [
    {
      id: questions[0]?.sectionId ?? `${questions[0]?.id ?? "default"}-section`,
      title: "Section 1",
      titleI18n: {},
      position: 0,
      questionIds: fallbackQuestions,
      intermissionMode: "inherit",
      intermissionSeconds: null,
    },
  ]
}

function normalizeGameRecord(
  row: GameWithQuestionsRow,
  urls: Map<string, string>,
): Game {
  const questions = (row.questions ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((question) => normalizeQuestionRecord(question, urls))

  return {
    id: row.id,
    title: row.title,
    primaryLocale: (row.primary_locale ?? defaultAppLocale) as AppLocale,
    titleI18n: normalizeI18nMap(row.title_i18n),
    ownerId: row.owner_id,
    defaultQuestionPoints: row.default_question_points ?? DEFAULT_POINTS,
    defaultSectionIntermissionSeconds:
      row.default_section_intermission_seconds ??
      DEFAULT_SECTION_INTERMISSION_SECONDS,
    defaultAnswerRevealSeconds:
      row.default_answer_reveal_seconds ?? DEFAULT_ANSWER_REVEAL_SECONDS,
    manualQuestionAdvance: Boolean(row.manual_question_advance),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questions,
    sections: deriveSections(questions, row.sections),
  }
}

async function normalizeGameRecords(
  rows: GameWithQuestionsRow[],
): Promise<Game[]> {
  const urls = await resolveMedia(
    rows.flatMap((row) =>
      (row.questions ?? []).flatMap((question) => [
        question.media,
        question.reveal_media,
      ]),
    ),
  )

  return rows.map((row) => normalizeGameRecord(row, urls))
}

function normalizeGameStatusRecord(row: GameStatusRow): GameStatusSummary {
  return {
    gameId: row.game_id,
    title: row.title,
    updatedAt: row.updated_at,
    questionCount: row.question_count ?? 0,
    activeSessionId: row.active_session_id ?? null,
    activeInviteCode: row.active_invite_code ?? null,
    activePhase: row.active_phase ?? null,
    activePlayerCount: row.active_player_count ?? 0,
    activeHostConnected: Boolean(row.active_host_connected),
    activeSessionUpdatedAt: row.active_session_updated_at ?? null,
  }
}

function normalizePastSessionRecord(row: PastSessionRow): PastSessionSummary {
  return {
    sessionId: row.session_id,
    gameId: row.game_id,
    title: row.title,
    primaryLocale: (row.primary_locale ?? defaultAppLocale) as AppLocale,
    titleI18n: normalizeI18nMap(row.title_i18n),
    inviteCode: row.invite_code,
    phase: row.phase,
    finishedAt: row.finished_at,
    playerCount: row.player_count ?? 0,
    winnerName: row.winner_name ?? null,
    topScore: row.top_score ?? null,
  }
}

// Classifies the "invite code is invalid / no longer joinable" failure from
// get_invite_session_summary. Supabase raises it as a Postgres error object
// (code P0001), but some callers see it re-thrown as a plain Error, so both
// shapes are handled here in one place.
export function isInvalidInviteError(error: unknown): boolean {
  if (error instanceof Error && error.message === "Invalid invite code") {
    return true
  }

  if (typeof error !== "object" || error === null) return false

  const inviteError = error as {
    code?: unknown
    message?: unknown
    status?: unknown
  }
  const status = Number(inviteError.status)
  const code = typeof inviteError.code === "string" ? inviteError.code : null
  const message =
    typeof inviteError.message === "string" ? inviteError.message : ""

  return (
    status === 400 || (code === "P0001" && /invalid invite code/i.test(message))
  )
}

export async function normalizeSnapshot(
  snapshot: SessionSnapshot,
): Promise<SessionSnapshot> {
  const question = snapshot.currentQuestion
  // The session id narrows the participant check, so a player only ever gets
  // URLs for the room they are actually in.
  const urls = await resolveMedia([question?.media, question?.revealMedia], {
    sessionId: snapshot.session?.id ?? null,
  })

  const currentQuestion = question
    ? ({
        ...question,
        media: attachMediaUrl(question.media, urls),
        revealMedia: attachMediaUrl(question.revealMedia, urls),
      } satisfies SessionSnapshot["currentQuestion"])
    : null

  return {
    ...snapshot,
    game: {
      ...snapshot.game,
      questionCount: snapshot.game.questionCount ?? 0,
      sectionCount: snapshot.game.sectionCount ?? snapshot.game.sections.length,
    },
    currentQuestion,
  }
}

export const gameService = {
  async listGames() {
    const { data, error } = await supabase
      .from("games_with_questions")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })

    if (error) throw error
    return normalizeGameRecords((data ?? []) as GameWithQuestionsRow[])
  },

  async getGame(gameId: string) {
    const { data, error } = await supabase
      .from("games_with_questions")
      .select("*")
      .eq("id", gameId)
      .is("deleted_at", null)
      .single()

    if (error) throw error
    const [game] = await normalizeGameRecords([data as GameWithQuestionsRow])
    return game
  },

  async listOwnedGameStatuses(
    options: { limit?: number; offset?: number } = {},
  ) {
    const { data, error } = await supabase.rpc("list_owned_games_with_status", {
      p_limit: options.limit ?? 50,
      p_offset: options.offset ?? 0,
    })

    if (error) throw error
    return (data ?? []).map(normalizeGameStatusRecord)
  },

  async getGameStatus(gameId: string) {
    const { data, error } = await supabase.rpc("get_owned_game_status", {
      p_game_id: gameId,
    })

    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row ? normalizeGameStatusRecord(row as GameStatusRow) : null
  },

  async listPastSessions(options: { limit?: number; offset?: number } = {}) {
    const { data, error } = await supabase.rpc("list_past_sessions", {
      p_limit: options.limit ?? 25,
      p_offset: options.offset ?? 0,
    })

    if (error) throw error
    return (data ?? []).map(normalizePastSessionRecord)
  },

  async saveGame(
    game: Pick<
      Game,
      | "id"
      | "title"
      | "primaryLocale"
      | "titleI18n"
      | "defaultQuestionPoints"
      | "defaultSectionIntermissionSeconds"
      | "defaultAnswerRevealSeconds"
      | "manualQuestionAdvance"
      | "questions"
      | "sections"
    >,
  ) {
    const questionsById = new Map(
      game.questions.map((question) => [question.id, question]),
    )
    const sections = game.sections.map((section, sectionIndex) => ({
      id: section.id,
      title: section.title,
      titleI18n: denormalizeI18nMap(section.titleI18n),
      position: sectionIndex,
      intermissionMode: section.intermissionMode,
      intermissionSeconds:
        section.intermissionMode === "timer"
          ? section.intermissionSeconds
          : null,
      questions: section.questionIds
        .map((questionId) => questionsById.get(questionId))
        .filter((question) => question != null)
        .map((question) => ({
          ...question,
          sectionId: section.id,
          promptI18n: denormalizeI18nMap(question.promptI18n),
          revealTextI18n: denormalizeI18nMap(question.revealTextI18n),
          options: question.options.map((option) => ({
            ...option,
            textI18n: denormalizeI18nMap(option.textI18n),
          })),
        })),
    }))

    const { data, error } = await supabase.rpc("upsert_game_with_questions", {
      p_game_id: game.id || null,
      p_title: game.title,
      p_questions: {
        primaryLocale: game.primaryLocale,
        titleI18n: denormalizeI18nMap(game.titleI18n),
        defaultQuestionPoints: game.defaultQuestionPoints,
        defaultSectionIntermissionSeconds:
          game.defaultSectionIntermissionSeconds,
        defaultAnswerRevealSeconds: game.defaultAnswerRevealSeconds,
        manualQuestionAdvance: game.manualQuestionAdvance,
        sections,
      },
    })

    if (error) throw error
    const gameId = data as string

    const { error: revealSettingsError } = await supabase.rpc(
      "set_game_answer_reveal_settings",
      {
        p_game_id: gameId,
        p_manual_question_advance: game.manualQuestionAdvance,
        p_seconds: game.defaultAnswerRevealSeconds,
      },
    )

    if (revealSettingsError) throw revealSettingsError
    return gameId
  },

  async setGamePrimaryLocale(gameId: string, locale: AppLocale) {
    const { error } = await supabase.rpc("set_game_primary_locale", {
      p_game_id: gameId,
      p_locale: locale,
    })

    if (error) throw error
  },

  async deleteGame(gameId: string) {
    const { data, error } = await supabase.rpc("move_game_to_trash", {
      p_game_id: gameId,
    })

    if (error) throw error
    return data as { trashed: boolean }
  },

  async restoreGame(gameId: string) {
    const { data, error } = await supabase.rpc("restore_game_from_trash", {
      p_game_id: gameId,
    })

    if (error) throw error
    return data as { restored: boolean }
  },

  async getMyEntitlements() {
    const { data, error } = await supabase.rpc("get_my_entitlements")
    if (error) throw error
    return data as {
      planKey: string
      maxActiveRoomsPerAccount: number | null
      maxPlayersPerRoom: number | null
      maxStorageBytes: number | null
      usedStorageBytes: number
    }
  },

  async cancelSession(sessionId: string) {
    const { error } = await supabase.rpc("cancel_session", {
      p_session_id: sessionId,
    })

    if (error) throw error
  },

  async uploadQuestionMedia(file: File) {
    validateQuestionMediaFile(file)

    const kind = detectMediaKind(file)
    const dimensions = await readMediaDimensions(file, { kind })
    const body = new FormData()
    body.append("file", file, file.name)
    if (dimensions) {
      body.append("width", String(dimensions.width))
      body.append("height", String(dimensions.height))
    }

    const { data, error } = await supabase.functions.invoke(
      "upload-question-media",
      { body },
    )

    if (error) throw await readFunctionError(error)

    const asset = data as Partial<UploadedQuestionMedia> | null
    if (!asset?.path || !asset.kind) {
      throw new Error("Media upload returned an invalid response.")
    }

    // The bucket is private, so a playable URL has to be minted rather than
    // derived. Resolving here keeps the builder preview working immediately.
    const urls = await resolveMediaUrls([asset.path])

    return {
      kind: asset.kind,
      path: asset.path,
      ...(urls.get(asset.path) ? { publicUrl: urls.get(asset.path) } : {}),
      ...(dimensions ?? {}),
    } satisfies QuestionMedia
  },

  async deleteUploadedMedia(paths: string[]) {
    if (!paths.length) return

    // The browser cannot reach R2. Marking the asset frees the account's quota
    // now and hands the object itself to the reaper.
    const { error } = await supabase.rpc("schedule_media_deletion", {
      p_paths: paths,
    })

    if (error) throw error
  },

  async uploadPlayerAvatar(file: File): Promise<UploadedAvatarAsset> {
    const normalizedFile = await normalizeAvatarImage(file)
    const body = new FormData()
    body.append("avatar", normalizedFile, normalizedFile.name)

    const { data, error } = await supabase.functions.invoke("upload-avatar", {
      body,
    })

    if (error) throw error

    const asset = data as Partial<UploadedAvatarAsset> | null
    if (!asset?.id || !asset.objectPath) {
      throw new Error("Avatar upload returned an invalid response.")
    }

    return { id: asset.id, objectPath: asset.objectPath }
  },

  async listPlayerAvatars(): Promise<UploadedAvatarAsset[]> {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, object_path")
      .eq("bucket_id", "player-avatars")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(10)

    if (error) throw error

    return (data ?? []).flatMap((asset) => {
      if (
        !asset ||
        typeof asset.id !== "string" ||
        typeof asset.object_path !== "string"
      ) {
        return []
      }

      return [{ id: asset.id, objectPath: asset.object_path }]
    })
  },

  async startSession(gameId: string) {
    const { data, error } = await supabase.rpc("create_live_session", {
      p_game_id: gameId,
    })

    if (error) throw error
    return data as StartSessionResult
  },

  async getInviteSessionSummary(inviteCode: string) {
    const { data, error } = await supabase.rpc("get_invite_session_summary", {
      p_invite_code: inviteCode,
    })

    if (error) throw error
    return data as InviteSessionSummary
  },

  async joinSession(payload: JoinSessionPayload) {
    const { data, error } = await supabase.rpc("join_or_resume_session", {
      p_invite_code: payload.inviteCode,
      p_display_name: payload.displayName,
      p_avatar_key: payload.avatarKey,
      p_resume_player_id: payload.resumePlayerId ?? null,
      p_avatar_asset_id: payload.avatarAssetId ?? null,
    })

    if (error) throw error
    return normalizeSnapshot(data as SessionSnapshot)
  },

  async getServerTime() {
    const { data, error } = await supabase.rpc("get_server_time")
    if (error) throw error
    return Number(data)
  },

  async getSessionSnapshot(sessionId: string) {
    const { data, error } = await supabase.rpc("get_session_snapshot", {
      p_session_id: sessionId,
    })

    if (error) throw error
    return normalizeSnapshot(data as SessionSnapshot)
  },

  async startGameplay(sessionId: string) {
    const { error } = await supabase.rpc("start_gameplay", {
      p_session_id: sessionId,
    })
    if (error) throw error
  },

  async hostAdvanceSessionPhase(sessionId: string, expectedPhase?: string) {
    const { error } = await supabase.rpc("host_advance_session_phase", {
      p_session_id: sessionId,
      p_expected_phase: expectedPhase ?? null,
    })
    if (error) throw error
  },

  async pauseSessionFlow(sessionId: string) {
    const { error } = await supabase.rpc("pause_session_flow", {
      p_session_id: sessionId,
    })
    if (error) throw error
  },

  async resumeSessionFlow(sessionId: string) {
    const { error } = await supabase.rpc("resume_session_flow", {
      p_session_id: sessionId,
    })
    if (error) throw error
  },

  async submitAnswer(sessionId: string, questionId: string, optionId: string) {
    const { error } = await supabase.rpc("submit_answer", {
      p_session_id: sessionId,
      p_question_id: questionId,
      p_option_id: optionId,
      p_client_submitted_at_ms: serverNow(),
    })

    if (error) throw error
  },

  async updateSessionPresence(
    sessionId: string,
    playerId?: string | null,
    isConnected = true,
  ) {
    const { data, error } = await supabase.rpc("update_session_presence", {
      p_session_id: sessionId,
      p_player_id: playerId ?? null,
      p_is_connected: isConnected,
    })

    if (error) throw error
    return data as string | null
  },
}
