<script setup lang="ts">
import { computed } from "vue"
import { motion } from "motion-v"
import { useI18n } from "vue-i18n"

import LeaderboardRow from "@/components/play/LeaderboardRow.vue"
import SessionTimer from "@/components/play/SessionTimer.vue"
import Kicker from "@/components/ui/Kicker.vue"
import { useLeaderboardBar } from "@/composables/useLeaderboardBar"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { useSessionStore } from "@/stores/session"
import type { SessionRoundSummaryEntry } from "@/types/domain"

const props = defineProps<{
  presentation?: "host" | "player"
  currentPlayerId?: string | null
  roundNumber: number
  roundTotal: number
  sectionTitle: string | null
  timerStartIso: string | null
  timerEndIso: string | null
  isPaused: boolean
  serverSyncedTimer?: boolean
  entries?: SessionRoundSummaryEntry[]
}>()

const sessionStore = useSessionStore()
const motionPreferences = useMotionPreferences()
const entries = computed(() => props.entries ?? sessionStore.roundSummary)
const currentPlayerEntry = computed(
  () =>
    entries.value.find((entry) => entry.playerId === props.currentPlayerId) ??
    null,
)
const { scoreFill, accent } = useLeaderboardBar(
  entries,
  (entry) => entry.totalScore,
)
const { t } = useI18n()
</script>

<template>
  <div v-if="presentation !== 'player'" class="flex flex-col gap-4">
    <div class="text-center">
      <Kicker class="!text-[color:var(--color-text-inverse-muted)]">
        {{
          t("roundSummary.kicker", { current: roundNumber, total: roundTotal })
        }}
      </Kicker>
      <p
        v-if="sectionTitle"
        class="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text-inverse-body)]"
      >
        {{ sectionTitle }}
      </p>
      <h1 class="gameplay-title mt-4 font-display font-semibold text-white">
        {{ t("roundSummary.title") }}
      </h1>
      <p
        class="mx-auto mt-3 max-w-2xl text-base leading-7 text-[color:var(--color-text-inverse-body)]"
      >
        {{ t("roundSummary.body") }}
      </p>
    </div>

    <div class="space-y-4">
      <motion.div
        v-for="(entry, index) in entries"
        :key="entry.playerId"
        class="rounded-[1.25rem] border border-warm-border-soft bg-[rgba(255,251,247,0.94)] px-4 py-3.5 shadow-[0_8px_20px_rgba(55,37,26,0.06)] backdrop-blur-[8px]"
        layout
        v-bind="motionPreferences.enter(index * 0.04, 14)"
      >
        <LeaderboardRow
          :name="entry.displayName"
          :avatar-key="entry.avatarKey"
          :avatar-asset-path="entry.avatarAssetPath"
          :primary="entry.pointsGained"
          :secondary="String(entry.totalScore)"
          :fill-width="scoreFill(entry.totalScore)"
          :accent="accent(index)"
          primary-class="text-[2.25rem] font-semibold text-primary"
        />
      </motion.div>
    </div>

    <div class="mx-auto max-w-3xl">
      <SessionTimer
        mode="bar"
        :label="t('roundSummary.leaderboardTimer')"
        :start-iso="timerStartIso"
        :end-iso="timerEndIso"
        :is-paused="isPaused"
        :server-synced="serverSyncedTimer !== false"
      />
    </div>
  </div>

  <div v-else class="flex h-full flex-col text-white">
    <div class="text-center">
      <Kicker class="!text-[color:var(--color-text-inverse-muted)]">
        {{
          t("roundSummary.kicker", { current: roundNumber, total: roundTotal })
        }}
      </Kicker>
      <p
        v-if="sectionTitle"
        class="mt-2 truncate text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-text-inverse-body)]"
      >
        {{ sectionTitle }}
      </p>
      <h1 class="gameplay-title mt-4 font-display font-semibold text-white">
        {{ t("roundSummary.yourRound") }}
      </h1>
    </div>

    <motion.div
      v-if="currentPlayerEntry"
      class="mx-auto mt-8 w-full max-w-md rounded-[1.6rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(252,246,239,0.94))] px-5 py-6 text-center text-foreground shadow-[0_22px_52px_rgba(18,12,9,0.18)]"
      role="status"
      aria-live="polite"
      v-bind="motionPreferences.enter(0, 10)"
    >
      <p
        class="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]"
      >
        {{ t("roundSummary.pointsThisRound") }}
      </p>
      <p class="metric-value mt-3 font-display font-semibold text-primary">
        {{ currentPlayerEntry.pointsGained }}
      </p>
      <div class="mt-7 grid grid-cols-2 divide-x divide-warm-border">
        <div class="px-2">
          <p
            class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
          >
            {{ t("roundSummary.score") }}
          </p>
          <p class="mt-2 text-3xl font-semibold">
            {{ currentPlayerEntry.totalScore }}
          </p>
        </div>
        <div class="px-2">
          <p
            class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
          >
            {{ t("roundSummary.position") }}
          </p>
          <p class="mt-2 text-2xl font-semibold">
            #{{ currentPlayerEntry.rank }}
          </p>
        </div>
      </div>
    </motion.div>

    <p
      v-else
      class="mx-auto mt-8 max-w-md rounded-[1.2rem] border border-white/12 bg-white/10 px-4 py-4 text-center text-sm text-[color:var(--color-text-inverse-body)]"
      role="status"
    >
      {{ t("roundSummary.awaitingScore") }}
    </p>

    <div class="mx-auto mt-auto w-full max-w-md pt-8">
      <SessionTimer
        mode="bar"
        :label="t('roundSummary.leaderboardTimer')"
        :start-iso="timerStartIso"
        :end-iso="timerEndIso"
        :is-paused="isPaused"
        :server-synced="serverSyncedTimer !== false"
      />
    </div>
  </div>
</template>
