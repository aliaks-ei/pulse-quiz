import { translate } from "@/i18n"
import type { SessionPhase } from "@/types/domain"

export const pageTitleKeys = {
  auth: "titles.auth",
  authCallback: "titles.authCallback",
  library: "titles.library",
  history: "titles.history",
  newQuiz: "titles.newQuiz",
  editQuiz: "titles.editQuiz",
  quiz: "titles.quiz",
  walkthrough: "titles.walkthrough",
  join: "titles.join",
  roomUnavailable: "titles.roomUnavailable",
  notFound: "titles.notFound",
  lobby: "titles.lobby",
  play: "titles.play",
  results: "titles.results",
} as const

export type PageTitleKey = (typeof pageTitleKeys)[keyof typeof pageTitleKeys]

export function getPhaseLabel(phase: SessionPhase) {
  return translate(`phases.${phase}`)
}

export function getPastRoomLabel(phase: SessionPhase) {
  return translate(`pastPhases.${phase}`)
}
