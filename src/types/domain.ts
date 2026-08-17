import type { AppLocale } from "@/i18n/locale"

export type MediaKind = "image" | "audio" | "video"
export type QuestionType = "single_choice"
export type GameMode = "classic"

export interface QuestionTypeDefinition {
  type: QuestionType
  label: string
  createDefault: () => Pick<
    QuizQuestion,
    | "prompt"
    | "durationSeconds"
    | "points"
    | "options"
    | "correctOptionId"
    | "media"
    | "revealMedia"
    | "revealText"
  >
  validate: (question: QuizQuestion) => string[]
}

export interface GameModeDefinition {
  mode: GameMode
  label: string
}

export const AVATAR_KEYS = [
  "avatar-01",
  "avatar-02",
  "avatar-03",
  "avatar-04",
  "avatar-05",
  "avatar-06",
] as const

export type AvatarKey = (typeof AVATAR_KEYS)[number]

export const DEFAULT_AVATAR_KEY: AvatarKey = "avatar-01"
export const DEFAULT_QUESTION_POINTS = 1
export const MIN_QUESTION_POINTS = 1
export const MAX_QUESTION_POINTS = 10
export const DEFAULT_SECTION_INTERMISSION_SECONDS = 10
export const MIN_SECTION_INTERMISSION_SECONDS = 0
export const MAX_SECTION_INTERMISSION_SECONDS = 300
export const DEFAULT_ANSWER_REVEAL_SECONDS = 5
export const ANSWER_TRANSITION_SECONDS = 2
export const MIN_ANSWER_REVEAL_SECONDS = 1
export const MAX_ANSWER_REVEAL_SECONDS = 300

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && AVATAR_KEYS.includes(value as AvatarKey)
}

export type SessionPhase =
  | "lobby"
  | "question_active"
  | "answer_transition"
  | "answer_reveal"
  | "round_summary"
  | "round_leaderboard"
  | "finished"

const SESSION_PHASES: readonly SessionPhase[] = [
  "lobby",
  "question_active",
  "answer_transition",
  "answer_reveal",
  "round_summary",
  "round_leaderboard",
  "finished",
]

export function isSessionPhase(value: unknown): value is SessionPhase {
  return (
    typeof value === "string" && SESSION_PHASES.includes(value as SessionPhase)
  )
}

export type LocalizedText = { text: string; sourceHash: string }
export type I18nMap = Partial<Record<AppLocale, LocalizedText | null>>

export interface QuestionOption {
  id: string
  text: string
  textI18n: I18nMap
}

export interface QuestionMedia {
  kind: MediaKind
  path: string
  publicUrl?: string
  width?: number
  height?: number
}

export interface QuizQuestion {
  id: string
  type?: QuestionType
  sectionId: string
  position: number
  prompt: string
  promptI18n: I18nMap
  durationSeconds: number
  points: number
  options: QuestionOption[]
  correctOptionId: string
  media: QuestionMedia | null
  revealMedia: QuestionMedia | null
  revealText: string | null
  revealTextI18n: I18nMap
}

export interface LiveQuizQuestion extends Omit<
  QuizQuestion,
  "correctOptionId"
> {
  correctOptionId: string | null
}

export type SectionIntermissionMode = "inherit" | "timer" | "manual"

export interface GameSection {
  id: string
  title: string
  titleI18n: I18nMap
  position: number
  questionIds: string[]
  intermissionMode: SectionIntermissionMode
  intermissionSeconds: number | null
}

export interface Game {
  id: string
  title: string
  primaryLocale: AppLocale
  titleI18n: I18nMap
  ownerId: string
  defaultQuestionPoints: number
  defaultSectionIntermissionSeconds: number
  defaultAnswerRevealSeconds: number
  manualQuestionAdvance: boolean
  createdAt: string
  updatedAt: string
  questions: QuizQuestion[]
  sections: GameSection[]
}

export interface LiveGameSummary {
  id: string
  title: string
  primaryLocale: AppLocale
  titleI18n: I18nMap
  questionCount: number
  sectionCount: number
  sections: GameSection[]
}

export interface GameStatusSummary {
  gameId: string
  title: string
  updatedAt: string
  questionCount: number
  activeSessionId: string | null
  activeInviteCode: string | null
  activePhase: SessionPhase | null
  activePlayerCount: number
  activeHostConnected: boolean
  activeSessionUpdatedAt: string | null
}

export interface SessionPlayer {
  id: string
  sessionId: string
  displayName: string
  avatarKey: AvatarKey
  avatarAssetId?: string | null
  avatarAssetPath?: string | null
  role: "host" | "player"
  joinedAt: string
  lastSeenAt: string
  isConnected: boolean
  score: number
}

export interface SessionLeaderboardEntry {
  playerId: string
  displayName: string
  avatarKey: AvatarKey
  avatarAssetId?: string | null
  avatarAssetPath?: string | null
  score: number
  rank: number
}

export interface LiveSession {
  id: string
  gameId: string
  inviteCode: string
  title: string
  hostPlayerId: string | null
  phase: SessionPhase
  currentQuestionIndex: number
  partIndex: number
  partCount: number
  currentPartStartIndex: number
  currentPartEndIndex: number
  currentSectionId: string | null
  currentSectionTitle: string | null
  sectionIndex: number
  sectionCount: number
  currentSectionStartIndex: number
  currentSectionEndIndex: number
  questionStartedAt: string | null
  questionEndsAt: string | null
  phaseStartedAt: string | null
  phaseEndsAt: string | null
  isPaused: boolean
  pausedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AnswerSubmission {
  id: string
  sessionId: string
  questionId: string
  playerId: string
  optionId: string | null
  submittedAt: string
  isCorrect: boolean
  awardedPoints: number
}

export interface SessionSnapshot {
  session: LiveSession
  game: LiveGameSummary
  players: SessionPlayer[]
  leaderboard: SessionLeaderboardEntry[]
  roundSummary: SessionRoundSummaryEntry[]
  currentQuestion: LiveQuizQuestion | null
  currentPlayerId?: string
  viewerRole?: "host" | "player" | null
  submittedOptionId?: string | null
  submittedIsCorrect?: boolean | null
  submittedPoints?: number | null
}

export interface InviteSessionSummary {
  sessionId: string
  title: string
  inviteCode: string
  phase: SessionPhase
  isJoinable: boolean
  createdAt: string
  updatedAt: string
}

export interface ResumeMetadata {
  inviteCode: string
  sessionId: string
  playerId: string
  displayName: string
  avatarKey: AvatarKey
  avatarAssetId?: string | null
  avatarAssetPath?: string | null
  role: "host" | "player"
}

export interface JoinSessionPayload {
  inviteCode: string
  displayName: string
  avatarKey: AvatarKey
  avatarAssetId?: string | null
  resumePlayerId?: string | null
}

export interface StartSessionResult {
  sessionId: string
  inviteCode: string
  reusedExisting: boolean
}

export interface SessionRoundSummaryEntry {
  playerId: string
  displayName: string
  avatarKey: AvatarKey
  avatarAssetId?: string | null
  avatarAssetPath?: string | null
  pointsGained: number
  totalScore: number
  rank: number
}

export interface PastSessionSummary {
  sessionId: string
  gameId: string
  title: string
  primaryLocale: AppLocale
  titleI18n: I18nMap
  inviteCode: string
  phase: SessionPhase
  finishedAt: string
  playerCount: number
  winnerName: string | null
  topScore: number | null
}
