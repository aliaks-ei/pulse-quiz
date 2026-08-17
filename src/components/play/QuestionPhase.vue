<script setup lang="ts">
import { computed } from "vue"
import { Check, X } from "lucide-vue-next"
import { motion } from "motion-v"
import { useI18n } from "vue-i18n"

import MediaAsset from "@/components/media/MediaAsset.vue"
import AnswerOption from "@/components/play/AnswerOption.vue"
import SessionTimer from "@/components/play/SessionTimer.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { localizedText } from "@/i18n"
import { defaultAppLocale, type AppLocale } from "@/i18n/locale"
import { useSessionStore } from "@/stores/session"
import type {
  LiveQuizQuestion,
  QuestionMedia,
  QuizQuestion,
} from "@/types/domain"

const props = defineProps<{
  isHost: boolean
  isQuestionActive: boolean
  isReveal: boolean
  isWaitingState: boolean
  answerLocked: boolean
  isSubmitting: boolean
  selectedOptionId: string | null
  submittedIsCorrect?: boolean | null
  submittedPoints?: number | null
  questionNumber: number
  roundNumber: number
  sectionTitle: string | null
  timerStartIso: string | null
  timerEndIso: string | null
  isPaused: boolean
  serverSyncedTimer?: boolean
  question?: QuizQuestion | LiveQuizQuestion | null
  primaryLocale?: AppLocale
}>()

const emit = defineEmits<{
  submit: [optionId: string]
}>()

const sessionStore = useSessionStore()
const motionPreferences = useMotionPreferences()
const { t } = useI18n()

const currentQuestion = computed(() =>
  props.question === undefined ? sessionStore.currentQuestion : props.question,
)
const primaryLocale = computed(
  () =>
    props.primaryLocale ?? sessionStore.game?.primaryLocale ?? defaultAppLocale,
)
const localizedQuestionPrompt = computed(() => {
  const question = currentQuestion.value
  if (!question) return ""
  return localizedText(
    question.prompt,
    question.promptI18n,
    primaryLocale.value,
  )
})
const localizedRevealText = computed(() => {
  const question = currentQuestion.value
  if (!question?.revealText) return ""
  return localizedText(
    question.revealText,
    question.revealTextI18n,
    primaryLocale.value,
  )
})
const localizedOptions = computed(
  () =>
    currentQuestion.value?.options.map((option) => ({
      ...option,
      localizedText: localizedText(
        option.text,
        option.textI18n,
        primaryLocale.value,
      ),
    })) ?? [],
)
const correctOption = computed(() =>
  localizedOptions.value.find(
    (option) => option.id === currentQuestion.value?.correctOptionId,
  ),
)
const selectedOption = computed(() =>
  localizedOptions.value.find((option) => option.id === props.selectedOptionId),
)
const playerRevealStatus = computed(() => {
  if (props.selectedOptionId == null) return "noAnswer"
  return props.submittedIsCorrect ? "correct" : "incorrect"
})
const playerRevealIsCorrect = computed(
  () => playerRevealStatus.value === "correct",
)
const playerRevealPoints = computed(() => props.submittedPoints ?? 0)
const playerRevealPointsLabel = computed(() =>
  playerRevealPoints.value > 0
    ? t("questionPhase.pointsEarned", { score: playerRevealPoints.value })
    : t("questionPhase.noPoints"),
)
const playerRevealPointsDisplay = computed(() =>
  playerRevealPoints.value > 0 ? `+${playerRevealPoints.value}` : "0",
)
const playerRevealScoreClass = computed(() =>
  playerRevealIsCorrect.value
    ? "border-[rgba(107,237,169,0.5)] bg-[rgba(42,222,126,0.14)] text-[#61e99f] shadow-[0_0_34px_rgba(66,223,133,0.2)]"
    : "border-[rgba(255,119,102,0.5)] bg-[rgba(255,104,88,0.15)] text-[#ff7468] shadow-[0_0_34px_rgba(255,105,88,0.18)]",
)
const playerRevealCardClass = computed(() =>
  playerRevealIsCorrect.value
    ? "bg-[linear-gradient(135deg,#8af2bb_0%,#3fcf82_100%)] shadow-[0_24px_58px_rgba(35,197,115,0.28),0_12px_24px_rgba(18,12,9,0.18)]"
    : "bg-[linear-gradient(135deg,#ff8b7e_0%,#e9554c_100%)] shadow-[0_24px_58px_rgba(230,84,75,0.28),0_12px_24px_rgba(18,12,9,0.18)]",
)
const playerRevealInnerClass = computed(() =>
  playerRevealIsCorrect.value
    ? "bg-[rgba(255,255,255,0.98)] text-[#243129]"
    : "bg-[linear-gradient(180deg,rgba(255,197,188,0.98)_0%,rgba(255,158,148,0.97)_100%)] text-[#2f1c1a]",
)
const playerRevealDividerClass = computed(() =>
  playerRevealIsCorrect.value
    ? "border-[rgba(36,49,41,0.1)]"
    : "border-[rgba(98,42,36,0.18)]",
)
const playerRevealMutedTextClass = computed(() =>
  playerRevealIsCorrect.value ? "text-[#778178]" : "text-[#9c544d]",
)
const roundLabel = computed(() => props.sectionTitle ?? "")
const categoryLabel = computed(() =>
  props.sectionTitle
    ? `Category ${props.roundNumber} · ${props.sectionTitle}`
    : `Category ${props.roundNumber}`,
)
const questionLabel = computed(() =>
  t("questionPhase.questionNumber", { current: props.questionNumber }),
)
const questionMedia = computed(() => currentQuestion.value?.media ?? null)
const revealMedia = computed(() => currentQuestion.value?.revealMedia ?? null)
const isPortraitMedia = (media: QuestionMedia | null) =>
  media?.kind !== "audio" &&
  Boolean(media?.width && media?.height && media.height > media.width)
const hasPortraitQuestionMedia = computed(() =>
  isPortraitMedia(questionMedia.value),
)
const hasPortraitRevealMedia = computed(() =>
  isPortraitMedia(revealMedia.value),
)
const playerStageEase = [0.22, 1, 0.36, 1] as const

function playerSubmittedTransition() {
  if (motionPreferences.prefersReducedMotion.value) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: 0.1 },
    }
  }

  return {
    initial: { opacity: 0, scale: 0.985 },
    animate: { opacity: 1, scale: 1 },
    transition: {
      duration: 0.14,
      ease: playerStageEase,
    },
  }
}
</script>

<template>
  <section
    v-if="isHost"
    class="relative flex h-[100svh] max-h-[100svh] w-full min-w-0 flex-col overflow-hidden px-[clamp(1.25rem,4vw,6rem)] py-[clamp(0.55rem,1.5vh,1.5rem)] text-white"
  >
    <div aria-hidden="true" class="h-[clamp(3.5rem,7vh,5rem)] shrink-0" />

    <div
      v-if="isQuestionActive"
      class="flex min-h-0 flex-1 flex-col gap-[clamp(1.2rem,2.4vh,2rem)] pb-[clamp(0.6rem,1.25vh,1rem)] pt-[clamp(0.4rem,1vh,0.9rem)]"
    >
      <div
        v-if="hasPortraitQuestionMedia"
        class="grid min-h-0 flex-1 items-center gap-[clamp(1.75rem,4vw,4.75rem)] lg:grid-cols-[minmax(14rem,0.82fr)_minmax(22rem,1fr)]"
      >
        <div class="flex h-full min-h-0 items-center justify-center">
          <MediaAsset
            v-if="questionMedia"
            :media="questionMedia"
            :alt="t('questionPhase.questionMediaAlt')"
            fit="contain"
            :framed="false"
            class="max-h-[calc(100svh-7.75rem)] w-auto max-w-full rounded-[clamp(1.5rem,2.2vw,2rem)] [&_img]:min-h-0 [&_img]:rounded-[clamp(1.5rem,2.2vw,2rem)] [&_video]:min-h-0 [&_video]:rounded-[clamp(1.5rem,2.2vw,2rem)]"
          />
        </div>

        <div class="flex min-h-0 min-w-0 flex-col justify-center">
          <p
            class="truncate py-0.5 text-[clamp(0.72rem,0.92vw,1rem)] font-medium uppercase leading-[1.5] tracking-[0.1em] text-[color:var(--text-inverse-muted)]"
          >
            {{ categoryLabel }}
          </p>

          <h1
            class="mt-[clamp(0.65rem,1.2vh,0.85rem)] min-w-0 break-words text-center font-display text-[clamp(2rem,3.6vw,4rem)] font-semibold leading-[1.02] tracking-[-0.05em] lg:text-left"
          >
            {{ localizedQuestionPrompt }}
          </h1>

          <div
            class="mt-[clamp(1.55rem,3.5vh,2.5rem)] grid min-h-0 gap-x-[clamp(0.85rem,1.35vw,1.15rem)] gap-y-[clamp(0.85rem,1.65vh,1rem)] md:grid-cols-2"
          >
            <AnswerOption
              v-for="option in localizedOptions"
              :key="option.id"
              state="default"
              presentation="host"
            >
              <p
                class="text-[clamp(0.9rem,1.2vw,1.08rem)] font-medium leading-snug"
              >
                {{ option.localizedText }}
              </p>
            </AnswerOption>
          </div>
        </div>
      </div>

      <template v-else>
        <p
          class="mx-auto max-w-[min(64vw,46rem)] truncate py-0.5 text-center text-[clamp(0.72rem,0.92vw,1rem)] font-medium uppercase leading-[1.5] tracking-[0.1em] text-[color:var(--text-inverse-muted)]"
        >
          {{ categoryLabel }}
        </p>

        <h1
          class="mx-auto max-w-[88vw] break-words text-center font-display text-[clamp(2.15rem,4.25vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.05em]"
        >
          {{ localizedQuestionPrompt }}
        </h1>

        <MediaAsset
          v-if="questionMedia"
          :media="questionMedia"
          :alt="t('questionPhase.questionMediaAlt')"
          :framed="false"
          class="mx-auto aspect-[4/3] h-[40svh] w-auto max-w-full rounded-[clamp(1.5rem,2.2vw,2rem)] [&_img]:min-h-0 [&_img]:rounded-[clamp(1.5rem,2.2vw,2rem)] [&_video]:min-h-0 [&_video]:rounded-[clamp(1.5rem,2.2vw,2rem)]"
        />

        <div
          class="mx-auto mt-auto grid w-full max-w-[min(74rem,86vw)] gap-x-[clamp(0.85rem,1.35vw,1.15rem)] gap-y-[clamp(0.85rem,1.65vh,1rem)] md:grid-cols-2"
        >
          <AnswerOption
            v-for="option in localizedOptions"
            :key="option.id"
            state="default"
            presentation="host"
          >
            <p
              class="text-[clamp(0.9rem,1.2vw,1.08rem)] font-medium leading-snug"
            >
              {{ option.localizedText }}
            </p>
          </AnswerOption>
        </div>
      </template>
    </div>

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center gap-[clamp(0.85rem,1.65vh,1.35rem)] pb-[clamp(0.5rem,1vh,0.9rem)] pt-[clamp(0.3rem,0.9vh,0.75rem)]"
    >
      <div
        v-if="hasPortraitRevealMedia"
        class="grid min-h-0 flex-1 items-center gap-[clamp(1.75rem,4vw,4.75rem)] lg:grid-cols-[minmax(14rem,0.82fr)_minmax(22rem,1fr)]"
      >
        <div class="flex h-full min-h-0 items-center justify-center">
          <MediaAsset
            v-if="revealMedia"
            :media="revealMedia"
            :alt="t('questionPhase.revealMediaAlt')"
            fit="contain"
            autoplay
            :framed="false"
            class="max-h-[calc(100svh-7.75rem)] w-auto max-w-full rounded-[clamp(1.5rem,2.2vw,2rem)] [&_img]:min-h-0 [&_img]:rounded-[clamp(1.5rem,2.2vw,2rem)] [&_video]:min-h-0 [&_video]:rounded-[clamp(1.5rem,2.2vw,2rem)]"
          />
        </div>

        <div class="flex min-h-0 min-w-0 flex-col justify-center">
          <p
            class="truncate py-0.5 text-[clamp(0.72rem,0.92vw,1rem)] font-medium uppercase leading-[1.5] tracking-[0.1em] text-[color:var(--text-inverse-muted)]"
          >
            {{ categoryLabel }}
          </p>

          <h1
            class="mt-[clamp(0.65rem,1.2vh,0.85rem)] min-w-0 break-words text-center font-display text-[clamp(1.95rem,3.35vw,3.8rem)] font-semibold leading-[1.02] tracking-[-0.05em] lg:text-left"
          >
            {{ localizedQuestionPrompt }}
          </h1>

          <div
            class="mt-[clamp(1.55rem,3.5vh,2.5rem)] flex min-h-[clamp(3rem,6.4vh,3.4rem)] items-center justify-center gap-2 rounded-full border border-[rgba(94,122,88,0.2)] bg-[rgba(189,232,166,0.96)] px-[clamp(1rem,2vw,1.6rem)] py-[clamp(0.6rem,1.1vh,0.75rem)] text-center text-[#34462f] shadow-[0_12px_24px_rgba(18,12,9,0.12)] lg:justify-start"
          >
            <p
              class="font-display text-[clamp(1.25rem,2.15vw,2.05rem)] font-semibold leading-tight tracking-[-0.035em]"
            >
              {{ correctOption?.localizedText }}
            </p>
          </div>

          <p
            v-if="localizedRevealText"
            class="mt-[clamp(1rem,2vh,1.45rem)] text-center text-[clamp(0.9rem,1.08vw,1.05rem)] leading-[1.45] text-[color:var(--text-inverse-body)] lg:text-left"
          >
            {{ localizedRevealText }}
          </p>
        </div>
      </div>

      <template v-else>
        <p
          class="mx-auto max-w-[min(64vw,46rem)] truncate py-0.5 text-center text-[clamp(0.72rem,0.92vw,1rem)] font-medium uppercase leading-[1.5] tracking-[0.1em] text-[color:var(--text-inverse-muted)]"
        >
          {{ categoryLabel }}
        </p>

        <h1
          class="mx-auto max-w-[88vw] break-words text-center font-display text-[clamp(2.05rem,3.85vw,4.15rem)] font-semibold leading-[1.02] tracking-[-0.05em]"
        >
          {{ localizedQuestionPrompt }}
        </h1>

        <MediaAsset
          v-if="revealMedia"
          :media="revealMedia"
          :alt="t('questionPhase.revealMediaAlt')"
          autoplay
          :framed="false"
          class="mx-auto aspect-[4/3] h-[40svh] w-auto max-w-full rounded-[clamp(1.5rem,2.2vw,2rem)] [&_img]:min-h-0 [&_img]:rounded-[clamp(1.5rem,2.2vw,2rem)] [&_video]:min-h-0 [&_video]:rounded-[clamp(1.5rem,2.2vw,2rem)]"
        />

        <div
          class="mt-[clamp(0.25rem,0.8vh,0.65rem)] flex min-h-[clamp(4.1rem,8.5vh,5.4rem)] w-[min(100%,calc(40svh*4/3))] items-center justify-center gap-3 rounded-[999px] border border-[rgba(94,122,88,0.2)] bg-[rgba(189,232,166,0.96)] px-[clamp(1.2rem,2.7vw,2.2rem)] py-[clamp(0.8rem,1.5vh,1.1rem)] text-center text-[#34462f] shadow-[0_12px_24px_rgba(18,12,9,0.12)]"
        >
          <p
            class="font-display text-[clamp(1.35rem,2.4vw,2.35rem)] font-semibold leading-tight tracking-[-0.04em]"
          >
            {{ correctOption?.localizedText }}
          </p>
        </div>

        <p
          v-if="localizedRevealText"
          class="max-w-[min(72vw,46rem)] text-center text-[clamp(0.9rem,1.08vw,1.05rem)] leading-[1.45] text-[color:var(--text-inverse-body)]"
        >
          {{ localizedRevealText }}
        </p>
      </template>
    </div>
  </section>

  <section
    v-else
    class="relative mx-auto flex h-[100svh] max-h-[100svh] w-full min-w-0 max-w-xl flex-col overflow-hidden px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-white md:max-w-2xl md:px-8 md:py-6"
  >
    <header
      class="absolute inset-x-4 top-3 z-10 flex items-start justify-between gap-4 md:inset-x-8 md:top-6"
    >
      <div class="min-w-0 pt-1">
        <p
          v-if="roundLabel"
          class="truncate text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-inverse-muted)] md:text-sm"
        >
          {{ roundLabel }}
        </p>
        <p
          class="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-inverse-body)] md:text-sm"
          :class="roundLabel ? 'mt-2' : ''"
        >
          {{ questionLabel }}
        </p>
      </div>
      <SessionTimer
        :start-iso="timerStartIso"
        :end-iso="timerEndIso"
        :is-paused="isPaused"
        :server-synced="serverSyncedTimer !== false"
        size="sm"
        class="shrink-0"
      />
    </header>

    <div
      class="flex min-h-0 flex-1 flex-col justify-start overflow-y-auto pb-[clamp(0.75rem,3svh,1.5rem)] pt-[clamp(5.5rem,15svh,7rem)] text-center md:pb-[clamp(1rem,3svh,1.75rem)] md:pt-[clamp(5.5rem,14svh,7rem)] [@media(min-height:760px)]:justify-center"
    >
      <motion.div
        v-if="isQuestionActive"
        :layout="
          motionPreferences.prefersReducedMotion.value ? false : 'position'
        "
        class="min-h-0 w-full"
        :transition="{ layout: { duration: 0.18, ease: playerStageEase } }"
      >
        <h1
          class="mx-auto max-w-xl break-words font-display text-[clamp(1.55rem,7.2vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
        >
          {{ localizedQuestionPrompt }}
        </h1>

        <div
          v-if="!selectedOption"
          class="mt-[clamp(1.2rem,4.5svh,2rem)] grid gap-[clamp(0.5rem,1.5svh,0.75rem)] pb-1 text-left md:mt-10"
        >
          <AnswerOption
            v-for="option in localizedOptions"
            :key="option.id"
            :disabled="answerLocked || isSubmitting"
            :interactive="!answerLocked && !isSubmitting"
            state="default"
            class="min-h-[clamp(3.25rem,8.5svh,4.75rem)] w-full !px-[clamp(0.85rem,3.5vw,1rem)] !py-[clamp(0.7rem,1.8svh,1rem)]"
            :motion-props="{
              whileTap:
                !answerLocked && !isSubmitting
                  ? { scale: 0.985, transition: { duration: 0.08 } }
                  : undefined,
            }"
            @click="emit('submit', option.id)"
          >
            <p
              class="break-words text-[clamp(0.95rem,4vw,1.125rem)] font-semibold leading-tight md:text-xl"
            >
              {{ option.localizedText }}
            </p>
          </AnswerOption>
        </div>

        <motion.div
          v-else
          class="mt-[clamp(1.2rem,4.5svh,2rem)] text-left md:mt-10"
          v-bind="playerSubmittedTransition()"
        >
          <span
            v-if="isWaitingState"
            class="sr-only"
            role="status"
            aria-live="polite"
          >
            {{ t("questionPhase.lockedIn") }}
          </span>

          <AnswerOption
            disabled
            :interactive="false"
            state="selected"
            class="min-h-[clamp(3.6rem,9svh,5rem)] w-full !px-[clamp(1rem,4vw,1.2rem)] !py-[clamp(0.85rem,2svh,1.1rem)]"
          >
            <p
              class="break-words text-[clamp(0.95rem,4vw,1.125rem)] font-semibold leading-tight md:text-xl"
            >
              {{ selectedOption.localizedText }}
            </p>
          </AnswerOption>
        </motion.div>
      </motion.div>

      <motion.div
        v-else-if="isReveal"
        class="mx-auto flex min-h-0 w-full max-w-lg flex-col gap-[clamp(0.85rem,2svh,1.15rem)] text-left"
        role="status"
        aria-live="polite"
        v-bind="motionPreferences.enter(0, 10)"
      >
        <div class="flex justify-end">
          <div
            class="inline-flex min-h-[clamp(2.55rem,6.4svh,3.55rem)] items-center gap-1.5 rounded-full border px-[clamp(0.75rem,2.8vw,1rem)] py-[clamp(0.3rem,0.8svh,0.42rem)]"
            :class="playerRevealScoreClass"
            :aria-label="playerRevealPointsLabel"
          >
            <span
              class="font-display text-[clamp(1.65rem,8.4vw,3rem)] font-semibold leading-none tracking-[-0.045em]"
            >
              {{ playerRevealPointsDisplay }}
            </span>
            <Check
              v-if="playerRevealIsCorrect"
              aria-hidden="true"
              class="size-[clamp(1.35rem,5.8vw,2.2rem)] stroke-[2.8]"
            />
            <X
              v-else
              aria-hidden="true"
              class="size-[clamp(1.35rem,5.8vw,2.2rem)] stroke-[2.8]"
            />
          </div>
        </div>

        <h1
          class="mx-auto mb-[clamp(0.15rem,0.8svh,0.45rem)] max-w-xl break-words text-center font-display text-[clamp(1.55rem,7vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
        >
          {{ localizedQuestionPrompt }}
        </h1>

        <div
          class="rounded-[clamp(1.45rem,6vw,2rem)] p-[clamp(0.55rem,2.2vw,0.8rem)]"
          :class="playerRevealCardClass"
        >
          <div
            class="flex min-h-[clamp(12.5rem,36svh,19rem)] flex-col justify-center rounded-[clamp(1rem,4.8vw,1.55rem)] px-[clamp(1rem,5vw,1.8rem)] py-[clamp(1.25rem,3.6svh,2rem)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
            :class="playerRevealInnerClass"
          >
            <p
              class="text-xs font-semibold uppercase leading-normal tracking-[0.18em]"
              :class="playerRevealMutedTextClass"
            >
              {{ t(`questionPhase.${playerRevealStatus}`) }}
            </p>

            <p
              v-if="playerRevealIsCorrect"
              class="mt-[clamp(0.85rem,2.5svh,1.4rem)] text-xs font-semibold uppercase leading-normal tracking-[0.18em]"
              :class="playerRevealMutedTextClass"
            >
              {{ t("questionPhase.yourAnswer") }}
            </p>
            <p
              v-if="playerRevealIsCorrect"
              class="mx-auto mt-[clamp(0.25rem,1.1svh,0.5rem)] max-w-[18rem] break-words font-display text-[clamp(1.75rem,8vw,3rem)] font-semibold leading-tight tracking-[-0.045em]"
            >
              {{ correctOption?.localizedText }}
            </p>

            <template v-else>
              <div
                v-if="selectedOption"
                class="mt-[clamp(0.8rem,2.4svh,1.3rem)]"
              >
                <p
                  class="text-xs font-semibold uppercase leading-normal tracking-[0.18em]"
                  :class="playerRevealMutedTextClass"
                >
                  {{ t("questionPhase.yourAnswer") }}
                </p>
                <p
                  class="mx-auto mt-[clamp(0.25rem,1svh,0.45rem)] max-w-[18rem] break-words font-display text-[clamp(1.45rem,6.4vw,2.35rem)] font-semibold leading-tight tracking-[-0.035em] text-[#2f1c1a]/55 line-through decoration-[rgba(71,35,31,0.42)] decoration-[0.12em]"
                >
                  {{ selectedOption.localizedText }}
                </p>
              </div>

              <div
                class="mx-auto my-[clamp(0.95rem,2.8svh,1.55rem)] max-w-[88%] border-t"
                :class="playerRevealDividerClass"
              />

              <p
                class="text-xs font-semibold uppercase leading-normal tracking-[0.18em]"
                :class="playerRevealMutedTextClass"
              >
                {{ t("questionPhase.correctAnswer") }}
              </p>
              <p
                class="mx-auto mt-[clamp(0.25rem,1svh,0.45rem)] max-w-[18rem] break-words font-display text-[clamp(1.65rem,7.6vw,2.85rem)] font-semibold leading-tight tracking-[-0.045em]"
              >
                {{ correctOption?.localizedText }}
              </p>
            </template>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
</template>
