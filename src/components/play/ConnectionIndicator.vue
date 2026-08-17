<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { WifiOff } from "lucide-vue-next"

import type { SessionRealtimeStatus } from "@/services/realtime"

const props = defineProps<{
  status: SessionRealtimeStatus
}>()

const { t } = useI18n()
const visible = ref(false)
let pendingTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.status,
  (status) => {
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
    if (status === "disconnected") {
      pendingTimer = setTimeout(() => {
        visible.value = true
        pendingTimer = null
      }, 1500)
    } else {
      visible.value = false
    }
  },
  { immediate: true },
)

const label = computed(() => t("connectionStatus.offline"))
</script>

<template>
  <transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-200"
    leave-to-class="opacity-0"
  >
    <div
      v-if="visible"
      role="status"
      aria-live="polite"
      class="pointer-events-none fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[rgba(20,14,11,0.86)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur sm:text-sm"
    >
      <WifiOff class="size-3.5" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
  </transition>
</template>
