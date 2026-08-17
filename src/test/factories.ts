// Reusable domain data factories. Each call returns a fresh deep object so a
// mutation in one test can't bleed into another. Consolidates the inline
// createGame()/createSnapshot() patterns from the existing tests.

import type {
  Game,
  GameSection,
  LiveGameSummary,
  LiveQuizQuestion,
  LiveSession,
  QuestionOption,
  QuizQuestion,
  SessionLeaderboardEntry,
  SessionPlayer,
  SessionRoundSummaryEntry,
  SessionSnapshot,
} from "@/types/domain"

let seq = 0
function nextId(prefix: string) {
  seq += 1
  return `${prefix}-${seq}`
}

export function makeOption(
  overrides: Partial<QuestionOption> = {},
): QuestionOption {
  return {
    id: overrides.id ?? nextId("option"),
    text: overrides.text ?? "Option",
    textI18n: overrides.textI18n ?? {},
  }
}

export function makeQuestion(
  overrides: Partial<QuizQuestion> = {},
): QuizQuestion {
  const options = overrides.options ?? [
    makeOption({ id: "option-1", text: "A" }),
    makeOption({ id: "option-2", text: "B" }),
    makeOption({ id: "option-3", text: "C" }),
    makeOption({ id: "option-4", text: "D" }),
  ]

  return {
    id: overrides.id ?? "question-1",
    type: overrides.type ?? "single_choice",
    sectionId: overrides.sectionId ?? "section-1",
    position: overrides.position ?? 0,
    prompt: overrides.prompt ?? "Prompt",
    promptI18n: overrides.promptI18n ?? {},
    durationSeconds: overrides.durationSeconds ?? 20,
    points: overrides.points ?? 1,
    options,
    correctOptionId: overrides.correctOptionId ?? options[1]?.id ?? "option-2",
    media: overrides.media ?? null,
    revealMedia: overrides.revealMedia ?? null,
    revealText: overrides.revealText ?? null,
    revealTextI18n: overrides.revealTextI18n ?? {},
  }
}

export function makeLiveQuestion(
  overrides: Partial<LiveQuizQuestion> = {},
): LiveQuizQuestion {
  const base = makeQuestion(overrides as Partial<QuizQuestion>)
  return {
    ...base,
    correctOptionId:
      overrides.correctOptionId !== undefined
        ? overrides.correctOptionId
        : base.correctOptionId,
  }
}

export function makeSection(overrides: Partial<GameSection> = {}): GameSection {
  return {
    id: overrides.id ?? "section-1",
    title: overrides.title ?? "Section 1",
    titleI18n: overrides.titleI18n ?? {},
    position: overrides.position ?? 0,
    questionIds: overrides.questionIds ?? ["question-1"],
    intermissionMode: overrides.intermissionMode ?? "inherit",
    intermissionSeconds: overrides.intermissionSeconds ?? null,
  }
}

export function makeGame(overrides: Partial<Game> = {}): Game {
  const questions = overrides.questions ?? [makeQuestion()]
  return {
    id: overrides.id ?? "game-1",
    title: overrides.title ?? "Trivia",
    primaryLocale: overrides.primaryLocale ?? "en",
    titleI18n: overrides.titleI18n ?? {},
    ownerId: overrides.ownerId ?? "owner-1",
    defaultQuestionPoints: overrides.defaultQuestionPoints ?? 1,
    defaultSectionIntermissionSeconds:
      overrides.defaultSectionIntermissionSeconds ?? 10,
    defaultAnswerRevealSeconds: overrides.defaultAnswerRevealSeconds ?? 5,
    manualQuestionAdvance: overrides.manualQuestionAdvance ?? false,
    createdAt: overrides.createdAt ?? "2026-04-29T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-29T12:00:20.000Z",
    questions,
    sections: overrides.sections ?? [makeSection()],
  }
}

export function makeGameSummary(
  overrides: Partial<LiveGameSummary> = {},
): LiveGameSummary {
  return {
    id: overrides.id ?? "game-1",
    title: overrides.title ?? "Trivia",
    primaryLocale: overrides.primaryLocale ?? "en",
    titleI18n: overrides.titleI18n ?? {},
    questionCount: overrides.questionCount ?? 1,
    sectionCount: overrides.sectionCount ?? 1,
    sections: overrides.sections ?? [makeSection()],
  }
}

export function makeSession(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    id: overrides.id ?? "session-1",
    gameId: overrides.gameId ?? "game-1",
    inviteCode: overrides.inviteCode ?? "ABC123",
    title: overrides.title ?? "Trivia",
    hostPlayerId: overrides.hostPlayerId ?? "host-1",
    phase: overrides.phase ?? "lobby",
    currentQuestionIndex: overrides.currentQuestionIndex ?? 0,
    partIndex: overrides.partIndex ?? 0,
    partCount: overrides.partCount ?? 1,
    currentPartStartIndex: overrides.currentPartStartIndex ?? 0,
    currentPartEndIndex: overrides.currentPartEndIndex ?? 0,
    currentSectionId: overrides.currentSectionId ?? "section-1",
    currentSectionTitle: overrides.currentSectionTitle ?? "Section 1",
    sectionIndex: overrides.sectionIndex ?? 0,
    sectionCount: overrides.sectionCount ?? 1,
    currentSectionStartIndex: overrides.currentSectionStartIndex ?? 0,
    currentSectionEndIndex: overrides.currentSectionEndIndex ?? 0,
    questionStartedAt: overrides.questionStartedAt ?? null,
    questionEndsAt: overrides.questionEndsAt ?? null,
    phaseStartedAt: overrides.phaseStartedAt ?? null,
    phaseEndsAt: overrides.phaseEndsAt ?? null,
    isPaused: overrides.isPaused ?? false,
    pausedAt: overrides.pausedAt ?? null,
    finishedAt: overrides.finishedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-04-29T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-29T12:00:20.000Z",
  }
}

export function makePlayer(
  overrides: Partial<SessionPlayer> = {},
): SessionPlayer {
  return {
    id: overrides.id ?? "player-1",
    sessionId: overrides.sessionId ?? "session-1",
    displayName: overrides.displayName ?? "Player One",
    avatarKey: overrides.avatarKey ?? "avatar-01",
    role: overrides.role ?? "player",
    joinedAt: overrides.joinedAt ?? "2026-04-29T12:00:00.000Z",
    lastSeenAt: overrides.lastSeenAt ?? "2026-04-29T12:00:05.000Z",
    isConnected: overrides.isConnected ?? true,
    score: overrides.score ?? 0,
  }
}

export function makeLeaderboardEntry(
  overrides: Partial<SessionLeaderboardEntry> = {},
): SessionLeaderboardEntry {
  return {
    playerId: overrides.playerId ?? "player-1",
    displayName: overrides.displayName ?? "Player One",
    avatarKey: overrides.avatarKey ?? "avatar-01",
    score: overrides.score ?? 0,
    rank: overrides.rank ?? 1,
  }
}

export function makeRoundSummaryEntry(
  overrides: Partial<SessionRoundSummaryEntry> = {},
): SessionRoundSummaryEntry {
  return {
    playerId: overrides.playerId ?? "player-1",
    displayName: overrides.displayName ?? "Player One",
    avatarKey: overrides.avatarKey ?? "avatar-01",
    pointsGained: overrides.pointsGained ?? 0,
    totalScore: overrides.totalScore ?? 0,
    rank: overrides.rank ?? 1,
  }
}

export function makeSnapshot(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    session: overrides.session ?? makeSession(),
    game: overrides.game ?? makeGameSummary(),
    players: overrides.players ?? [],
    leaderboard: overrides.leaderboard ?? [],
    roundSummary: overrides.roundSummary ?? [],
    currentQuestion:
      overrides.currentQuestion !== undefined
        ? overrides.currentQuestion
        : makeLiveQuestion(),
    currentPlayerId: overrides.currentPlayerId,
    viewerRole: overrides.viewerRole,
    submittedOptionId: overrides.submittedOptionId,
    submittedIsCorrect: overrides.submittedIsCorrect,
    submittedPoints: overrides.submittedPoints,
  }
}
