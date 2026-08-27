import { describe, expect, it } from "vitest"
import { readLimitedBody } from "./requestBody.ts"

function postRequest(body: BodyInit | null) {
  return new Request("https://example.test/upload", { method: "POST", body })
}

describe("readLimitedBody", () => {
  it("returns the whole body when it fits", async () => {
    const result = await readLimitedBody(postRequest("hello"), 16)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(result as Uint8Array)).toBe("hello")
  })

  it("returns the body at exactly the limit", async () => {
    const result = await readLimitedBody(postRequest(new Uint8Array(64)), 64)
    expect((result as Uint8Array).byteLength).toBe(64)
  })

  it("refuses a body one byte past the limit", async () => {
    const result = await readLimitedBody(postRequest(new Uint8Array(65)), 64)
    expect(result).toBe("too-large")
  })

  it("stops reading instead of buffering an oversized body", async () => {
    let chunksRead = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1
        controller.enqueue(new Uint8Array(1024))
      },
    })

    const request = new Request("https://example.test/upload", {
      method: "POST",
      body: stream,
      // @ts-expect-error duplex is required for a streamed request body
      duplex: "half",
    })

    expect(await readLimitedBody(request, 4096)).toBe("too-large")
    expect(chunksRead).toBeLessThan(16)
  })

  it("reports a missing body", async () => {
    expect(await readLimitedBody(postRequest(null), 64)).toBe("empty")
  })
})
