<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"

import LibraryListSkeleton from "@/components/library/LibraryListSkeleton.vue"
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue"
import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import {
  deriveGameStatus,
  formatTimestamp,
  getCanonicalSessionRoute,
} from "@/lib/sessionHelpers"
import { gameService } from "@/services/gameService"
import type { GameStatusSummary } from "@/types/domain"
const games = ref<GameStatusSummary[]>([])
const isLoading = ref(false)
const isDeleting = ref(false)
const isEndingSession = ref(false)
const error = ref<string | null>(null)
const pendingDelete = ref<GameStatusSummary | null>(null)
const pendingEndSession = ref<GameStatusSummary | null>(null)
const { t } = useI18n()
const router = useRouter()

const gameRows = computed(() =>
  games.value.map((game) => ({ game, status: deriveGameStatus(game) })),
)

async function loadGames() {
  isLoading.value = true
  error.value = null

  try {
    games.value = await gameService.listOwnedGameStatuses()
  } catch (loadError) {
    error.value =
      loadError instanceof Error
        ? loadError.message
        : t("libraryView.loadError")
  } finally {
    isLoading.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return

  isDeleting.value = true
  error.value = null

  try {
    await gameService.deleteGame(pendingDelete.value.gameId)
    pendingDelete.value = null
    await loadGames()
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : t("libraryView.deleteError")
  } finally {
    isDeleting.value = false
  }
}

async function confirmEndSession() {
  const sessionId = pendingEndSession.value?.activeSessionId
  if (!sessionId) return

  isEndingSession.value = true
  error.value = null

  try {
    await gameService.cancelSession(sessionId)
    pendingEndSession.value = null
    await loadGames()
  } catch (endError) {
    error.value =
      endError instanceof Error
        ? endError.message
        : t("libraryView.endRoomError")
  } finally {
    isEndingSession.value = false
  }
}

function openGame(gameId: string) {
  void router.push(`/games/${gameId}`)
}

onMounted(() => {
  void loadGames()
})
</script>

<template>
  <PageShell padded stack>
    <div
      class="family-stage p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)]"
    >
      <div class="relative flex flex-wrap items-end justify-between gap-5">
        <div>
          <Kicker class="text-inverse-muted">
            {{ t("libraryView.kicker") }}
          </Kicker>
          <h1
            class="app-title mt-4 max-w-3xl font-display font-semibold text-white"
          >
            {{ t("libraryView.title") }}
          </h1>
          <p class="mt-4 max-w-2xl text-base leading-7 text-inverse-body">
            {{ t("libraryView.body") }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <Button to="/sessions/history" variant="secondary">
            {{ t("nav.pastRooms") }}
          </Button>
          <Button to="/games/new">{{ t("common.newQuiz") }}</Button>
        </div>
      </div>
    </div>

    <LibraryListSkeleton v-if="isLoading && games.length === 0" />

    <SurfacePanel v-else-if="error" role="alert" class="text-sm text-error">
      {{ error }}
    </SurfacePanel>

    <SurfacePanel v-else-if="!games.length" padded="lg">
      <p class="text-lg font-semibold text-foreground">
        {{ t("libraryView.emptyTitle") }}
      </p>
      <p class="mt-2 max-w-xl text-sm leading-6 text-[color:var(--text-muted)]">
        {{ t("libraryView.emptyBody") }}
      </p>
      <Button to="/games/new" class="mt-5">
        {{ t("common.createQuiz") }}
      </Button>
    </SurfacePanel>

    <SurfacePanel v-else padded="none" class="overflow-hidden">
      <article
        v-for="({ game, status }, index) in gameRows"
        :key="game.gameId"
        class="grid cursor-pointer items-center gap-5 px-5 py-5 transition duration-200 hover:bg-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(16rem,1fr)_minmax(7rem,auto)_minmax(8rem,auto)_auto] md:px-6"
        :class="index !== gameRows.length - 1 ? 'surface-line' : ''"
        role="link"
        tabindex="0"
        @click="openGame(game.gameId)"
        @keydown.enter="openGame(game.gameId)"
        @keydown.space.prevent="openGame(game.gameId)"
      >
        <div class="min-w-0">
          <h2
            class="truncate text-xl font-semibold tracking-[-0.04em] text-foreground md:text-2xl"
          >
            {{ game.title }}
          </h2>
          <div class="mt-2 flex flex-wrap items-center gap-2.5">
            <p class="text-sm text-[color:var(--text-muted)]">
              {{
                t("libraryView.updatedAt", {
                  value: formatTimestamp(game.updatedAt),
                })
              }}
            </p>
            <Badge
              :tone="status.tone"
              class="px-3 py-1 text-xs normal-case tracking-normal"
            >
              {{ status.label }}
            </Badge>
            <span class="soft-pill px-3 py-1 text-xs">
              {{
                t("libraryView.questionsCount", { count: game.questionCount })
              }}
            </span>
          </div>
        </div>

        <div>
          <p class="text-xs font-semibold text-[color:var(--text-muted)]">
            {{ t("libraryView.room") }}
          </p>
          <p class="mt-1 text-base font-semibold text-foreground">
            {{ status.detail }}
          </p>
        </div>

        <div>
          <p class="text-xs font-semibold text-[color:var(--text-muted)]">
            {{ t("libraryView.code") }}
          </p>
          <p class="mt-1 text-base font-semibold text-foreground">
            {{ game.activeInviteCode ?? t("libraryView.noRoomLive") }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3 md:justify-end">
          <Button
            :to="`/games/${game.gameId}/edit`"
            size="sm"
            variant="secondary"
            @click.stop
          >
            {{ t("common.edit") }}
          </Button>
          <Button
            v-if="game.activeSessionId && game.activePhase"
            :to="
              getCanonicalSessionRoute(game.activeSessionId, game.activePhase)
            "
            size="sm"
            variant="secondary"
            @click.stop
          >
            {{ t("common.openRoom") }}
          </Button>
          <Button
            v-if="game.activeSessionId"
            size="sm"
            variant="danger"
            @click.stop="pendingEndSession = game"
          >
            {{ t("common.endRoom") }}
          </Button>
          <Button size="sm" variant="danger" @click.stop="pendingDelete = game">
            {{ t("common.delete") }}
          </Button>
        </div>
      </article>
    </SurfacePanel>

    <ConfirmDialog
      :is-open="Boolean(pendingDelete)"
      :title="t('libraryView.deleteQuizTitle')"
      :description="
        pendingDelete?.activeSessionId
          ? t('libraryView.deleteQuizDescriptionWithRoom')
          : t('libraryView.deleteQuizDescription')
      "
      :confirm-label="t('common.deleteQuiz')"
      confirm-tone="danger"
      :is-confirming="isDeleting"
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />

    <ConfirmDialog
      :is-open="Boolean(pendingEndSession)"
      :title="t('libraryView.endRoomTitle')"
      :description="t('libraryView.endRoomDescription')"
      :confirm-label="t('common.endRoom')"
      confirm-tone="danger"
      :is-confirming="isEndingSession"
      @cancel="pendingEndSession = null"
      @confirm="confirmEndSession"
    />
  </PageShell>
</template>
