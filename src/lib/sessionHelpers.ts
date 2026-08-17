import { formatLocaleDate, translate } from "@/i18n"
import { getPhaseLabel } from "@/lib/uiCopy"
import type { GameStatusSummary, SessionPhase } from "@/types/domain"

export function getCanonicalSessionRoute(
  sessionId: string,
  phase: SessionPhase,
) {
  if (phase === "lobby") return `/session/${sessionId}/lobby`
  if (phase === "finished") return `/session/${sessionId}/results`
  return `/session/${sessionId}/play`
}

export function canSubmitAnswer(input: {
  phase: SessionPhase | null | undefined
  questionEndsAt: string | null | undefined
  submittedOptionId: string | null | undefined
  nowMs?: number
}) {
  if (input.phase !== "question_active") return false
  if (input.submittedOptionId) return false
  if (!input.questionEndsAt) return false

  return new Date(input.questionEndsAt).getTime() > (input.nowMs ?? Date.now())
}

export function deriveGameStatus(game: GameStatusSummary) {
  if (!game.activeSessionId || !game.activePhase) {
    return {
      label: translate("gameStatus.readyLabel"),
      tone: "default" as const,
      detail: translate("gameStatus.readyDetail"),
      canReopen: false,
    }
  }

  if (game.activePhase === "lobby") {
    return {
      label: translate("gameStatus.roomOpenLabel"),
      tone: "accent" as const,
      detail: translate("gameStatus.roomOpenDetail", {
        count: game.activePlayerCount,
      }),
      canReopen: true,
    }
  }

  if (game.activePhase === "finished") {
    return {
      label: translate("gameStatus.resultsReadyLabel"),
      tone: "default" as const,
      detail: translate("gameStatus.resultsReadyDetail"),
      canReopen: false,
    }
  }

  return {
    label: translate("gameStatus.liveNowLabel"),
    tone: "success" as const,
    detail: game.activeHostConnected
      ? translate("gameStatus.onScreen", {
          phase: getPhaseLabel(game.activePhase),
        })
      : translate("gameStatus.hostAway"),
    canReopen: true,
  }
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) return translate("common.unknown")

  return formatLocaleDate(value, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
