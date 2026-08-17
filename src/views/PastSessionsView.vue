<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"

import PastSessionsListSkeleton from "@/components/pastSessions/PastSessionsListSkeleton.vue"
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue"
import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { localizedText } from "@/i18n"
import { formatTimestamp, getCanonicalSessionRoute } from "@/lib/sessionHelpers"
import { getPastRoomLabel } from "@/lib/uiCopy"
import { gameService } from "@/services/gameService"
import type { PastSessionSummary } from "@/types/domain"
const sessions = ref<PastSessionSummary[]>([])
const isLoading = ref(false)
const isDeleting = ref(false)
const error = ref<string | null>(null)
const pendingDelete = ref<PastSessionSummary | null>(null)
const { t } = useI18n()

function phaseLabel(phase: PastSessionSummary["phase"]) {
  return getPastRoomLabel(phase)
}

function phaseTone(phase: PastSessionSummary["phase"]) {
  return phase === "finished" ? ("default" as const) : ("accent" as const)
}

function timestampLabel(session: PastSessionSummary) {
  return session.phase === "finished"
    ? t("pastSessionsView.finishedAt", {
        value: formatTimestamp(session.finishedAt),
      })
    : t("pastSessionsView.endedAt", {
        value: formatTimestamp(session.finishedAt),
      })
}

function localizedSessionTitle(session: PastSessionSummary) {
  return localizedText(session.title, session.titleI18n, session.primaryLocale)
}

const pendingDeleteIsFinished = computed(
  () => pendingDelete.value?.phase === "finished",
)

async function loadSessions() {
  isLoading.value = true
  error.value = null

  try {
    sessions.value = await gameService.listPastSessions()
  } catch (loadError) {
    error.value =
      loadError instanceof Error
        ? loadError.message
        : t("pastSessionsView.loadError")
  } finally {
    isLoading.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return

  isDeleting.value = true
  error.value = null

  try {
    await gameService.cancelSession(pendingDelete.value.sessionId)
    pendingDelete.value = null
    await loadSessions()
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : t("pastSessionsView.deleteError")
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadSessions()
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
            {{ t("pastSessionsView.kicker") }}
          </Kicker>
          <h1
            class="app-title mt-4 max-w-3xl font-display font-semibold text-white"
          >
            {{ t("pastSessionsView.title") }}
          </h1>
          <p class="mt-4 max-w-2xl text-base leading-7 text-inverse-body">
            {{ t("pastSessionsView.body") }}
          </p>
        </div>

        <Button to="/library" variant="secondary">
          {{ t("common.backToMyQuizzes") }}
        </Button>
      </div>
    </div>

    <PastSessionsListSkeleton v-if="isLoading && sessions.length === 0" />

    <SurfacePanel v-else-if="error" role="alert" class="text-sm text-error">
      {{ error }}
    </SurfacePanel>

    <SurfacePanel v-else-if="!sessions.length" padded="lg">
      <p class="text-lg font-semibold text-foreground">
        {{ t("pastSessionsView.emptyTitle") }}
      </p>
      <p class="mt-2 max-w-xl text-sm leading-6 text-[color:var(--text-muted)]">
        {{ t("pastSessionsView.emptyBody") }}
      </p>
    </SurfacePanel>

    <div v-else class="grid gap-3">
      <SurfacePanel
        v-for="session in sessions"
        :key="session.sessionId"
        padded="none"
        class="grid items-center gap-5 px-5 py-5 md:grid-cols-[minmax(16rem,1fr)_minmax(7rem,auto)_minmax(10rem,auto)_auto] md:px-6"
      >
        <div class="min-w-0">
          <h2
            class="truncate text-xl font-semibold tracking-[-0.04em] text-foreground md:text-2xl"
          >
            {{ localizedSessionTitle(session) }}
          </h2>
          <div class="mt-2 flex flex-wrap items-center gap-2.5">
            <p class="text-sm text-[color:var(--text-muted)]">
              {{ timestampLabel(session) }}
            </p>
            <Badge
              :tone="phaseTone(session.phase)"
              class="px-3 py-1 text-xs normal-case tracking-normal"
            >
              {{ phaseLabel(session.phase) }}
            </Badge>
            <span class="soft-pill px-3 py-1 text-xs">
              {{ t("pastSessionsView.invite", { code: session.inviteCode }) }}
            </span>
          </div>
        </div>

        <div>
          <p class="text-xs font-semibold text-[color:var(--text-muted)]">
            {{ t("pastSessionsView.players") }}
          </p>
          <p class="mt-1 text-base font-semibold text-foreground">
            {{ session.playerCount }}
          </p>
        </div>

        <div class="min-w-0">
          <p class="text-xs font-semibold text-[color:var(--text-muted)]">
            {{
              session.phase === "finished"
                ? t("pastSessionsView.winner")
                : t("pastSessionsView.topScorer")
            }}
          </p>
          <p class="mt-1 truncate text-base font-semibold text-foreground">
            {{
              session.winnerName
                ? `${session.winnerName} · ${t("pastSessionsView.points", { score: session.topScore })}`
                : t("pastSessionsView.noScores")
            }}
          </p>
        </div>

        <div class="flex flex-wrap gap-3 md:justify-end">
          <Button
            v-if="session.phase === 'finished'"
            :to="`/session/${session.sessionId}/results`"
            size="sm"
          >
            {{ t("common.openResults") }}
          </Button>
          <Button
            v-else
            :to="getCanonicalSessionRoute(session.sessionId, session.phase)"
            size="sm"
          >
            {{ t("common.openRoom") }}
          </Button>
          <Button
            :to="`/games/${session.gameId}`"
            size="sm"
            variant="secondary"
          >
            {{ t("common.open") }}
          </Button>
          <Button size="sm" variant="danger" @click="pendingDelete = session">
            {{ t("common.delete") }}
          </Button>
        </div>
      </SurfacePanel>
    </div>

    <ConfirmDialog
      :is-open="Boolean(pendingDelete)"
      :title="t('pastSessionsView.deleteRoomTitle')"
      :description="
        pendingDeleteIsFinished
          ? t('pastSessionsView.deleteFinishedDescription')
          : t('pastSessionsView.deleteActiveDescription')
      "
      :confirm-label="t('common.deleteRoom')"
      confirm-tone="danger"
      :is-confirming="isDeleting"
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </PageShell>
</template>
