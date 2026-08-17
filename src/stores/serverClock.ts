import { defineStore } from "pinia"
import { ref } from "vue"

import { gameService } from "@/services/gameService"

const MAX_PROBE_RTT_MS = 1500
const PROBE_INTERVAL_MS = 30_000
const INITIAL_PROBE_COUNT = 3
const INITIAL_PROBE_DELAY_MS = 350
const EMA_ALPHA = 0.35

export const useServerClockStore = defineStore("serverClock", () => {
  const offsetMs = ref(0)
  const lastSyncedAt = ref<number | null>(null)
  const isRunning = ref(false)

  let probeTimer: ReturnType<typeof setTimeout> | null = null
  let activeProbe: Promise<void> | null = null
  let visibilityHandler: (() => void) | null = null
  let onlineHandler: (() => void) | null = null

  function scheduleNextProbe(delayMs = PROBE_INTERVAL_MS) {
    if (probeTimer) {
      clearTimeout(probeTimer)
      probeTimer = null
    }
    if (!isRunning.value) return
    probeTimer = setTimeout(() => {
      probeTimer = null
      void probe()
    }, delayMs)
  }

  async function probe(): Promise<void> {
    if (!isRunning.value) return
    if (activeProbe) return activeProbe

    activeProbe = (async () => {
      const t0 = Date.now()
      try {
        const serverMs = await gameService.getServerTime()
        if (!isRunning.value) return
        const t1 = Date.now()
        const rtt = t1 - t0
        if (rtt > MAX_PROBE_RTT_MS) return

        const sampleOffset = serverMs - (t0 + rtt / 2)
        if (lastSyncedAt.value == null) {
          offsetMs.value = sampleOffset
        } else {
          offsetMs.value =
            EMA_ALPHA * sampleOffset + (1 - EMA_ALPHA) * offsetMs.value
        }
        lastSyncedAt.value = Date.now()
      } catch {
        // Swallow — fall back to local clock and retry on next interval.
      } finally {
        activeProbe = null
        scheduleNextProbe()
      }
    })()

    return activeProbe
  }

  async function runInitialProbes() {
    for (let i = 0; i < INITIAL_PROBE_COUNT; i += 1) {
      if (!isRunning.value) return
      await probe()
      if (i < INITIAL_PROBE_COUNT - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, INITIAL_PROBE_DELAY_MS),
        )
      }
    }
  }

  function attachWindowListeners() {
    if (typeof window === "undefined" || visibilityHandler) return
    visibilityHandler = () => {
      if (document.visibilityState === "visible") void probe()
    }
    onlineHandler = () => void probe()
    document.addEventListener("visibilitychange", visibilityHandler)
    window.addEventListener("online", onlineHandler)
  }

  function detachWindowListeners() {
    if (typeof window === "undefined") return
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler)
      visibilityHandler = null
    }
    if (onlineHandler) {
      window.removeEventListener("online", onlineHandler)
      onlineHandler = null
    }
  }

  function start() {
    if (isRunning.value) return
    isRunning.value = true
    attachWindowListeners()
    void runInitialProbes()
  }

  function stop() {
    if (!isRunning.value) return
    isRunning.value = false
    if (probeTimer) {
      clearTimeout(probeTimer)
      probeTimer = null
    }
    detachWindowListeners()
  }

  function now(): number {
    return Math.floor(Date.now() + offsetMs.value)
  }

  return {
    offsetMs,
    lastSyncedAt,
    isRunning,
    start,
    stop,
    probe,
    now,
  }
})

export function serverNow(): number {
  return useServerClockStore().now()
}
