<script setup lang="ts">
import { motion } from "motion-v"

import SessionTimer from "@/components/play/SessionTimer.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"

defineProps<{
  kicker?: string
  title: string
  body: string
  timerStartIso?: string | null
  timerEndIso?: string | null
  showTimer?: boolean
  serverSyncedTimer?: boolean
}>()

const motionPreferences = useMotionPreferences()
</script>

<template>
  <section
    class="relative flex h-full max-h-full w-full items-center justify-center overflow-hidden px-6 text-center text-white"
    role="status"
    aria-live="polite"
  >
    <motion.div
      v-if="motionPreferences.allowAmbientMotion.value"
      aria-hidden="true"
      class="absolute size-[min(68vw,32rem)] rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(244,185,145,0.16),transparent_68%)]"
      :animate="{ scale: [0.96, 1.06, 0.96], opacity: [0.5, 0.85, 0.5] }"
      :transition="{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }"
    />
    <motion.div
      class="relative flex max-w-xl flex-col items-center"
      v-bind="motionPreferences.enter(0, 12)"
    >
      <p
        v-if="kicker"
        class="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--text-inverse-muted)]"
      >
        {{ kicker }}
      </p>
      <div aria-hidden="true" class="mt-7 flex items-center gap-2">
        <motion.span
          v-for="index in 3"
          :key="index"
          class="size-2.5 rounded-full bg-[#ef9d70]"
          :animate="
            motionPreferences.allowAmbientMotion.value
              ? { y: [0, -8, 0], opacity: [0.45, 1, 0.45] }
              : undefined
          "
          :transition="{
            duration: 0.9,
            delay: (index - 1) * 0.13,
            repeat: Infinity,
            ease: 'easeInOut',
          }"
        />
      </div>
      <h1
        class="mt-6 font-display text-[clamp(2rem,7.5vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.06em]"
      >
        {{ title }}
      </h1>
      <p
        class="mt-4 max-w-md text-sm leading-6 text-[color:var(--text-inverse-body)] md:text-base"
      >
        {{ body }}
      </p>
      <SessionTimer
        v-if="showTimer && timerEndIso"
        class="mt-8"
        :start-iso="timerStartIso ?? null"
        :end-iso="timerEndIso"
        :is-paused="false"
        :server-synced="serverSyncedTimer !== false"
        size="sm"
      />
    </motion.div>
  </section>
</template>
