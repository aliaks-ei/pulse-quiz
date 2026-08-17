import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/supabase", async () => {
  const mod = await import("@/test/mock-supabase")
  return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
})

import { subscribeToSession } from "@/services/realtime"
import {
  emitChannelStatus,
  emitPostgresChange,
  getChannel,
  mockCalls,
  resetMockSupabase,
} from "@/test/mock-supabase"

const handlers = () => ({
  onSessionChange: vi.fn(),
  onPlayerChange: vi.fn(),
  onAnswerChange: vi.fn(),
})

beforeEach(() => {
  resetMockSupabase()
})

describe("subscribeToSession", () => {
  it("opens session, players, and answers channels when a player id is given", () => {
    subscribeToSession("s-1", "p-1", handlers())

    expect(getChannel("session:s-1")).toBeDefined()
    expect(getChannel("session-players:s-1")).toBeDefined()
    expect(getChannel("session-answers:s-1:p-1")).toBeDefined()
  })

  it("skips the answers channel without a player id", () => {
    subscribeToSession("s-1", null, handlers())
    expect(getChannel("session-answers:s-1:null")).toBeUndefined()
    expect(getChannel("session:s-1")).toBeDefined()
  })

  it("reports connected only once every channel is subscribed", () => {
    const onStatus = vi.fn()
    subscribeToSession("s-1", "p-1", handlers(), onStatus)

    emitChannelStatus("session:s-1", "SUBSCRIBED")
    emitChannelStatus("session-players:s-1", "SUBSCRIBED")
    expect(onStatus).toHaveBeenLastCalledWith("connecting")

    emitChannelStatus("session-answers:s-1:p-1", "SUBSCRIBED")
    expect(onStatus).toHaveBeenLastCalledWith("connected")
  })

  it("reports disconnected when any channel errors", () => {
    const onStatus = vi.fn()
    subscribeToSession("s-1", "p-1", handlers(), onStatus)

    emitChannelStatus("session:s-1", "SUBSCRIBED")
    emitChannelStatus("session-players:s-1", "CHANNEL_ERROR")
    expect(onStatus).toHaveBeenLastCalledWith("disconnected")
  })

  it("routes postgres changes to the matching handler", () => {
    const h = handlers()
    subscribeToSession("s-1", "p-1", h)

    const payload = { eventType: "UPDATE", new: { id: "s-1" } }
    emitPostgresChange("session:s-1", payload)
    expect(h.onSessionChange).toHaveBeenCalledWith(payload)

    emitPostgresChange("session-players:s-1", payload)
    expect(h.onPlayerChange).toHaveBeenCalledWith(payload)

    emitPostgresChange("session-answers:s-1:p-1", payload)
    expect(h.onAnswerChange).toHaveBeenCalledWith(payload)
  })

  it("removes every channel on teardown", async () => {
    const teardown = subscribeToSession("s-1", "p-1", handlers())
    await teardown()
    expect(mockCalls.removeChannel).toHaveLength(3)
  })
})
