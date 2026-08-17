import {
  DEFAULT_AVATAR_KEY,
  type AvatarKey,
  type Game,
  type QuizQuestion,
  type SessionPhase,
  type SessionLeaderboardEntry,
  type SessionRoundSummaryEntry,
} from "@/types/domain"

export const WALKTHROUGH_PHASE_DURATIONS_MS = {
  answer_transition: 2000,
  answer_reveal: 5000,
  round_summary: 4000,
  round_leaderboard: 6000,
} as const

type WalkthroughPhase = Exclude<SessionPhase, "lobby">

export interface WalkthroughParticipant {
  playerId: string
  displayName: string
  avatarKey: AvatarKey
}

export interface WalkthroughAnswerRecord {
  questionId: string
  sectionId: string
  optionId: string
  isCorrect: boolean
  awardedPoints: number
}

export interface WalkthroughState {
  game: Game
  participant: WalkthroughParticipant
  phase: WalkthroughPhase
  currentQuestionIndex: number
  currentSectionIndex: number
  answers: WalkthroughAnswerRecord[]
  score: number
  submittedOptionId: string | null
  submittedIsCorrect: boolean | null
  submittedPoints: number | null
  phaseStartedAtMs: number
  phaseEndsAtMs: number | null
  finishedAtMs: number | null
}

type WalkthroughTransitionInput = {
  phase: WalkthroughPhase
  questionIndex: number
  sectionIndex: number
  answers: WalkthroughAnswerRecord[]
  score: number
  submittedOptionId: string | null
  submittedIsCorrect: boolean | null
  submittedPoints: number | null
  phaseStartedAtMs: number
  phaseEndsAtMs: number | null
  finishedAtMs: number | null
}

export function buildWalkthroughParticipant(
  email: string | null | undefined,
): WalkthroughParticipant {
  const localPart = email?.split("@")[0]?.trim()

  return {
    playerId: "host-preview",
    displayName: localPart || "Host Preview",
    avatarKey: DEFAULT_AVATAR_KEY,
  }
}

export function createWalkthroughState(
  game: Game,
  participant: WalkthroughParticipant,
  now = Date.now(),
): WalkthroughState {
  if (!game.questions.length) {
    throw new Error("A walkthrough requires at least one question")
  }

  return buildQuestionState({
    game,
    participant,
    questionIndex: 0,
    answers: [],
    score: 0,
    now,
  })
}

export function restartWalkthrough(state: WalkthroughState, now = Date.now()) {
  return createWalkthroughState(state.game, state.participant, now)
}

export function getWalkthroughCurrentQuestion(state: WalkthroughState) {
  if (
    state.phase !== "question_active" &&
    state.phase !== "answer_transition" &&
    state.phase !== "answer_reveal" &&
    state.phase !== "finished"
  ) {
    return null
  }

  return state.game.questions[state.currentQuestionIndex] ?? null
}

export function getWalkthroughSectionTitle(state: WalkthroughState) {
  return state.game.sections[state.currentSectionIndex]?.title ?? null
}

export function getWalkthroughRoundNumber(state: WalkthroughState) {
  return state.currentSectionIndex + 1
}

export function getWalkthroughRoundTotal(state: WalkthroughState) {
  return state.game.sections.length
}

export function getWalkthroughQuestionNumber(state: WalkthroughState) {
  return state.currentQuestionIndex + 1
}

export function getWalkthroughQuestionTotal(state: WalkthroughState) {
  return state.game.questions.length
}

export function getWalkthroughRoundSummary(
  state: WalkthroughState,
): SessionRoundSummaryEntry[] {
  const section = state.game.sections[state.currentSectionIndex]
  if (!section) return []

  const pointsGained = state.answers
    .filter((answer) => answer.sectionId === section.id)
    .reduce((total, answer) => total + answer.awardedPoints, 0)

  return [
    {
      playerId: state.participant.playerId,
      displayName: state.participant.displayName,
      avatarKey: state.participant.avatarKey,
      pointsGained,
      totalScore: state.score,
      rank: 1,
    },
  ]
}

export function getWalkthroughLeaderboard(
  state: WalkthroughState,
): SessionLeaderboardEntry[] {
  return [
    {
      playerId: state.participant.playerId,
      displayName: state.participant.displayName,
      avatarKey: state.participant.avatarKey,
      score: state.score,
      rank: 1,
    },
  ]
}

export function canSubmitWalkthroughAnswer(
  state: WalkthroughState,
  now = Date.now(),
) {
  return (
    state.phase === "question_active" &&
    state.submittedOptionId == null &&
    state.phaseEndsAtMs != null &&
    state.phaseEndsAtMs > now
  )
}

export function submitWalkthroughAnswer(
  state: WalkthroughState,
  optionId: string,
  now = Date.now(),
) {
  const synced = syncWalkthroughState(state, now)
  if (!canSubmitWalkthroughAnswer(synced, now)) return synced

  const question = synced.game.questions[synced.currentQuestionIndex]
  if (!question) return synced

  const isCorrect = question.correctOptionId === optionId
  const awardedPoints = isCorrect ? question.points : 0

  return {
    ...synced,
    answers: [
      ...synced.answers,
      {
        questionId: question.id,
        sectionId: question.sectionId,
        optionId,
        isCorrect,
        awardedPoints,
      },
    ],
    score: synced.score + awardedPoints,
    submittedOptionId: optionId,
    submittedIsCorrect: isCorrect,
    submittedPoints: awardedPoints,
  }
}

export function advanceWalkthroughState(
  state: WalkthroughState,
  now = Date.now(),
) {
  const synced = syncWalkthroughState(state, now)
  if (synced.phase === "finished") return synced

  return advanceFromCurrentPhase(synced, now)
}

export function syncWalkthroughState(
  state: WalkthroughState,
  now = Date.now(),
) {
  let nextState = state

  while (
    nextState.phase !== "finished" &&
    nextState.phaseEndsAtMs != null &&
    nextState.phaseEndsAtMs <= now
  ) {
    nextState = advanceFromCurrentPhase(nextState, nextState.phaseEndsAtMs)
  }

  return nextState
}

export function getWalkthroughAdvanceLabelKey(state: WalkthroughState) {
  if (state.phase === "question_active") return "walkthroughView.showAnswer"
  if (state.phase === "answer_transition") return "walkthroughView.showAnswer"
  if (state.phase === "answer_reveal") {
    if (state.currentQuestionIndex + 1 >= state.game.questions.length) {
      return "walkthroughView.showResults"
    }
    return isLastQuestionInSection(state.game, state.currentQuestionIndex)
      ? "walkthroughView.showRoundScores"
      : "walkthroughView.nextQuestion"
  }
  if (state.phase === "round_summary") {
    return "walkthroughView.showLeaderboard"
  }
  if (state.phase === "round_leaderboard") {
    return state.currentQuestionIndex + 1 >= state.game.questions.length
      ? "walkthroughView.showResults"
      : "walkthroughView.nextQuestion"
  }

  return "walkthroughView.restart"
}

function advanceFromCurrentPhase(state: WalkthroughState, now: number) {
  if (state.phase === "question_active") {
    return buildTimedPhaseState(state, "answer_transition", now)
  }

  if (state.phase === "answer_transition") {
    return buildTimedPhaseState(state, "answer_reveal", now)
  }

  if (state.phase === "answer_reveal") {
    if (state.currentQuestionIndex + 1 >= state.game.questions.length) {
      return buildFinishedState(state, now)
    }

    if (isLastQuestionInSection(state.game, state.currentQuestionIndex)) {
      return buildTimedPhaseState(state, "round_summary", now)
    }

    return buildQuestionState({
      game: state.game,
      participant: state.participant,
      questionIndex: state.currentQuestionIndex + 1,
      answers: state.answers,
      score: state.score,
      now,
    })
  }

  if (state.phase === "round_summary") {
    return buildTimedPhaseState(state, "round_leaderboard", now)
  }

  if (state.phase === "round_leaderboard") {
    if (state.currentQuestionIndex + 1 >= state.game.questions.length) {
      return buildFinishedState(state, now)
    }

    return buildQuestionState({
      game: state.game,
      participant: state.participant,
      questionIndex: state.currentQuestionIndex + 1,
      answers: state.answers,
      score: state.score,
      now,
    })
  }

  return state
}

function buildFinishedState(state: WalkthroughState, now: number) {
  return buildState(state.game, state.participant, {
    phase: "finished",
    questionIndex: state.currentQuestionIndex,
    sectionIndex: state.currentSectionIndex,
    answers: state.answers,
    score: state.score,
    submittedOptionId: state.submittedOptionId,
    submittedIsCorrect: state.submittedIsCorrect,
    submittedPoints: state.submittedPoints,
    phaseStartedAtMs: now,
    phaseEndsAtMs: null,
    finishedAtMs: now,
  })
}

function buildQuestionState(input: {
  game: Game
  participant: WalkthroughParticipant
  questionIndex: number
  answers: WalkthroughAnswerRecord[]
  score: number
  now: number
}) {
  const question = input.game.questions[input.questionIndex]
  if (!question) {
    throw new Error("Question is not available for this walkthrough state")
  }

  return buildState(input.game, input.participant, {
    phase: "question_active",
    questionIndex: input.questionIndex,
    sectionIndex: findSectionIndexForQuestion(input.game, input.questionIndex),
    answers: input.answers,
    score: input.score,
    submittedOptionId: null,
    submittedIsCorrect: null,
    submittedPoints: null,
    phaseStartedAtMs: input.now,
    phaseEndsAtMs: input.now + question.durationSeconds * 1000,
    finishedAtMs: null,
  })
}

function buildTimedPhaseState(
  state: WalkthroughState,
  phase:
    | "answer_transition"
    | "answer_reveal"
    | "round_summary"
    | "round_leaderboard",
  now: number,
) {
  return buildState(state.game, state.participant, {
    phase,
    questionIndex: state.currentQuestionIndex,
    sectionIndex: state.currentSectionIndex,
    answers: state.answers,
    score: state.score,
    submittedOptionId: state.submittedOptionId,
    submittedIsCorrect: state.submittedIsCorrect,
    submittedPoints: state.submittedPoints,
    phaseStartedAtMs: now,
    phaseEndsAtMs: now + WALKTHROUGH_PHASE_DURATIONS_MS[phase],
    finishedAtMs: null,
  })
}

function buildState(
  game: Game,
  participant: WalkthroughParticipant,
  input: WalkthroughTransitionInput,
) {
  return {
    game,
    participant,
    phase: input.phase,
    currentQuestionIndex: input.questionIndex,
    currentSectionIndex: input.sectionIndex,
    answers: input.answers,
    score: input.score,
    submittedOptionId: input.submittedOptionId,
    submittedIsCorrect: input.submittedIsCorrect,
    submittedPoints: input.submittedPoints,
    phaseStartedAtMs: input.phaseStartedAtMs,
    phaseEndsAtMs: input.phaseEndsAtMs,
    finishedAtMs: input.finishedAtMs,
  } satisfies WalkthroughState
}

function findSectionIndexForQuestion(game: Game, questionIndex: number) {
  const question = game.questions[questionIndex]
  if (!question) return 0

  const sectionIndex = game.sections.findIndex((section) =>
    section.questionIds.includes(question.id),
  )

  return sectionIndex >= 0 ? sectionIndex : 0
}

function isLastQuestionInSection(game: Game, questionIndex: number) {
  const question = game.questions[questionIndex]
  if (!question) return false

  const section = game.sections.find((entry) =>
    entry.questionIds.includes(question.id),
  )

  return section?.questionIds.at(-1) === question.id
}

export function getWalkthroughOutcomeLabel(
  state: WalkthroughState,
  question: QuizQuestion | null,
) {
  if (!question || state.submittedOptionId == null)
    return "walkthroughView.noAnswer"
  return state.submittedIsCorrect
    ? "playView.correctAnswer"
    : "playView.incorrectAnswer"
}
