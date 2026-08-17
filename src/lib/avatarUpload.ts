export const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024
export const MAX_AVATAR_OUTPUT_BYTES = 1024 * 1024
export const AVATAR_OUTPUT_SIZE = 512

const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export function validateAvatarSourceFile(file: File) {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.")
  }

  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error("Avatar images must be 10 MB or smaller.")
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Could not prepare this avatar image."))
      },
      "image/webp",
      0.86,
    )
  })
}

export async function normalizeAvatarImage(file: File): Promise<File> {
  validateAvatarSourceFile(file)

  const image = new Image()
  const sourceUrl = URL.createObjectURL(file)

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Could not read this image."))
      image.src = sourceUrl
    })

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
    if (!sourceSize) throw new Error("Could not read this image.")

    const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2)
    const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2)
    const canvas = document.createElement("canvas")
    canvas.width = AVATAR_OUTPUT_SIZE
    canvas.height = AVATAR_OUTPUT_SIZE

    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not prepare this avatar image.")

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_OUTPUT_SIZE,
      AVATAR_OUTPUT_SIZE,
    )

    const normalized = await toBlob(canvas)
    if (normalized.size > MAX_AVATAR_OUTPUT_BYTES) {
      throw new Error("This avatar could not be compressed below 1 MB.")
    }

    return new File([normalized], "avatar.webp", { type: "image/webp" })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
