<script setup lang="ts">
import { computed } from "vue"
import { useI18n } from "vue-i18n"

import { useFrameTimer } from "@/composables/useFrameTimer"
import { serverNow } from "@/stores/serverClock"
import { formatSeconds } from "@/lib/utils"

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    startIso: string | null | undefined
    endIso: string | null | undefined
    isPaused: boolean
    mode?: "ring" | "bar"
    size?: "sm" | "md" | "lg"
    label?: string
    serverSynced?: boolean
  }>(),
  {
    mode: "ring",
    size: "md",
    label: undefined,
    serverSynced: true,
  },
)

type SizeKey = "sm" | "md" | "lg"

const SIZE_PRESETS: Record<
  SizeKey,
  {
    ring: number
    viewBox: string
    c: number
    r: number
    stroke: number
    outer: string
    inner: string
    text: string
    pausedText: string
  }
> = {
  sm: {
    ring: 194.78,
    viewBox: "0 0 72 72",
    c: 36,
    r: 31,
    stroke: 6,
    outer: "size-18",
    inner: "size-13",
    text: "text-lg",
    pausedText: "text-[0.7rem] tracking-[-0.01em]",
  },
  md: {
    ring: 257.61,
    viewBox: "0 0 96 96",
    c: 48,
    r: 41,
    stroke: 6,
    outer: "size-24",
    inner: "size-18",
    text: "text-[1.8rem]",
    pausedText: "text-sm tracking-[-0.01em]",
  },
  lg: {
    ring: 320.44,
    viewBox: "0 0 120 120",
    c: 60,
    r: 51,
    stroke: 8,
    outer: "size-34",
    inner: "size-25",
    text: "text-[2.45rem]",
    pausedText: "text-sm tracking-[-0.01em]",
  },
}

const preset = computed(() => SIZE_PRESETS[props.size])

const { remainingMs } = useFrameTimer(
  () => props.endIso,
  () => props.isPaused,
  () => (props.serverSynced ? serverNow() : Date.now()),
)

const timerLabel = computed(() => {
  if (props.isPaused) return t("timer.paused")
  return formatSeconds(Math.ceil(remainingMs.value / 1000))
})

const timerProgress = computed(() => {
  if (props.isPaused) return 100
  if (!props.startIso || !props.endIso) return 100
  const total =
    new Date(props.endIso).getTime() - new Date(props.startIso).getTime()
  if (total <= 0) return 100
  return Math.max(0, Math.min(100, (remainingMs.value / total) * 100))
})

const innerTextClass = computed(() =>
  props.isPaused ? preset.value.pausedText : preset.value.text,
)
</script>

<template>
  <div
    v-if="props.mode === 'bar'"
    class="w-full rounded-[1.1rem] border border-white/14 bg-white/10 px-4 py-3 text-white"
    role="timer"
    :aria-label="t('timer.remainingAria', { label: timerLabel })"
  >
    <div class="flex items-center justify-between gap-4">
      <p
        class="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--text-inverse-muted)]"
      >
        {{
          props.label ?? (isPaused ? t("timer.paused") : t("timer.nextPhase"))
        }}
      </p>
      <p class="text-sm font-semibold text-white">{{ timerLabel }}</p>
    </div>
    <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
      <div
        class="h-full w-full origin-left bg-[linear-gradient(90deg,#d78a62,#e7baa1)]"
        :style="{ transform: `scaleX(${timerProgress / 100})` }"
      />
    </div>
  </div>

  <div v-else class="relative grid place-items-center" :class="preset.outer">
    <svg
      class="absolute inset-0 -rotate-90"
      :viewBox="preset.viewBox"
      aria-hidden="true"
    >
      <circle
        :cx="preset.c"
        :cy="preset.c"
        :r="preset.r"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        :stroke-width="preset.stroke"
      />
      <circle
        :cx="preset.c"
        :cy="preset.c"
        :r="preset.r"
        fill="none"
        stroke="#d78a62"
        :stroke-width="preset.stroke"
        stroke-linecap="round"
        :stroke-dasharray="preset.ring"
        :stroke-dashoffset="preset.ring * (1 - timerProgress / 100)"
      />
    </svg>
    <div
      class="relative grid place-items-center rounded-full border border-white/14 bg-[linear-gradient(180deg,rgba(246,169,123,0.94),rgba(194,112,72,0.96))] text-center text-white shadow-[0_18px_34px_rgba(94,51,29,0.28)]"
      :class="preset.inner"
      role="timer"
      :aria-label="t('timer.remainingAria', { label: timerLabel })"
    >
      <p
        class="font-display font-semibold tracking-[-0.04em] text-white"
        :class="innerTextClass"
      >
        {{ timerLabel }}
      </p>
    </div>
  </div>
</template>
