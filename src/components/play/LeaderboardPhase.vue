<script setup lang="ts">
import { computed } from "vue"
import { motion } from "motion-v"
import { useI18n } from "vue-i18n"

import AvatarPortrait from "@/components/avatars/AvatarPortrait.vue"
import SessionTimer from "@/components/play/SessionTimer.vue"
import Kicker from "@/components/ui/Kicker.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { useSessionStore } from "@/stores/session"
import type { SessionLeaderboardEntry } from "@/types/domain"

const props = defineProps<{
  presentation?: "host" | "player"
  currentPlayerId?: string | null
  roundNumber: number
  sectionTitle: string | null
  timerStartIso: string | null
  timerEndIso: string | null
  isPaused: boolean
  serverSyncedTimer?: boolean
  entries?: SessionLeaderboardEntry[]
}>()

const isManualHold = computed(() => props.timerEndIso == null)

const sessionStore = useSessionStore()
const entries = computed(() => props.entries ?? sessionStore.leaderboard)
const currentPlayerEntry = computed(
  () =>
    entries.value.find((entry) => entry.playerId === props.currentPlayerId) ??
    null,
)
const showPinnedPlayerStanding = computed(
  () =>
    props.presentation === "player" &&
    currentPlayerEntry.value != null &&
    currentPlayerEntry.value.rank > 3,
)
const motionPreferences = useMotionPreferences()
const { t } = useI18n()

function isCurrentPlayer(entry: SessionLeaderboardEntry) {
  return entry.playerId === props.currentPlayerId
}

function playerRowClass(rank: number, isCurrent: boolean) {
  if (isCurrent) {
    return "border-primary/40 bg-[linear-gradient(105deg,rgba(255,247,239,0.99),rgba(255,252,247,0.98))] shadow-[0_16px_32px_rgba(37,23,16,0.15)]"
  }
  if (rank <= 3) {
    return "border-[rgba(207,123,82,0.18)] bg-[rgba(255,252,248,0.97)]"
  }
  return "border-warm-border-soft bg-[rgba(255,251,247,0.93)]"
}
</script>

<template>
  <div
    v-if="presentation !== 'player'"
    class="flex h-full min-h-0 flex-col text-white"
  >
    <motion.div
      class="shrink-0 text-center"
      v-bind="motionPreferences.enter(0, 10)"
    >
      <Kicker class="!text-[color:var(--color-text-inverse-muted)]">
        {{ t("leaderboardPhase.kicker", { round: roundNumber }) }}
      </Kicker>
      <p
        v-if="sectionTitle"
        class="mt-2 text-[clamp(0.7rem,0.85vw,0.9rem)] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-text-inverse-body)]"
      >
        {{ sectionTitle }}
      </p>
      <h1
        class="mt-3 font-display text-[clamp(2.2rem,4.4vw,4.1rem)] font-semibold leading-none tracking-[-0.065em] text-white"
      >
        {{ t("leaderboardPhase.title") }}
      </h1>
    </motion.div>

    <div
      class="mx-auto mt-[clamp(1.1rem,2.5vh,2.25rem)] min-h-0 w-full max-w-[76rem] flex-1 space-y-[clamp(0.45rem,1vh,0.8rem)] overflow-y-auto pb-2 [scrollbar-width:none] md:max-w-[min(76rem,88vw)] [&::-webkit-scrollbar]:hidden"
      :aria-label="t('leaderboardPhase.title')"
    >
      <motion.div
        v-for="(entry, index) in entries"
        :key="entry.playerId"
        class="grid min-h-[clamp(4rem,8.1vh,5.9rem)] grid-cols-[2.25rem_3rem_minmax(0,1fr)_auto] items-center gap-[clamp(0.5rem,1.7vw,1.5rem)] rounded-[clamp(1.15rem,1.7vw,1.75rem)] border border-white/80 bg-[rgba(255,252,247,0.98)] px-[clamp(0.7rem,2vw,1.8rem)] py-[clamp(0.45rem,0.7vw,0.7rem)] text-foreground shadow-[0_14px_30px_rgba(18,12,9,0.13)] sm:grid-cols-[clamp(2.75rem,5vw,5rem)_clamp(3rem,5.6vw,5.25rem)_minmax(0,1fr)_auto]"
        layout
        v-bind="
          motionPreferences.enter(
            motionPreferences.useGentleMotion.value ? 0 : 0.04 + index * 0.045,
            16,
          )
        "
      >
        <p
          class="text-center font-display text-[clamp(1.2rem,2vw,1.75rem)] font-semibold text-primary"
        >
          #{{ entry.rank }}
        </p>
        <AvatarPortrait
          v-if="entry.avatarKey"
          :avatar-key="entry.avatarKey"
          :avatar-asset-path="entry.avatarAssetPath"
          :alt="entry.displayName"
          size="md"
          :selected="isCurrentPlayer(entry)"
          class="!size-[clamp(3rem,5.2vw,4.8rem)]"
        />
        <div v-else />
        <div class="flex min-w-0 items-center gap-3">
          <p
            class="truncate text-[clamp(1.1rem,2.1vw,1.8rem)] font-semibold tracking-[-0.035em]"
          >
            {{ entry.displayName }}
          </p>
          <span
            v-if="isCurrentPlayer(entry)"
            class="shrink-0 rounded-full bg-primary/12 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary"
          >
            {{ t("leaderboardPhase.you") }}
          </span>
        </div>
        <p
          class="shrink-0 pr-[clamp(0.35rem,0.9vw,0.85rem)] text-[clamp(1.65rem,3.1vw,2.6rem)] font-semibold tracking-[-0.045em] text-primary"
        >
          {{ entry.score }}
        </p>
      </motion.div>
    </div>

    <div
      class="mx-auto w-full max-w-[76rem] shrink-0 pt-3 md:max-w-[min(76rem,88vw)]"
    >
      <div
        v-if="isManualHold"
        class="w-full rounded-[1.1rem] border border-white/14 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white"
        role="status"
      >
        {{ t("leaderboardPhase.waitingForHost") }}
      </div>
      <SessionTimer
        v-else
        mode="bar"
        :label="t('leaderboardPhase.nextQuestionTimer')"
        :start-iso="timerStartIso"
        :end-iso="timerEndIso"
        :is-paused="isPaused"
        :server-synced="serverSyncedTimer !== false"
      />
    </div>
  </div>

  <div v-else class="flex h-full min-h-0 flex-col text-white">
    <motion.div
      class="shrink-0 text-center"
      v-bind="motionPreferences.enter(0, 8)"
    >
      <Kicker class="!text-[color:var(--color-text-inverse-muted)]">
        {{ t("leaderboardPhase.kicker", { round: roundNumber }) }}
      </Kicker>
      <p
        v-if="sectionTitle"
        class="mt-2 truncate text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-text-inverse-body)] sm:text-xs"
      >
        {{ sectionTitle }}
      </p>
      <h1
        class="mt-3 font-display text-[clamp(2rem,8vw,2.8rem)] font-semibold leading-none tracking-[-0.06em] text-white"
      >
        {{ t("leaderboardPhase.title") }}
      </h1>
    </motion.div>

    <motion.div
      v-if="showPinnedPlayerStanding && currentPlayerEntry"
      class="mx-auto mt-4 flex w-full max-w-2xl shrink-0 items-center justify-between gap-3 rounded-[1.2rem] border border-primary/38 bg-[rgba(255,249,243,0.98)] px-4 py-3 text-foreground shadow-[0_16px_32px_rgba(18,12,9,0.16)]"
      role="status"
      aria-live="polite"
      v-bind="motionPreferences.enter(0, 8)"
    >
      <div class="flex min-w-0 items-center gap-3">
        <p class="text-xl font-semibold text-primary">
          #{{ currentPlayerEntry.rank }}
        </p>
        <p
          class="truncate text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
        >
          {{ t("leaderboardPhase.yourPosition") }}
        </p>
      </div>
      <p
        class="shrink-0 pr-2 text-2xl font-semibold text-primary sm:pr-3 sm:text-3xl"
      >
        {{ currentPlayerEntry.score }}
      </p>
    </motion.div>

    <div
      class="mx-auto mt-4 min-h-0 w-full max-w-2xl flex-1 space-y-2.5 overflow-y-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-5"
      :aria-label="t('leaderboardPhase.title')"
    >
      <motion.div
        v-for="(entry, index) in entries"
        :key="entry.playerId"
        class="grid min-h-[4.2rem] grid-cols-[2.25rem_3rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[1.15rem] border px-3 py-2.5 text-foreground sm:min-h-[4.8rem] sm:grid-cols-[2.75rem_3.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-4"
        :class="playerRowClass(entry.rank, isCurrentPlayer(entry))"
        layout
        v-bind="
          motionPreferences.enter(
            motionPreferences.useGentleMotion.value ? 0 : index * 0.035,
            8,
          )
        "
      >
        <p class="text-center text-sm font-semibold text-primary sm:text-lg">
          #{{ entry.rank }}
        </p>
        <AvatarPortrait
          v-if="entry.avatarKey"
          :avatar-key="entry.avatarKey"
          :avatar-asset-path="entry.avatarAssetPath"
          :alt="entry.displayName"
          size="sm"
          :selected="isCurrentPlayer(entry)"
          class="sm:!size-14"
        />
        <div v-else />
        <div class="flex min-w-0 items-center gap-2">
          <p class="truncate text-base font-semibold sm:text-xl">
            {{ entry.displayName }}
          </p>
          <span
            v-if="isCurrentPlayer(entry)"
            class="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-primary sm:text-[0.62rem]"
          >
            {{ t("leaderboardPhase.you") }}
          </span>
        </div>
        <p
          class="shrink-0 pr-2 text-xl font-semibold tracking-[-0.03em] text-primary sm:pr-3 sm:text-2xl"
        >
          {{ entry.score }}
        </p>
      </motion.div>
    </div>

    <div class="mx-auto w-full max-w-2xl shrink-0 pt-3">
      <div
        v-if="isManualHold"
        class="w-full rounded-[1.1rem] border border-white/14 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white"
        role="status"
      >
        {{ t("leaderboardPhase.waitingForHost") }}
      </div>
      <SessionTimer
        v-else
        mode="bar"
        :label="t('leaderboardPhase.nextQuestionTimer')"
        :start-iso="timerStartIso"
        :end-iso="timerEndIso"
        :is-paused="isPaused"
        :server-synced="serverSyncedTimer !== false"
      />
    </div>
  </div>
</template>
