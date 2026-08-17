import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"

vi.mock("@/services/gameService", () => ({
  gameService: { getServerTime: vi.fn() },
}))

import { gameService } from "@/services/gameService"
import { useServerClockStore } from "@/stores/serverClock"
import { withTestPinia } from "@/test/pinia"

const getServerTime = gameService.getServerTime as Mock

describe("serverClock store", () => {
  beforeEach(() => {
    withTestPinia()
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    getServerTime.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("now() falls back to the local clock before any sync", () => {
    const store = useServerClockStore()
    expect(store.offsetMs).toBe(0)
    expect(store.now()).toBe(1_000_000)
  })

  it("sets the offset directly from the first probe sample", async () => {
    getServerTime.mockResolvedValue(1_005_000)
    const store = useServerClockStore()
    store.isRunning = true

    await store.probe()

    expect(store.offsetMs).toBe(5000)
    expect(store.now()).toBe(1_005_000)
    expect(store.lastSyncedAt).not.toBeNull()
    store.stop()
  })

  it("blends later samples with an exponential moving average", async () => {
    const store = useServerClockStore()
    store.isRunning = true

    getServerTime.mockResolvedValueOnce(1_005_000)
    await store.probe()
    expect(store.offsetMs).toBe(5000)

    getServerTime.mockResolvedValueOnce(1_009_000)
    await store.probe()
    // 0.35 * 9000 + 0.65 * 5000 = 6400
    expect(store.offsetMs).toBeCloseTo(6400)
    store.stop()
  })

  it("ignores samples whose round-trip exceeds the cap", async () => {
    getServerTime.mockImplementation(async () => {
      vi.setSystemTime(1_002_000) // 2000ms RTT, over the 1500ms cap
      return 1_005_000
    })
    const store = useServerClockStore()
    store.isRunning = true

    await store.probe()

    expect(store.offsetMs).toBe(0)
    expect(store.lastSyncedAt).toBeNull()
    store.stop()
  })

  it("swallows probe errors and keeps the previous offset", async () => {
    getServerTime.mockRejectedValue(new Error("network"))
    const store = useServerClockStore()
    store.isRunning = true

    await expect(store.probe()).resolves.toBeUndefined()
    expect(store.offsetMs).toBe(0)
    store.stop()
  })

  it("start() marks running and stop() halts and is idempotent", () => {
    getServerTime.mockResolvedValue(1_000_000)
    const store = useServerClockStore()

    store.start()
    expect(store.isRunning).toBe(true)

    store.stop()
    expect(store.isRunning).toBe(false)
    // Second stop is a no-op, not an error.
    expect(() => store.stop()).not.toThrow()
  })
})
