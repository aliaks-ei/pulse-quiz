<script setup lang="ts">
import { computed } from "vue"
import { motion } from "motion-v"
import { useI18n } from "vue-i18n"

import AvatarPortrait from "@/components/avatars/AvatarPortrait.vue"
import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Kicker from "@/components/ui/Kicker.vue"
import { useLeaderboardBar } from "@/composables/useLeaderboardBar"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import type { SessionLeaderboardEntry } from "@/types/domain"

const props = defineProps<{
  title: string
  leaderboardEntries: SessionLeaderboardEntry[]
  currentPlayerId?: string | null
  viewerRole?: "host" | "player" | null
}>()

const { scoreFill } = useLeaderboardBar(
  () => props.leaderboardEntries,
  (entry) => entry.score,
  { minWidthPct: 16 },
)
const { t } = useI18n()
const motionPreferences = useMotionPreferences()
const currentPlayerEntry = computed(
  () =>
    props.leaderboardEntries.find(
      (entry) => entry.playerId === props.currentPlayerId,
    ) ?? null,
)
const isWinningPlayer = computed(
  () => props.viewerRole === "player" && currentPlayerEntry.value?.rank === 1,
)
const topEntries = computed(() =>
  props.leaderboardEntries.filter((entry) => entry.rank === 1),
)
const highlightedWinner = computed(() =>
  isWinningPlayer.value
    ? currentPlayerEntry.value
    : props.leaderboardEntries[0],
)

function rankBadgeClass(rank: number) {
  if (rank === 1) return "bg-[rgba(207,123,82,0.14)] text-primary"
  if (rank === 2) return "bg-[rgba(140,153,132,0.2)] text-[#5c6958]"
  if (rank === 3) return "bg-[rgba(198,151,121,0.18)] text-[#846855]"
  return "bg-[rgba(121,94,77,0.08)] text-[color:var(--warm-ink-soft)]"
}
</script>

<template>
  <PageShell stack>
    <section
      class="family-stage p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)]"
    >
      <div
        class="mx-auto max-w-[42rem] rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,250,246,0.94),rgba(252,244,236,0.9))] p-5 text-center shadow-[0_18px_44px_rgba(35,22,17,0.2)] md:p-6"
      >
        <Badge tone="success">{{ t("resultsView.finished") }}</Badge>
        <Kicker class="mt-6">{{ t("resultsView.kicker") }}</Kicker>
        <h1 class="app-title mt-3 font-display font-semibold text-foreground">
          {{ title || t("resultsView.title") }}
        </h1>

        <motion.div
          v-if="highlightedWinner"
          class="relative mt-6 overflow-hidden rounded-[1.4rem] border px-5 py-5"
          :class="
            isWinningPlayer
              ? 'border-[rgba(207,123,82,0.42)] bg-[linear-gradient(145deg,rgba(255,244,230,0.99),rgba(255,252,247,0.96))] shadow-[0_20px_48px_rgba(207,123,82,0.2)]'
              : 'border-warm-border bg-white/84'
          "
          :initial="isWinningPlayer ? { opacity: 0, scale: 0.97 } : undefined"
          :animate="isWinningPlayer ? { opacity: 1, scale: 1 } : undefined"
          :transition="{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }"
        >
          <template
            v-if="isWinningPlayer && motionPreferences.allowAmbientMotion.value"
          >
            <motion.span
              v-for="index in 8"
              :key="index"
              aria-hidden="true"
              class="absolute left-1/2 top-[42%] h-2.5 w-1.5 rounded-full bg-primary/70"
              :initial="{ opacity: 0, x: 0, y: 0, rotate: 0 }"
              :animate="{
                opacity: [0, 1, 0],
                x: Math.cos((index * Math.PI) / 4) * 112,
                y: Math.sin((index * Math.PI) / 4) * 64,
                rotate: index * 42,
              }"
              :transition="{ duration: 0.9, delay: 0.18, ease: 'easeOut' }"
            />
          </template>
          <div class="flex items-center justify-center gap-4">
            <motion.div
              :animate="
                isWinningPlayer && motionPreferences.allowAmbientMotion.value
                  ? { scale: [1, 1.1, 1] }
                  : undefined
              "
              :transition="{ duration: 0.65, delay: 0.15 }"
            >
              <AvatarPortrait
                :avatar-key="highlightedWinner.avatarKey"
                :avatar-asset-path="highlightedWinner.avatarAssetPath"
                :alt="highlightedWinner.displayName"
                size="xl"
                :selected="isWinningPlayer"
              />
            </motion.div>
            <div class="text-left">
              <p
                class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
              >
                {{
                  isWinningPlayer
                    ? t("resultsView.youWon")
                    : topEntries.length > 1
                      ? t("resultsView.coWinner")
                      : t("resultsView.winner")
                }}
              </p>
              <p class="mt-2 text-2xl font-semibold text-foreground">
                {{ highlightedWinner.displayName }}
              </p>
            </div>
          </div>
          <p class="metric-value mt-5 font-display font-semibold text-primary">
            {{ highlightedWinner.score }}
          </p>
        </motion.div>

        <div class="mt-8 space-y-3 text-left">
          <div
            v-for="entry in leaderboardEntries"
            :key="entry.playerId"
            class="score-row flex items-center justify-between gap-4"
            :style="{ '--score-fill': scoreFill(entry.score) }"
            layout
          >
            <div class="flex min-w-0 items-center gap-4">
              <span
                class="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]"
                :class="rankBadgeClass(entry.rank)"
              >
                #{{ entry.rank }}
              </span>
              <AvatarPortrait
                :avatar-key="entry.avatarKey"
                :avatar-asset-path="entry.avatarAssetPath"
                :alt="entry.displayName"
                size="md"
              />
              <p
                class="truncate text-lg font-semibold text-foreground md:text-xl"
              >
                {{ entry.displayName }}
              </p>
            </div>
            <p class="text-2xl font-semibold text-foreground md:text-3xl">
              {{ entry.score }}
            </p>
          </div>
        </div>

        <slot name="actions" />
        <slot />
      </div>
    </section>
  </PageShell>
</template>
