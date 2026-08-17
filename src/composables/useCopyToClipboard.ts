import { useClipboard } from "@vueuse/core"

export function useCopyToClipboard(resetMs = 2000) {
  const { copied, copy: writeClipboard } = useClipboard({
    copiedDuring: resetMs,
  })

  async function copy(value: string) {
    if (!value) return false
    try {
      await writeClipboard(value)
      return true
    } catch {
      return false
    }
  }

  return { copied, copy }
}
