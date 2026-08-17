<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"

import GameManageSkeleton from "@/components/gameManage/GameManageSkeleton.vue"
import MediaAsset from "@/components/media/MediaAsset.vue"
import PageShell from "@/components/layout/PageShell.vue"
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import PaperCard from "@/components/ui/PaperCard.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { useCopyToClipboard } from "@/composables/useCopyToClipboard"
import { localizedText } from "@/i18n"
import { buildInviteUrl } from "@/lib/utils"
import {
  deriveGameStatus,
  formatTimestamp,
  getCanonicalSessionRoute,
} from "@/lib/sessionHelpers"
import { getPhaseLabel } from "@/lib/uiCopy"
import { gameService } from "@/services/gameService"
import type {
  Game,
  GameStatusSummary,
  StartSessionResult,
} from "@/types/domain"

const route = useRoute()
const router = useRouter()
const game = ref<Game | null>(null)
const gameStatus = ref<GameStatusSummary | null>(null)
const session = ref<StartSessionResult | null>(null)
const isLaunching = ref(false)
const isLoading = ref(false)
const isDeleting = ref(false)
const isEndingSession = ref(false)
const error = ref<string | null>(null)
const { copied: inviteCopied, copy: copyToClipboard } = useCopyToClipboard(1800)
const isDeleteOpen = ref(false)
const isEndSessionOpen = ref(false)
const expandedQuestionIds = ref(new Set<string>())
const { t } = useI18n()

const currentSession = computed(() => {
  if (session.value) return session.value
  if (!gameStatus.value?.activeSessionId || !gameStatus.value.activeInviteCode)
    return null

  return {
    sessionId: gameStatus.value.activeSessionId,
    inviteCode: gameStatus.value.activeInviteCode,
    reusedExisting: true,
  } satisfies StartSessionResult
})

const inviteUrl = computed(() =>
  currentSession.value ? buildInviteUrl(currentSession.value.inviteCode) : "",
)
const statusMeta = computed(() =>
  gameStatus.value ? deriveGameStatus(gameStatus.value) : null,
)
const activeSessionRoute = computed(() => {
  if (!gameStatus.value?.activeSessionId || !gameStatus.value.activePhase)
    return ""
  return getCanonicalSessionRoute(
    gameStatus.value.activeSessionId,
    gameStatus.value.activePhase,
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

function localizedQuestionPrompt(question: Game["questions"][number]) {
  if (!game.value) return question.prompt
  return localizedText(
    question.prompt,
    question.promptI18n,
    game.value.primaryLocale,
  )
}

function localizedOptionText(
  option: Game["questions"][number]["options"][number],
) {
  if (!game.value) return option.text
  return localizedText(option.text, option.textI18n, game.value.primaryLocale)
}

function localizedRevealText(question: Game["questions"][number]) {
  if (!game.value || !question.revealText) return ""
  return localizedText(
    question.revealText,
    question.revealTextI18n,
    game.value.primaryLocale,
  )
}

function isQuestionExpanded(questionId: string) {
  return expandedQuestionIds.value.has(questionId)
}

function toggleQuestionDetails(questionId: string) {
  const next = new Set(expandedQuestionIds.value)
  if (next.has(questionId)) next.delete(questionId)
  else next.add(questionId)
  expandedQuestionIds.value = next
}

onMounted(async () => {
  isLoading.value = true
  error.value = null

  try {
    const gameId = route.params.gameId as string
    const [loadedGame, loadedStatus] = await Promise.all([
      gameService.getGame(gameId),
      gameService.getGameStatus(gameId),
    ])

    game.value = loadedGame
    gameStatus.value = loadedStatus
  } catch (loadError) {
    error.value =
      loadError instanceof Error
        ? loadError.message
        : t("gameManageView.loadError")
  } finally {
    isLoading.value = false
  }
})

async function launchSession() {
  if (!game.value) return

  isLaunching.value = true
  error.value = null

  try {
    session.value = await gameService.startSession(game.value.id)
    gameStatus.value = await gameService.getGameStatus(game.value.id)
    const nextRoute =
      gameStatus.value?.activeSessionId && gameStatus.value.activePhase
        ? getCanonicalSessionRoute(
            gameStatus.value.activeSessionId,
            gameStatus.value.activePhase,
          )
        : `/session/${session.value.sessionId}/lobby`

    await router.push(nextRoute)
  } catch (launchError) {
    error.value =
      launchError instanceof Error
        ? launchError.message
        : t("gameManageView.launchError")
  } finally {
    isLaunching.value = false
  }
}

async function copyInvite() {
  if (!inviteUrl.value) return
  await copyToClipboard(inviteUrl.value)
}

async function endActiveSession() {
  const sessionId = gameStatus.value?.activeSessionId
  if (!sessionId || !game.value) return

  isEndingSession.value = true
  error.value = null

  try {
    await gameService.cancelSession(sessionId)
    isEndSessionOpen.value = false
    session.value = null
    gameStatus.value = await gameService.getGameStatus(game.value.id)
  } catch (endError) {
    error.value =
      endError instanceof Error
        ? endError.message
        : t("gameManageView.endRoomError")
  } finally {
    isEndingSession.value = false
  }
}

async function deleteTemplate() {
  if (!game.value) return

  isDeleting.value = true
  error.value = null

  try {
    await gameService.deleteGame(game.value.id)
    isDeleteOpen.value = false
    await router.push("/library")
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : t("gameManageView.deleteError")
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <PageShell padded stack>
    <GameManageSkeleton v-if="isLoading && !game" />

    <SurfacePanel v-else-if="error" role="alert" class="text-sm text-error">
      {{ error }}
    </SurfacePanel>

    <div
      v-else-if="game"
      class="flex flex-col gap-[var(--space-section-mobile)] md:gap-[var(--space-section-desktop)]"
    >
      <section
        class="family-stage p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)]"
      >
        <div class="flex flex-wrap items-center gap-3">
          <Badge tone="accent">{{ t("gameManageView.badge") }}</Badge>
          <Badge v-if="statusMeta" :tone="statusMeta.tone">
            {{ statusMeta.label }}
          </Badge>
        </div>

        <h1
          class="app-title mt-6 max-w-4xl font-display font-semibold text-white"
        >
          {{ localizedGameTitle }}
        </h1>
        <p class="mt-4 max-w-3xl text-base leading-7 text-inverse-body">
          {{ t("gameManageView.body") }}
        </p>

        <div class="mt-8 grid gap-4 md:grid-cols-4">
          <PaperCard class="px-4 py-4">
            <Kicker>{{ t("gameManageView.questions") }}</Kicker>
            <p class="mt-3 text-3xl font-semibold text-foreground">
              {{ game.questions.length }}
            </p>
          </PaperCard>
          <PaperCard class="px-4 py-4">
            <Kicker>{{ t("gameManageView.updated") }}</Kicker>
            <p class="mt-3 text-sm text-[color:var(--text-muted)]">
              {{ formatTimestamp(game.updatedAt) }}
            </p>
          </PaperCard>
          <PaperCard class="px-4 py-4">
            <Kicker>
              {{ t("gameManageView.defaultQuestionPoints") }}
            </Kicker>
            <p class="mt-3 text-3xl font-semibold text-foreground">
              {{
                t("gameManageView.points", {
                  score: game.defaultQuestionPoints,
                })
              }}
            </p>
          </PaperCard>
          <PaperCard class="px-4 py-4">
            <Kicker>{{ t("gameManageView.room") }}</Kicker>
            <p class="mt-3 text-sm text-[color:var(--text-muted)]">
              {{
                gameStatus?.activePhase
                  ? getPhaseLabel(gameStatus.activePhase)
                  : t("libraryView.noRoomLive")
              }}
            </p>
          </PaperCard>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-2">
        <SurfacePanel strong padded="lg">
          <Kicker>{{ t("gameManageView.quizKicker") }}</Kicker>
          <p
            class="mt-4 text-3xl font-semibold tracking-[-0.05em] text-foreground"
          >
            {{
              t("gameManageView.quizReady", { count: game.questions.length })
            }}
          </p>
          <p class="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            {{
              t("gameManageView.lastUpdated", {
                value: formatTimestamp(game.updatedAt),
              })
            }}
          </p>

          <div class="mt-6 flex flex-wrap gap-3">
            <Button :to="`/games/${game.id}/edit`">{{
              t("libraryView.editQuiz")
            }}</Button>
            <Button :to="`/games/${game.id}/walkthrough`" variant="secondary">
              {{ t("gameManageView.walkthrough") }}
            </Button>
            <Button to="/games/new" variant="secondary">
              {{ t("common.newQuiz") }}
            </Button>
            <Button variant="danger" @click="isDeleteOpen = true">
              {{ t("common.deleteQuiz") }}
            </Button>
          </div>
        </SurfacePanel>

        <SurfacePanel padded="lg">
          <Kicker>{{ t("gameManageView.liveRoomKicker") }}</Kicker>
          <p
            class="mt-4 text-3xl font-semibold tracking-[-0.05em] text-foreground"
          >
            {{
              gameStatus?.activeSessionId
                ? t("gameManageView.liveRoomActive")
                : t("gameManageView.liveRoomInactive")
            }}
          </p>
          <p class="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
            {{ t("gameManageView.liveRoomBody") }}
          </p>

          <div
            v-if="gameStatus?.activeSessionId"
            class="mt-5 rounded-[1.2rem] border border-primary/14 bg-primary/8 p-4 text-sm text-[color:var(--text-muted)]"
          >
            <p class="font-semibold text-foreground">
              {{
                t("gameManageView.roomCode", {
                  code: gameStatus.activeInviteCode,
                })
              }}
            </p>
            <p class="mt-1">
              {{
                t("gameManageView.roomStatusLine", {
                  phase: gameStatus.activePhase
                    ? getPhaseLabel(gameStatus.activePhase)
                    : t("gameManageView.roomLive"),
                  detail: statusMeta?.detail,
                  updatedAt: formatTimestamp(gameStatus.activeSessionUpdatedAt),
                })
              }}
            </p>
          </div>

          <div class="mt-6 flex flex-wrap gap-3">
            <Button :disabled="isLaunching" @click="launchSession">
              {{
                isLaunching
                  ? t("common.opening")
                  : gameStatus?.activeSessionId
                    ? t("common.reopenRoom")
                    : t("common.startRoom")
              }}
            </Button>
            <Button
              v-if="activeSessionRoute"
              :to="activeSessionRoute"
              variant="secondary"
            >
              {{ t("common.openRoom") }}
            </Button>
            <Button
              v-if="gameStatus?.activeSessionId"
              variant="danger"
              @click="isEndSessionOpen = true"
            >
              {{ t("common.endRoom") }}
            </Button>
          </div>
        </SurfacePanel>

        <SurfacePanel v-if="currentSession" padded="lg" class="xl:col-span-2">
          <Kicker>{{ t("gameManageView.roomLink") }}</Kicker>
          <p
            class="mt-3 rounded-[1.1rem] border border-warm-border-soft bg-white/84 p-4 text-sm text-[color:var(--text-muted)]"
          >
            {{ inviteUrl }}
          </p>
          <div class="mt-5 flex flex-wrap gap-3">
            <Button aria-live="polite" @click="copyInvite">{{
              inviteCopied ? t("common.linkCopied") : t("common.copyLink")
            }}</Button>
            <Button
              :to="`/join/${currentSession.inviteCode}`"
              variant="secondary"
            >
              {{ t("common.openJoinPage") }}
            </Button>
          </div>
          <p
            v-if="currentSession.reusedExisting"
            class="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
          >
            {{ t("gameManageView.usingCurrentRoom") }}
          </p>
        </SurfacePanel>
      </section>

      <SurfacePanel padded="none" class="overflow-hidden">
        <article
          v-for="(question, index) in game.questions"
          :key="question.id"
          class="px-5 py-6 md:px-6"
          :class="index !== game.questions.length - 1 ? 'surface-line' : ''"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Kicker>
                {{
                  t("gameManageView.questionLabel", {
                    number: question.position + 1,
                  })
                }}
              </Kicker>
              <p
                class="mt-3 max-w-5xl text-xl font-semibold leading-8 text-foreground"
              >
                {{ localizedQuestionPrompt(question) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <span class="soft-pill">{{
                t("gameManageView.seconds", { count: question.durationSeconds })
              }}</span>
              <span class="soft-pill">{{
                t("gameManageView.points", { score: question.points })
              }}</span>
              <Button
                size="sm"
                variant="secondary"
                :aria-expanded="isQuestionExpanded(question.id)"
                @click="toggleQuestionDetails(question.id)"
              >
                {{
                  isQuestionExpanded(question.id)
                    ? t("gameManageView.hideDetails")
                    : t("gameManageView.showDetails")
                }}
              </Button>
            </div>
          </div>

          <template v-if="isQuestionExpanded(question.id)">
            <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <PaperCard
                v-for="option in question.options"
                :key="option.id"
                class="px-4 py-4 text-sm"
                :class="
                  question.correctOptionId === option.id
                    ? 'border-primary/24 bg-[linear-gradient(180deg,rgba(207,123,82,0.08),rgba(255,255,255,0.92))]'
                    : 'text-[color:var(--warm-ink-soft)]'
                "
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="font-medium text-foreground">{{
                    localizedOptionText(option)
                  }}</span>
                  <span
                    class="rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                    :class="
                      question.correctOptionId === option.id
                        ? 'border-primary/20 bg-primary/10 text-primary'
                        : 'border-warm-border-soft bg-white/70 text-[color:var(--warm-ink-soft)]'
                    "
                  >
                    {{
                      question.correctOptionId === option.id
                        ? t("gameManageView.correct")
                        : t("gameManageView.option")
                    }}
                  </span>
                </div>
              </PaperCard>
            </div>

            <div
              v-if="
                question.media ||
                question.revealMedia ||
                localizedRevealText(question)
              "
              class="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
            >
              <SurfacePanel v-if="question.media">
                <Kicker>
                  {{ t("gameManageView.questionMedia") }}
                </Kicker>
                <div class="mt-4">
                  <MediaAsset
                    :media="question.media"
                    :alt="t('gameManageView.questionMediaAlt')"
                    fit="contain"
                  />
                </div>
              </SurfacePanel>

              <SurfacePanel v-if="question.revealMedia">
                <Kicker>
                  {{ t("gameManageView.revealMedia") }}
                </Kicker>
                <div class="mt-4">
                  <MediaAsset
                    :media="question.revealMedia"
                    :alt="t('gameManageView.revealMediaAlt')"
                    fit="contain"
                  />
                </div>
              </SurfacePanel>

              <SurfacePanel
                v-if="localizedRevealText(question)"
                strong
                class="text-base leading-7 font-medium text-foreground"
              >
                <Kicker class="text-primary">
                  {{ t("gameManageView.answerNote") }}
                </Kicker>
                <p class="mt-3">{{ localizedRevealText(question) }}</p>
              </SurfacePanel>
            </div>
          </template>
        </article>
      </SurfacePanel>
    </div>

    <ConfirmDialog
      :is-open="isDeleteOpen"
      :title="t('gameManageView.deleteQuizTitle')"
      :description="
        gameStatus?.activeSessionId
          ? t('gameManageView.deleteQuizDescriptionWithRoom')
          : t('gameManageView.deleteQuizDescription')
      "
      :confirm-label="t('common.deleteQuiz')"
      confirm-tone="danger"
      :is-confirming="isDeleting"
      @cancel="isDeleteOpen = false"
      @confirm="deleteTemplate"
    />

    <ConfirmDialog
      :is-open="isEndSessionOpen"
      :title="t('gameManageView.endRoomTitle')"
      :description="t('gameManageView.endRoomDescription')"
      :confirm-label="t('common.endRoom')"
      confirm-tone="danger"
      :is-confirming="isEndingSession"
      @cancel="isEndSessionOpen = false"
      @confirm="endActiveSession"
    />
  </PageShell>
</template>
