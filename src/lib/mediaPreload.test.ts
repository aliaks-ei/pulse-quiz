import { afterEach, describe, expect, it, vi } from "vitest"

import { preloadQuestionMedia } from "@/lib/mediaPreload"
import type { QuestionMedia } from "@/types/domain"

// Controllable Image stub: assigning `src` fires onload on the next microtask.
class ImageStub {
  decoding = ""
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  decode = vi.fn(() => Promise.resolve())
  #src = ""

  static instances: ImageStub[] = []

  constructor() {
    ImageStub.instances.push(this)
  }

  set src(value: string) {
    this.#src = value
    queueMicrotask(() => this.onload?.())
  }

  get src() {
    return this.#src
  }
}

function imageMedia(url: string): QuestionMedia {
  return { kind: "image", path: "p", publicUrl: url }
}

afterEach(() => {
  vi.unstubAllGlobals()
  ImageStub.instances = []
})

describe("preloadQuestionMedia", () => {
  it("resolves immediately when media is null or has no public url", async () => {
    await expect(preloadQuestionMedia(null)).resolves.toBeUndefined()
    await expect(preloadQuestionMedia(undefined)).resolves.toBeUndefined()
    await expect(
      preloadQuestionMedia({ kind: "image", path: "p" }),
    ).resolves.toBeUndefined()
  })

  it("preloads images via the Image element and resolves after decode", async () => {
    vi.stubGlobal("Image", ImageStub)

    await preloadQuestionMedia(imageMedia("https://cdn/img-a.png"))

    expect(ImageStub.instances).toHaveLength(1)
    expect(ImageStub.instances[0].src).toBe("https://cdn/img-a.png")
    expect(ImageStub.instances[0].decode).toHaveBeenCalled()
  })

  it("still resolves when the Image element lacks decode()", async () => {
    class NoDecodeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      decoding = ""
      #src = ""
      set src(value: string) {
        this.#src = value
        queueMicrotask(() => this.onload?.())
      }
      get src() {
        return this.#src
      }
    }
    vi.stubGlobal("Image", NoDecodeImage)

    await expect(
      preloadQuestionMedia(imageMedia("https://cdn/img-no-decode.png")),
    ).resolves.toBeUndefined()
  })

  it("caches by url so a repeated request reuses the same promise", async () => {
    vi.stubGlobal("Image", ImageStub)

    const first = preloadQuestionMedia(imageMedia("https://cdn/img-b.png"))
    const second = preloadQuestionMedia(imageMedia("https://cdn/img-b.png"))

    expect(first).toBe(second)
    await first
    expect(ImageStub.instances).toHaveLength(1)
  })

  it("preloads non-image media via fetch", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)))
    vi.stubGlobal("fetch", fetchMock)

    await preloadQuestionMedia({
      kind: "video",
      path: "p",
      publicUrl: "https://cdn/clip-a.mp4",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn/clip-a.mp4",
      expect.objectContaining({ method: "GET" }),
    )
  })
})
