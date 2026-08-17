import type {
  QuestionMedia,
  SectionIntermissionMode,
  SessionPhase,
} from "@/types/domain"

export type LocalizedTextRow = { text: string; source_hash: string }
export type I18nMapRow = Record<string, LocalizedTextRow | null> | null

export interface GameQuestionRow {
  id: string
  section_id: string
  position: number
  prompt: string
  prompt_i18n?: I18nMapRow
  duration_seconds: number
  points: number | null
  correct_option_id: string
  media: QuestionMedia | null
  reveal_media: QuestionMedia | null
  reveal_text: string | null
  reveal_text_i18n?: I18nMapRow
  options: Array<{
    id: string
    text: string
    text_i18n?: I18nMapRow
  }>
}

export interface GameSectionRow {
  id: string
  position: number
  title: string
  title_i18n?: I18nMapRow
  intermission_mode?: SectionIntermissionMode | null
  intermission_seconds?: number | null
  question_ids?: string[]
  questions?: GameQuestionRow[]
}

export interface GameWithQuestionsRow {
  id: string
  title: string
  primary_locale?: string | null
  title_i18n?: I18nMapRow
  owner_id: string
  default_question_points: number | null
  default_section_intermission_seconds: number | null
  default_answer_reveal_seconds?: number | null
  manual_question_advance?: boolean | null
  created_at: string
  updated_at: string
  questions: GameQuestionRow[]
  sections?: GameSectionRow[]
}

export interface GameStatusRow {
  game_id: string
  title: string
  updated_at: string
  question_count: number | null
  active_session_id: string | null
  active_invite_code: string | null
  active_phase: SessionPhase | null
  active_player_count: number | null
  active_host_connected: boolean | null
  active_session_updated_at: string | null
}

export interface PastSessionRow {
  session_id: string
  game_id: string
  title: string
  primary_locale?: string | null
  title_i18n?: I18nMapRow
  invite_code: string
  phase: SessionPhase
  finished_at: string
  player_count: number | null
  winner_name: string | null
  top_score: number | null
}
