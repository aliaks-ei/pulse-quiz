import { useRafFn } from "@vueuse/core"
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue"

export function useFrameTimer(
  endIso: MaybeRefOrGetter<string | null | undefined>,
  isPaused: MaybeRefOrGetter<boolean>,
  nowMs: () => number = Date.now,
) {
  const now = ref(nowMs())

  const { pause, resume } = useRafFn(
    () => {
      now.value = nowMs()

      const target = toValue(endIso)
      if (!target || toValue(isPaused)) {
        pause()
        return
      }

      if (now.value >= new Date(target).getTime()) pause()
    },
    { immediate: false },
  )

  function start() {
    pause()
    const target = toValue(endIso)
    if (!target || toValue(isPaused)) return

    const endTime = new Date(target).getTime()
    now.value = nowMs()
    if (now.value >= endTime) return

    resume()
  }

  watch(() => [toValue(endIso), toValue(isPaused)], start, { immediate: true })

  const remainingMs = computed(() => {
    const target = toValue(endIso)
    if (!target) return 0
    return Math.max(0, new Date(target).getTime() - now.value)
  })

  return { remainingMs }
}
