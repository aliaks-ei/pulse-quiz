import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/supabase", async () => {
  const mod = await import("@/test/mock-supabase")
  return { supabase: mod.supabaseMock, isSupabaseConfigured: true }
})

import { translateQuizStream } from "@/services/translationService"
import { resetMockSupabase, setAuthSession } from "@/test/mock-supabase"

function sseResponse(body: string) {
  const encoder = new TextEncoder()
  let sent = false
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read() {
            if (sent) return Promise.resolve({ value: undefined, done: true })
            sent = true
            return Promise.resolve({ value: encoder.encode(body), done: false })
          },
          cancel: () => Promise.resolve(),
          releaseLock: () => {},
        }
      },
    },
  }
}

async function collect(stream: AsyncGenerator<unknown>) {
  const events: unknown[] = []
  for await (const event of stream) events.push(event)
  return events
}

const items = [{ id: "q1", text: "Hello" }]

beforeEach(() => {
  resetMockSupabase()
  setAuthSession({ access_token: "token-123", user: { id: "u1" } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("translateQuizStream", () => {
  it("throws when there is no authenticated session", async () => {
    setAuthSession(null)
    const stream = translateQuizStream("game-1", "en", "ru", items)
    await expect(collect(stream)).rejects.toThrow("No authenticated session")
  })

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          body: null,
          text: () => Promise.resolve("boom"),
        }),
      ),
    )

    const stream = translateQuizStream("game-1", "en", "ru", items)
    await expect(collect(stream)).rejects.toThrow(
      "Translation request failed (500)",
    )
  })

  it("parses progress and done SSE events", async () => {
    const body =
      'event: progress\ndata: {"completed":1,"total":2}\n\n' +
      'event: done\ndata: {"translations":[{"id":"q1","text":"Привет"}]}\n\n'
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(sseResponse(body))),
    )

    const events = await collect(
      translateQuizStream("game-1", "en", "ru", items),
    )

    expect(events).toEqual([
      { type: "progress", payload: { completed: 1, total: 2 } },
      {
        type: "done",
        payload: { translations: [{ id: "q1", text: "Привет" }] },
      },
    ])
  })

  it("emits an error event from the stream", async () => {
    const body =
      'event: error\ndata: {"code":"E","message":"nope","partial":[]}\n\n'
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(sseResponse(body))),
    )

    const events = await collect(
      translateQuizStream("game-1", "en", "ru", items),
    )
    expect(events).toEqual([
      { type: "error", payload: { code: "E", message: "nope", partial: [] } },
    ])
  })

  it("sends the bearer token and payload to the edge function", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(sseResponse("")))
    vi.stubGlobal("fetch", fetchMock)

    await collect(translateQuizStream("game-1", "en", "ru", items))

    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect((options.headers as Record<string, string>).authorization).toBe(
      "Bearer token-123",
    )
    expect(JSON.parse(options.body as string)).toMatchObject({
      gameId: "game-1",
      sourceLocale: "en",
      targetLocale: "ru",
    })
  })
})
