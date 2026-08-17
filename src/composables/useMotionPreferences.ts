import { useMediaQuery } from "@vueuse/core"
import { computed } from "vue"
import { useReducedMotion } from "motion-v"

const stageEase = [0.22, 1, 0.36, 1] as const
const COMPACT_VIEWPORT_QUERY = "(max-width: 768px)"

export function useMotionPreferences() {
  const prefersReducedMotion = useReducedMotion()
  const isCompactViewport = useMediaQuery(COMPACT_VIEWPORT_QUERY)

  const useGentleMotion = computed(
    () => prefersReducedMotion.value || isCompactViewport.value,
  )
  const allowAmbientMotion = computed(() => !useGentleMotion.value)

  function enter(delay = 0, offset = 22) {
    const distance = useGentleMotion.value ? Math.min(offset, 10) : offset

    return {
      initial: {
        opacity: 0,
        y: distance,
      },
      animate: {
        opacity: 1,
        y: 0,
      },
      exit: {
        opacity: 0,
        y: useGentleMotion.value ? -6 : -14,
      },
      transition: {
        duration: useGentleMotion.value ? 0.24 : 0.42,
        delay,
        ease: stageEase,
      },
    }
  }

  return {
    allowAmbientMotion,
    enter,
    isCompactViewport,
    prefersReducedMotion,
    useGentleMotion,
  }
}
