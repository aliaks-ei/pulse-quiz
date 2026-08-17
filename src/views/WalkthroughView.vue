<script setup lang="ts">
import { useIntervalFn } from "@vueuse/core"
import { AnimatePresence, motion } from "motion-v"
import { computed, onMounted, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"

import FinalResultsPanel from "@/components/play/FinalResultsPanel.vue"
import GameplayTransition from "@/components/play/GameplayTransition.vue"
import LeaderboardPhase from "@/components/play/LeaderboardPhase.vue"
import QuestionPhase from "@/components/play/QuestionPhase.vue"
import RoundSummary from "@/components/play/RoundSummary.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import LanguageSwitcher from "@/components/ui/LanguageSwitcher.vue"
import Skeleton from "@/components/ui/Skeleton.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { localizedText } from "@/i18n"
import { defaultAppLocale } from "@/i18n/locale"
import { preloadQuestionMedia } from "@/lib/mediaPreload"
import {
  advanceWalkthroughState,
  buildWalkthroughParticipant,
  canSubmitWalkthroughAnswer,
  createWalkthroughState,
  getWalkthroughAdvanceLabelKey,
  getWalkthroughCurrentQuestion,
  getWalkthroughLeaderboard,
  getWalkthroughQuestionNumber,
  getWalkthroughRoundNumber,
  getWalkthroughRoundSummary,
  getWalkthroughRoundTotal,
  restartWalkthrough,
  submitWalkthroughAnswer,
  syncWalkthroughState,
  type WalkthroughState,
} from "@/lib/walkthrough"
import { getPhaseLabel } from "@/lib/uiCopy"
import { gameService } from "@/services/gameService"
import { useAuthStore } from "@/stores/auth"
import type { Game } from "@/types/domain"

type WalkthroughMode = "host" | "player"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const motionPreferences = useMotionPreferences()
const { t } = useI18n()

const game = ref<Game | null>(null)
const state = ref<WalkthroughState | null>(null)
const mode = ref<WalkthroughMode>("host")
const isLoading = ref(false)
const error = ref<string | null>(null)
const isAdvancing = ref(false)

const { resume: resumeWalkthroughSync } = useIntervalFn(
  () => {
    if (!state.value) return
    state.value = syncWalkthroughState(state.value)
  },
  250,
  { immediate: false },
)

const currentQuestion = computed(() =>
  state.value ? getWalkthroughCurrentQuestion(state.value) : null,
)
const leaderboardEntries = computed(() =>
  state.value ? getWalkthroughLeaderboard(state.value) : [],
)
const roundSummaryEntries = computed(() =>
  state.value ? getWalkthroughRoundSummary(state.value) : [],
)
const isHostPreview = computed(() => mode.value === "host")
const phaseLabel = computed(() =>
  state.value ? getPhaseLabel(state.value.phase) : "",
)
const roundNumber = computed(() =>
  state.value ? getWalkthroughRoundNumber(state.value) : 1,
)
const roundTotal = computed(() =>
  state.value ? getWalkthroughRoundTotal(state.value) : 1,
)
const questionNumber = computed(() =>
  state.value ? getWalkthroughQuestionNumber(state.value) : 1,
)
const sectionTitle = computed(() => {
  if (!state.value) return null

  const section = state.value.game.sections[state.value.currentSectionIndex]
  if (!section) return null

  return localizedText(
    section.title,
    section.titleI18n,
    state.value.game.primaryLocale ?? defaultAppLocale,
  )
})
const localizedGameTitle = computed(() => {
  if (!game.value) return ""
  return localizedText(
    game.value.title,
    game.value.titleI18n,
    game.value.primaryLocale,
  )
})
const timerStartIso = computed(() =>
  toIso(state.value?.phaseStartedAtMs ?? null),
)
const timerEndIso = computed(() => toIso(state.value?.phaseEndsAtMs ?? null))
const isQuestionActive = computed(
  () => state.value?.phase === "question_active",
)
const isAnswerTransition = computed(
  () => state.value?.phase === "answer_transition",
)
const isReveal = computed(() => state.value?.phase === "answer_reveal")
const isRoundSummary = computed(() => state.value?.phase === "round_summary")
const isRoundLeaderboard = computed(
  () => state.value?.phase === "round_leaderboard",
)
const isFinished = computed(() => state.value?.phase === "finished")
const hasSubmitted = computed(() => state.value?.submittedOptionId != null)
const answerLocked = computed(() => {
  if (isHostPreview.value) return true
  return state.value ? !canSubmitWalkthroughAnswer(state.value) : true
})
const isWaitingState = computed(
  () => !isHostPreview.value && isQuestionActive.value && hasSubmitted.value,
)
const advanceLabel = computed(() =>
  state.value ? t(getWalkthroughAdvanceLabelKey(state.value)) : "",
)
const phaseViewKey = computed(
  () =>
    `${mode.value}-${state.value?.phase ?? "empty"}-${currentQuestion.value?.id ?? "break"}`,
)

watch([isAnswerTransition, currentQuestion], ([transitioning, question]) => {
  if (transitioning) void preloadQuestionMedia(question?.revealMedia)
})

onMounted(async () => {
  isLoading.value = true
  error.value = null

  try {
    const gameId = route.params.gameId as string
    const loadedGame = await gameService.getGame(gameId)
    game.value = loadedGame

    if (loadedGame.questions.length) {
      state.value = createWalkthroughState(
        loadedGame,
        buildWalkthroughParticipant(authStore.userEmail),
      )
    }

    resumeWalkthroughSync()
  } catch (loadError) {
    error.value =
      loadError instanceof Error
        ? loadError.message
        : t("walkthroughView.loadError")
  } finally {
    isLoading.value = false
  }
})

function toIso(value: number | null) {
  return value == null ? null : new Date(value).toISOString()
}

function setMode(nextMode: WalkthroughMode) {
  mode.value = nextMode
}

function submitAnswer(optionId: string) {
  if (!state.value || isHostPreview.value) return
  state.value = submitWalkthroughAnswer(state.value, optionId)
}

function advancePhase() {
  if (!state.value) return
  isAdvancing.value = true
  state.value = advanceWalkthroughState(state.value)
  window.setTimeout(() => {
    isAdvancing.value = false
  }, 180)
}

function restart() {
  if (!state.value) return
  state.value = restartWalkthrough(state.value)
}

async function exitWalkthrough() {
  const gameId = game.value?.id ?? (route.params.gameId as string)
  await router.push(`/games/${gameId}`)
}
</script>

<template>
  <div
    class="min-h-[100svh] bg-[linear-gradient(180deg,rgba(79,58,49,0.96),rgba(62,45,38,0.96))]"
  >
    <header
      class="sticky top-0 z-50 border-b border-white/10 bg-[rgba(62,45,38,0.92)] px-4 py-3 shadow-[0_16px_34px_rgba(18,12,9,0.16)] backdrop-blur-xl md:px-6"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone="default">{{ t("walkthroughView.privateBadge") }}</Badge>
          <p
            class="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-inverse-body)]"
          >
            {{ phaseLabel || t("walkthroughView.badge") }}
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <div
            class="flex rounded-full border border-white/10 bg-white/8 p-1"
            role="group"
            :aria-label="t('walkthroughView.modeToggle')"
          >
            <button
              type="button"
              class="h-9 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.16em] transition"
              :class="
                isHostPreview
                  ? 'bg-white text-foreground shadow-[0_8px_18px_rgba(12,8,6,0.18)]'
                  : 'text-white/78 hover:bg-white/10 hover:text-white'
              "
              @click="setMode('host')"
            >
              {{ t("walkthroughView.walkAsHost") }}
            </button>
            <button
              type="button"
              class="h-9 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.16em] transition"
              :class="
                !isHostPreview
                  ? 'bg-white text-foreground shadow-[0_8px_18px_rgba(12,8,6,0.18)]'
                  : 'text-white/78 hover:bg-white/10 hover:text-white'
              "
              @click="setMode('player')"
            >
              {{ t("walkthroughView.walkAsPlayer") }}
            </button>
          </div>

          <LanguageSwitcher inverted />

          <Button
            v-if="state && !isFinished && !isAnswerTransition"
            size="sm"
            variant="secondary"
            :disabled="isAdvancing"
            @click="advancePhase"
          >
            {{ isAdvancing ? t("hostControls.moving") : advanceLabel }}
          </Button>
          <Button v-if="state" size="sm" variant="secondary" @click="restart">
            {{ t("walkthroughView.restart") }}
          </Button>
          <Button size="sm" variant="secondary" @click="exitWalkthrough">
            {{ t("walkthroughView.backToQuiz") }}
          </Button>
        </div>
      </div>
    </header>

    <div
      v-if="isLoading"
      role="status"
      class="min-h-[calc(100svh-4.75rem)] overflow-hidden"
    >
      <section
        v-if="isHostPreview"
        class="flex min-h-[calc(100svh-4.75rem)] flex-col px-[clamp(1.25rem,4vw,6rem)] py-[clamp(1rem,2vh,2rem)] text-white"
      >
        <div
          class="flex h-20 shrink-0 items-center justify-between gap-4 pr-[clamp(11rem,17vw,19rem)]"
        >
          <Skeleton tone="dark" width="min(22rem, 54vw)" height="1.35rem" />
        </div>
        <div class="flex min-h-0 flex-1 flex-col gap-[clamp(1rem,2vh,2rem)]">
          <Skeleton
            tone="dark"
            rounded="lg"
            width="min(74rem, 88vw)"
            height="clamp(7rem, 20vh, 13rem)"
            class="mx-auto"
          />
          <Skeleton
            tone="dark"
            rounded="lg"
            width="min(42rem, 72vw)"
            height="32svh"
            class="mx-auto"
          />
          <div class="mt-auto grid gap-3 md:grid-cols-2">
            <Skeleton
              v-for="index in 4"
              :key="index"
              tone="dark"
              rounded="lg"
              height="4rem"
            />
          </div>
        </div>
      </section>

      <section
        v-else
        class="mx-auto flex min-h-[calc(100svh-4.75rem)] w-full max-w-4xl flex-col justify-center overflow-hidden px-4 py-4 text-white md:px-8 md:py-6"
      >
        <div class="flex min-h-0 flex-col justify-center py-3 text-center">
          <Skeleton
            tone="dark"
            width="min(18rem, 60vw)"
            height="0.9rem"
            class="mx-auto"
          />
          <Skeleton
            tone="dark"
            width="min(12rem, 42vw)"
            height="0.9rem"
            class="mx-auto mt-3"
          />
          <Skeleton
            tone="dark"
            rounded="lg"
            width="min(42rem, 88vw)"
            height="10rem"
            class="mx-auto mt-5"
          />
        </div>
        <div class="mt-6 grid min-h-0 gap-3 pb-1">
          <Skeleton
            v-for="index in 4"
            :key="index"
            tone="dark"
            rounded="lg"
            height="4.25rem"
          />
        </div>
      </section>
    </div>

    <SurfacePanel
      v-else-if="error"
      role="alert"
      class="mx-auto mt-8 max-w-3xl text-sm text-error"
    >
      {{ error }}
    </SurfacePanel>

    <SurfacePanel
      v-else-if="game && !state"
      padded="lg"
      class="mx-auto mt-8 max-w-3xl text-center text-[color:var(--text-muted)]"
    >
      <Badge tone="default">{{ t("walkthroughView.privateBadge") }}</Badge>
      <h1 class="app-title mt-5 font-display font-semibold text-foreground">
        {{ t("walkthroughView.emptyTitle") }}
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-sm leading-6">
        {{ t("walkthroughView.emptyBody") }}
      </p>
      <div class="mt-8 flex justify-center">
        <Button variant="secondary" @click="exitWalkthrough">
          {{ t("walkthroughView.backToQuiz") }}
        </Button>
      </div>
    </SurfacePanel>

    <div
      v-else-if="game && state"
      class="relative h-[calc(100svh-4.75rem)] max-h-[calc(100svh-4.75rem)] overflow-hidden"
    >
      <AnimatePresence mode="wait">
        <motion.div
          :key="phaseViewKey"
          class="h-[calc(100svh-4.75rem)] max-h-[calc(100svh-4.75rem)] overflow-hidden"
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
            class="!h-[calc(100svh-4.75rem)] !max-h-[calc(100svh-4.75rem)]"
            :kicker="t('questionPhase.transitionKicker')"
            :title="t('questionPhase.transitionTitle')"
            :body="t('questionPhase.transitionBody')"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            show-timer
            :server-synced-timer="false"
          />

          <QuestionPhase
            v-else-if="isQuestionActive || isReveal"
            class="!h-[calc(100svh-4.75rem)] !max-h-[calc(100svh-4.75rem)] !min-h-0"
            :is-host="isHostPreview"
            :is-question-active="isQuestionActive"
            :is-reveal="isReveal"
            :is-waiting-state="isWaitingState"
            :answer-locked="answerLocked"
            :is-submitting="false"
            :selected-option-id="state.submittedOptionId"
            :submitted-is-correct="state.submittedIsCorrect"
            :submitted-points="state.submittedPoints"
            :question-number="questionNumber"
            :round-number="roundNumber"
            :section-title="sectionTitle"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            :is-paused="false"
            :server-synced-timer="false"
            :question="currentQuestion"
            :primary-locale="game.primaryLocale"
            @submit="submitAnswer"
          />

          <RoundSummary
            v-else-if="isRoundSummary"
            :class="
              isHostPreview
                ? 'mx-auto min-h-[calc(100svh-4.75rem)] max-w-5xl p-4 md:p-8'
                : 'h-[calc(100svh-4.75rem)] max-h-[calc(100svh-4.75rem)] px-4 py-5 md:px-8 md:py-7'
            "
            :presentation="isHostPreview ? 'host' : 'player'"
            :current-player-id="state.participant.playerId"
            :round-number="roundNumber"
            :round-total="roundTotal"
            :section-title="sectionTitle"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            :is-paused="false"
            :server-synced-timer="false"
            :entries="roundSummaryEntries"
          />

          <LeaderboardPhase
            v-else-if="isRoundLeaderboard"
            :class="
              isHostPreview
                ? 'mx-auto h-[calc(100svh-4.75rem)] max-h-[calc(100svh-4.75rem)] w-full px-4 py-4 md:px-8 md:py-6'
                : 'h-[calc(100svh-4.75rem)] max-h-[calc(100svh-4.75rem)] px-4 py-5 md:px-8 md:py-7'
            "
            :presentation="isHostPreview ? 'host' : 'player'"
            :current-player-id="state.participant.playerId"
            :round-number="roundNumber"
            :section-title="sectionTitle"
            :timer-start-iso="timerStartIso"
            :timer-end-iso="timerEndIso"
            :is-paused="false"
            :server-synced-timer="false"
            :entries="leaderboardEntries"
          />

          <FinalResultsPanel
            v-else
            :title="localizedGameTitle"
            :leaderboard-entries="leaderboardEntries"
            :current-player-id="state.participant.playerId"
            :viewer-role="isHostPreview ? 'host' : 'player'"
          >
            <template #actions>
              <div
                class="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center"
              >
                <Button size="lg" @click="restart">
                  {{ t("walkthroughView.playAgain") }}
                </Button>
                <Button size="lg" variant="secondary" @click="exitWalkthrough">
                  {{ t("walkthroughView.backToQuiz") }}
                </Button>
              </div>
            </template>
          </FinalResultsPanel>
        </motion.div>
      </AnimatePresence>
    </div>
  </div>
</template>
