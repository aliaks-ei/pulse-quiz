<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { AnimatePresence, motion } from "motion-v"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"

import ConnectionIndicator from "@/components/play/ConnectionIndicator.vue"
import FinalResultsPanel from "@/components/play/FinalResultsPanel.vue"
import GameplayTransition from "@/components/play/GameplayTransition.vue"
import HostControls from "@/components/play/HostControls.vue"
import LeaderboardPhase from "@/components/play/LeaderboardPhase.vue"
import QuestionPhase from "@/components/play/QuestionPhase.vue"
import RoundSummary from "@/components/play/RoundSummary.vue"
import Button from "@/components/ui/Button.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { useSessionLifecycle } from "@/composables/useSessionLifecycle"
import { useSessionTimer } from "@/composables/useSessionTimer"
import { serverNow } from "@/stores/serverClock"
import { localizedText } from "@/i18n"
import { defaultAppLocale } from "@/i18n/locale"
import { preloadQuestionMedia } from "@/lib/mediaPreload"
import { withBackoff } from "@/lib/retry"
import { canSubmitAnswer } from "@/lib/sessionHelpers"
import { gameService } from "@/services/gameService"
import type { SessionPhase } from "@/types/domain"

const PHASE_ADVANCE_LABEL_KEYS: Partial<Record<SessionPhase, string>> = {
  question_active: "playView.showAnswer",
  answer_reveal: "playView.next",
  round_summary: "playView.showLeaderboard",
}

const { sessionStore } = useSessionLifecycle()
const router = useRouter()
const motionPreferences = useMotionPreferences()
const selectedOptionId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionState = ref<
  "idle" | "submitting" | "advancing" | "pausing" | "resuming"
>("idle")
const { t } = useI18n()

const isHost = computed(() => sessionStore.viewerRole === "host")
const phase = computed(() => sessionStore.session?.phase ?? "lobby")
const isQuestionActive = computed(() => phase.value === "question_active")
const isAnswerTransition = computed(() => phase.value === "answer_transition")
const isReveal = computed(() => phase.value === "answer_reveal")
const isRoundSummary = computed(() => phase.value === "round_summary")
const isRoundLeaderboard = computed(() => phase.value === "round_leaderboard")
const isFinished = computed(() => phase.value === "finished")
const isIntermission = computed(
  () => isRoundSummary.value || isRoundLeaderboard.value,
)
const hasSubmitted = computed(
  () => sessionStore.snapshot?.submittedOptionId != null,
)
const isWaitingState = computed(
  () => !isHost.value && isQuestionActive.value && hasSubmitted.value,
)
const timerStartIso = computed(() => {
  if (isQuestionActive.value)
    return sessionStore.session?.questionStartedAt ?? null
  return sessionStore.session?.phaseStartedAt ?? null
})
const timerEndIso = computed(() => {
  if (isQuestionActive.value)
    return sessionStore.session?.questionEndsAt ?? null
  return sessionStore.session?.phaseEndsAt ?? null
})
const phaseTimer = useSessionTimer(timerEndIso)

const answerLocked = computed(
  () =>
    isHost.value ||
    phaseTimer.remainingMs.value <= 0 ||
    !canSubmitAnswer({
      phase: sessionStore.session?.phase,
      questionEndsAt: sessionStore.session?.questionEndsAt,
      submittedOptionId: sessionStore.snapshot?.submittedOptionId,
      nowMs: serverNow(),
    }),
)

const questionNumber = computed(
  () => (sessionStore.session?.currentQuestionIndex ?? 0) + 1,
)
const roundNumber = computed(() => (sessionStore.session?.partIndex ?? 0) + 1)
const roundTotal = computed(() => sessionStore.session?.partCount ?? 1)
const isFinalQuestion = computed(
  () =>
    sessionStore.session != null &&
    sessionStore.game != null &&
    sessionStore.session.currentQuestionIndex + 1 >=
      sessionStore.game.questionCount,
)
const currentSectionTitle = computed(() => {
  const section = sessionStore.game?.sections.find(
    (candidate) => candidate.id === sessionStore.session?.currentSectionId,
  )
  if (!section) return sessionStore.session?.currentSectionTitle ?? null

  return localizedText(
    section.title,
    section.titleI18n,
    sessionStore.game?.primaryLocale ?? defaultAppLocale,
  )
})
const canPause = computed(
  () => sessionStore.session?.phaseEndsAt != null && !isAnswerTransition.value,
)
const advanceLabel = computed(() => {
  if (isReveal.value && isFinalQuestion.value) {
    return t("playView.showResults")
  }
  const key = PHASE_ADVANCE_LABEL_KEYS[phase.value as SessionPhase]
  if (key) return t(key)
  if (isRoundLeaderboard.value && sessionStore.session?.phaseEndsAt == null) {
    return t("playView.startNextSection")
  }
  return t("playView.nextQuestion")
})
const phaseViewKey = computed(() => {
  if (isAnswerTransition.value) return phase.value
  return `${phase.value}-${sessionStore.currentQuestion?.id ?? "break"}`
})

// Only reset on question change. Phase changes (e.g. question_active → answer_reveal)
// arrive via mergeSessionRow before the snapshot's top-level submittedOptionId has been
// refetched, so reading submittedOptionId on phase change would briefly read a stale null
// and wipe the optimistic selection.
watch(
  () => sessionStore.currentQuestion?.id,
  () => {
    selectedOptionId.value = sessionStore.snapshot?.submittedOptionId ?? null
    actionError.value = null
  },
  { immediate: true },
)

// Sync the server-confirmed submission, but never overwrite an in-flight optimistic
// selection with null while the refresh is still catching up.
watch(
  () => sessionStore.snapshot?.submittedOptionId,
  (submitted) => {
    if (submitted) selectedOptionId.value = submitted
  },
)

watch(
  [isHost, phase, () => sessionStore.currentQuestion?.revealMedia?.publicUrl],
  ([host, currentPhase]) => {
    if (!host || currentPhase !== "answer_transition") return
    void preloadQuestionMedia(sessionStore.currentQuestion?.revealMedia)
  },
  { immediate: true },
)

watch(
  () => phaseTimer.remainingMs.value,
  (remainingMs, previousMs) => {
    if (
      previousMs > 0 &&
      remainingMs === 0 &&
      !sessionStore.session?.isPaused &&
      sessionStore.session &&
      phase.value !== "finished"
    ) {
      void sessionStore.refreshSession()
    }
  },
)

async function submitAnswer(optionId: string) {
  if (
    !sessionStore.currentQuestion ||
    answerLocked.value ||
    actionState.value !== "idle"
  )
    return

  const sessionId = sessionStore.session!.id
  const questionId = sessionStore.currentQuestion.id

  actionState.value = "submitting"
  actionError.value = null
  selectedOptionId.value = optionId

  try {
    await withBackoff(
      () => gameService.submitAnswer(sessionId, questionId, optionId),
      { retries: 2, baseMs: 250, maxMs: 1_000 },
    )
    void sessionStore.refreshSession()
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : t("playView.submitAnswerError")
    selectedOptionId.value = sessionStore.snapshot?.submittedOptionId ?? null
  } finally {
    actionState.value = "idle"
  }
}

async function runHostAction(
  state: "advancing" | "pausing" | "resuming",
  action: (sessionId: string) => Promise<void>,
  errorKey: string,
) {
  if (!sessionStore.session || actionState.value !== "idle") return

  actionState.value = state
  actionError.value = null

  try {
    await action(sessionStore.session.id)
    await sessionStore.refreshSession()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : t(errorKey)
  } finally {
    actionState.value = "idle"
  }
}

function pauseSession() {
  return runHostAction(
    "pausing",
    (sessionId) => gameService.pauseSessionFlow(sessionId),
    "playView.pauseGameError",
  )
}

function advancePhase() {
  return runHostAction(
    "advancing",
    (sessionId) =>
      gameService.hostAdvanceSessionPhase(
        sessionId,
        sessionStore.session?.phase,
      ),
    "playView.advanceGameError",
  )
}

function resumeSession() {
  return runHostAction(
    "resuming",
    (sessionId) => gameService.resumeSessionFlow(sessionId),
    "playView.resumeGameError",
  )
}

async function playAgain() {
  if (!sessionStore.game || actionState.value !== "idle") return

  actionState.value = "advancing"
  try {
    const session = await gameService.startSession(sessionStore.game.id)
    await router.push(`/session/${session.sessionId}/lobby`)
  } finally {
    actionState.value = "idle"
  }
}
</script>

<template>
  <div
    class="h-[100svh] max-h-[100svh] overflow-hidden bg-[linear-gradient(180deg,rgba(79,58,49,0.96),rgba(62,45,38,0.96))]"
  >
    <SurfacePanel
      v-if="sessionStore.error"
      role="alert"
      class="mx-auto mt-8 max-w-3xl text-sm text-destructive"
    >
      {{ sessionStore.error }}
    </SurfacePanel>

    <GameplayTransition
      v-else-if="
        !sessionStore.currentQuestion &&
        !isIntermission &&
        !isFinished &&
        !isAnswerTransition
      "
      :title="t('playView.loadingGame')"
      :body="t('playView.preparingAnswer')"
    />

    <div v-else class="relative h-[100svh] max-h-[100svh] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          :key="phaseViewKey"
          class="h-[100svh] max-h-[100svh]"
          :class="isFinished ? 'overflow-y-auto' : 'overflow-hidden'"
          :initial="{ opacity: 0, y: 18 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -14 }"
          :transition="{
            duration: motionPreferences.useGentleMotion.value ? 0.2 : 0.34,
            ease: [0.22, 1, 0.36, 1],
          }"
        >
          <GameplayTransition
            v-if="isAnswerTransition"
            :kicker="t('questionPhase.transitionKicker')"
            :title="t('questionPhase.transitionTitle')"
            :body="t('questionPhase.transitionBody')"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            show-timer
          />

          <QuestionPhase
            v-else-if="isQuestionActive || isReveal"
            :is-host="isHost"
            :is-question-active="isQuestionActive"
            :is-reveal="isReveal"
            :is-waiting-state="isWaitingState"
            :answer-locked="answerLocked"
            :is-submitting="actionState === 'submitting'"
            :selected-option-id="selectedOptionId"
            :submitted-is-correct="
              sessionStore.snapshot?.submittedIsCorrect ?? null
            "
            :submitted-points="sessionStore.snapshot?.submittedPoints ?? null"
            :question-number="questionNumber"
            :round-number="roundNumber"
            :section-title="currentSectionTitle"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            :is-paused="sessionStore.session?.isPaused ?? false"
            @submit="submitAnswer"
          />

          <RoundSummary
            v-else-if="isRoundSummary"
            :class="
              isHost
                ? 'mx-auto max-w-5xl p-4 md:p-8'
                : 'h-[100svh] max-h-[100svh] px-4 py-5 md:px-8 md:py-7'
            "
            :presentation="isHost ? 'host' : 'player'"
            :current-player-id="sessionStore.snapshot?.currentPlayerId ?? null"
            :round-number="roundNumber"
            :round-total="roundTotal"
            :section-title="currentSectionTitle"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            :is-paused="sessionStore.session?.isPaused ?? false"
          />

          <LeaderboardPhase
            v-else-if="isRoundLeaderboard"
            :class="
              isHost
                ? 'mx-auto h-[100svh] max-h-[100svh] w-full px-4 py-4 md:px-8 md:py-6'
                : 'h-[100svh] max-h-[100svh] px-4 py-5 md:px-8 md:py-7'
            "
            :presentation="isHost ? 'host' : 'player'"
            :current-player-id="sessionStore.snapshot?.currentPlayerId ?? null"
            :round-number="roundNumber"
            :section-title="currentSectionTitle"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            :is-paused="sessionStore.session?.isPaused ?? false"
          />

          <FinalResultsPanel
            v-else-if="isFinished"
            :title="
              sessionStore.game
                ? localizedText(
                    sessionStore.game.title,
                    sessionStore.game.titleI18n,
                    sessionStore.game.primaryLocale,
                  )
                : ''
            "
            :leaderboard-entries="sessionStore.leaderboard"
            :current-player-id="sessionStore.snapshot?.currentPlayerId ?? null"
            :viewer-role="sessionStore.viewerRole"
          >
            <template #actions>
              <div
                class="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center"
              >
                <Button
                  v-if="isHost"
                  size="lg"
                  :disabled="actionState !== 'idle'"
                  @click="playAgain"
                >
                  {{
                    actionState === "advancing"
                      ? t("resultsView.starting")
                      : t("resultsView.playAgain")
                  }}
                </Button>
                <Button
                  to="/"
                  size="lg"
                  :variant="isHost ? 'secondary' : 'primary'"
                >
                  {{ t("common.home") }}
                </Button>
                <Button
                  v-if="isHost && sessionStore.game"
                  :to="`/games/${sessionStore.game.id}`"
                  size="lg"
                  variant="secondary"
                >
                  {{ t("common.openQuiz") }}
                </Button>
              </div>
            </template>
          </FinalResultsPanel>
        </motion.div>
      </AnimatePresence>

      <ConnectionIndicator :status="sessionStore.realtimeStatus" />

      <HostControls
        v-if="isHost && !isFinished && !isAnswerTransition"
        :advance-label="advanceLabel"
        :is-question-active="isQuestionActive"
        :can-pause="canPause"
        :action-error="actionError"
        :is-advancing="actionState === 'advancing'"
        :is-pausing="actionState === 'pausing'"
        :is-resuming="actionState === 'resuming'"
        :timer-start-iso="timerStartIso"
        :timer-end-iso="timerEndIso"
        :is-paused="sessionStore.session?.isPaused ?? false"
        @advance="advancePhase"
        @pause="pauseSession"
        @resume="resumeSession"
      />
    </div>
  </div>
</template>
