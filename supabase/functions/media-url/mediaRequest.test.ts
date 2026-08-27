import { describe, expect, it } from "vitest"

import { MAX_REQUESTED_PATHS, parseMediaUrlRequest } from "./mediaRequest.ts"

describe("parseMediaUrlRequest", () => {
  it("accepts a batch of paths and deduplicates them", () => {
    const parsed = parseMediaUrlRequest({
      paths: ["assets/a.webp", "assets/a.webp", "assets/b.mp4"],
    })

    expect(parsed).toEqual({
      ok: true,
      request: { paths: ["assets/a.webp", "assets/b.mp4"], sessionId: null },
    })
  })

  it("keeps a valid session id", () => {
    const sessionId = "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8"
    const parsed = parseMediaUrlRequest({ paths: ["assets/a.webp"], sessionId })

    expect(parsed).toEqual({
      ok: true,
      request: { paths: ["assets/a.webp"], sessionId },
    })
  })

  it("rejects a body that is not an object", () => {
    expect(parseMediaUrlRequest("assets/a.webp")).toEqual({
      ok: false,
      error: "Expected a JSON body",
    })
  })

  it("rejects an empty batch", () => {
    expect(parseMediaUrlRequest({ paths: [] })).toEqual({
      ok: false,
      error: "Expected at least one media path",
    })
  })

  it("rejects a batch above the limit", () => {
    const paths = Array.from(
      { length: MAX_REQUESTED_PATHS + 1 },
      (_, index) => `assets/${index}.webp`,
    )

    expect(parseMediaUrlRequest({ paths })).toEqual({
      ok: false,
      error: `Request at most ${MAX_REQUESTED_PATHS} media paths`,
    })
  })

  it("rejects a non-string path", () => {
    expect(parseMediaUrlRequest({ paths: ["assets/a.webp", 7] })).toEqual({
      ok: false,
      error: "Media paths must be non-empty strings",
    })
  })

  it("rejects a session id that is not a uuid", () => {
    expect(
      parseMediaUrlRequest({ paths: ["assets/a.webp"], sessionId: "nope" }),
    ).toEqual({ ok: false, error: "Session id must be a uuid" })
  })
})
