<script setup lang="ts">
import { motion } from "motion-v"
import { useI18n } from "vue-i18n"

import SessionTimer from "@/components/play/SessionTimer.vue"
import Button from "@/components/ui/Button.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"

defineProps<{
  advanceLabel: string
  isQuestionActive: boolean
  canPause: boolean
  actionError: string | null
  isAdvancing: boolean
  isPausing: boolean
  isResuming: boolean
  timerStartIso: string | null
  timerEndIso: string | null
  isPaused: boolean
}>()

const emit = defineEmits<{
  advance: []
  pause: []
  resume: []
}>()

const motionPreferences = useMotionPreferences()
const { t } = useI18n()
</script>

<template>
  <motion.aside
    class="fixed right-[clamp(1.25rem,4vw,6rem)] top-[clamp(0.55rem,1.5vh,1.5rem)] z-40 flex h-20 items-center justify-end gap-3"
    v-bind="motionPreferences.enter(0.12, 14)"
  >
    <Button
      :disabled="isAdvancing"
      variant="secondary"
      size="lg"
      class="h-[clamp(2.35rem,2.45vw,4.25rem)] px-[clamp(1rem,1.4vw,2.25rem)] text-[clamp(0.85rem,0.85vw,1.45rem)] shadow-[0_16px_36px_rgba(12,8,6,0.2)]"
      @click="emit('advance')"
    >
      {{ isAdvancing ? t("hostControls.moving") : advanceLabel }}
    </Button>

    <template v-if="!isQuestionActive && canPause">
      <Button
        v-if="isPaused"
        :disabled="isResuming"
        size="lg"
        class="h-[clamp(2.35rem,2.45vw,4.25rem)] px-[clamp(1rem,1.4vw,2.25rem)] text-[clamp(0.85rem,0.85vw,1.45rem)] shadow-[0_16px_36px_rgba(12,8,6,0.2)]"
        @click="emit('resume')"
      >
        {{ isResuming ? t("hostControls.starting") : t("hostControls.resume") }}
      </Button>
      <Button
        v-else
        :disabled="isPausing"
        variant="secondary"
        size="lg"
        class="h-[clamp(2.35rem,2.45vw,4.25rem)] px-[clamp(1rem,1.4vw,2.25rem)] text-[clamp(0.85rem,0.85vw,1.45rem)] shadow-[0_16px_36px_rgba(12,8,6,0.2)]"
        @click="emit('pause')"
      >
        {{ isPausing ? t("hostControls.pausing") : t("hostControls.pause") }}
      </Button>
    </template>

    <div class="grid size-20 shrink-0 place-items-center">
      <SessionTimer
        :start-iso="timerStartIso"
        :end-iso="timerEndIso"
        :is-paused="isPaused"
        size="sm"
      />
    </div>

    <p
      v-if="actionError"
      role="alert"
      class="absolute right-0 top-full mt-2 max-w-sm text-right text-sm text-error"
    >
      {{ actionError }}
    </p>
  </motion.aside>
</template>
