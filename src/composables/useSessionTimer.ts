import { useIntervalFn } from "@vueuse/core"
import { computed, ref, toValue, watchEffect, type MaybeRefOrGetter } from "vue"

import { serverNow } from "@/stores/serverClock"

export function useSessionTimer(targetIso: MaybeRefOrGetter<string | null>) {
  const now = ref(serverNow())
  const { pause, resume } = useIntervalFn(
    () => {
      now.value = serverNow()
    },
    500,
    { immediate: false },
  )

  watchEffect((onCleanup) => {
    pause()

    const target = toValue(targetIso)
    if (!target) return

    now.value = serverNow()
    resume()

    onCleanup(pause)
  })

  const remainingMs = computed(() => {
    const target = toValue(targetIso)
    if (!target) return 0
    return Math.max(0, new Date(target).getTime() - now.value)
  })

  return {
    remainingMs,
    remainingSeconds: computed(() => Math.ceil(remainingMs.value / 1000)),
  }
}
