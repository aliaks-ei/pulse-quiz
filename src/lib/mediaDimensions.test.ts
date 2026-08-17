import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readMediaDimensions } from "@/lib/mediaDimensions"

class ImageStub {
  static config = { width: 0, height: 0, fail: false }
  naturalWidth = 0
  naturalHeight = 0
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  #src = ""

  set src(value: string) {
    this.#src = value
    queueMicrotask(() => {
      if (ImageStub.config.fail) {
        this.onerror?.()
        return
      }
      this.naturalWidth = ImageStub.config.width
      this.naturalHeight = ImageStub.config.height
      this.onload?.()
    })
  }

  get src() {
    return this.#src
  }
}

function makeVideoStub() {
  return {
    config: { width: 0, height: 0, fail: false },
    preload: "",
    videoWidth: 0,
    videoHeight: 0,
    onloadedmetadata: null as (() => void) | null,
    onerror: null as (() => void) | null,
    _src: "",
    set src(value: string) {
      this._src = value
      queueMicrotask(() => {
        if (this.config.fail) {
          this.onerror?.()
          return
        }
        this.videoWidth = this.config.width
        this.videoHeight = this.config.height
        this.onloadedmetadata?.()
      })
    },
    get src() {
      return this._src
    },
  }
}

const imageFile = new File(["x"], "photo.png", { type: "image/png" })
const videoFile = new File(["x"], "clip.mp4", { type: "video/mp4" })
const audioFile = new File(["x"], "song.mp3", { type: "audio/mpeg" })

beforeEach(() => {
  ImageStub.config = { width: 0, height: 0, fail: false }
  vi.stubGlobal("Image", ImageStub)
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("readMediaDimensions", () => {
  it("returns null for non-image/video kinds", async () => {
    expect(await readMediaDimensions(audioFile, { kind: "audio" })).toBeNull()
  })

  it("reads and rounds image dimensions", async () => {
    ImageStub.config = { width: 1920.4, height: 1080.6, fail: false }
    const dims = await readMediaDimensions(imageFile, {
      kind: "image",
      url: "blob:provided",
    })
    expect(dims).toEqual({ width: 1920, height: 1081 })
  })

  it("returns null when the image fails to load", async () => {
    ImageStub.config = { width: 0, height: 0, fail: true }
    expect(
      await readMediaDimensions(imageFile, { kind: "image", url: "blob:x" }),
    ).toBeNull()
  })

  it("returns null when dimensions are not usable", async () => {
    ImageStub.config = { width: 0, height: 0, fail: false }
    expect(
      await readMediaDimensions(imageFile, { kind: "image", url: "blob:x" }),
    ).toBeNull()
  })

  it("creates and revokes an object URL when none is supplied", async () => {
    ImageStub.config = { width: 10, height: 10, fail: false }
    await readMediaDimensions(imageFile, { kind: "image" })

    expect(URL.createObjectURL).toHaveBeenCalledWith(imageFile)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake")
  })

  it("does not revoke a caller-supplied url", async () => {
    ImageStub.config = { width: 10, height: 10, fail: false }
    await readMediaDimensions(imageFile, { kind: "image", url: "blob:keep" })
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it("reads video dimensions via a video element", async () => {
    const videoStub = makeVideoStub()
    videoStub.config = { width: 640, height: 480, fail: false }
    vi.spyOn(document, "createElement").mockReturnValue(
      videoStub as unknown as HTMLElement,
    )

    const dims = await readMediaDimensions(videoFile, {
      kind: "video",
      url: "blob:video",
    })
    expect(dims).toEqual({ width: 640, height: 480 })
  })
})
