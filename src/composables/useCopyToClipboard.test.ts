import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ writeMock: vi.fn() }))

vi.mock("@vueuse/core", async () => {
  const { ref } = await import("vue")
  return { useClipboard: () => ({ copied: ref(false), copy: h.writeMock }) }
})

import { useCopyToClipboard } from "@/composables/useCopyToClipboard"

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    h.writeMock.mockReset()
  })

  it("returns false for empty input without writing", async () => {
    const { copy } = useCopyToClipboard()
    expect(await copy("")).toBe(false)
    expect(h.writeMock).not.toHaveBeenCalled()
  })

  it("returns true after a successful write", async () => {
    h.writeMock.mockResolvedValue(undefined)
    const { copy } = useCopyToClipboard()

    expect(await copy("ABC123")).toBe(true)
    expect(h.writeMock).toHaveBeenCalledWith("ABC123")
  })

  it("returns false when the clipboard write rejects", async () => {
    h.writeMock.mockRejectedValue(new Error("denied"))
    const { copy } = useCopyToClipboard()

    expect(await copy("ABC123")).toBe(false)
  })
})
