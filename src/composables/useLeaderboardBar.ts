import { computed, type Ref } from "vue"

const LEADERBOARD_ACCENTS = [
  "#cf7b52",
  "#8b9a83",
  "#c69779",
  "#a18a74",
  "#d8c0ae",
]

type ScoreExtractor<T> = (entry: T) => number

export function useLeaderboardBar<T>(
  entries: Ref<readonly T[]> | (() => readonly T[]),
  getScore: ScoreExtractor<T>,
  options: { minWidthPct?: number } = {},
) {
  const minWidth = options.minWidthPct ?? 24

  const resolveEntries = () =>
    typeof entries === "function" ? entries() : entries.value

  const scoreCeiling = computed(() => {
    const scores = resolveEntries().map(getScore)
    return Math.max(1, ...scores)
  })

  function scoreFill(score: number) {
    return `${Math.max(minWidth, (score / scoreCeiling.value) * 100)}%`
  }

  function accent(index: number) {
    return LEADERBOARD_ACCENTS[index % LEADERBOARD_ACCENTS.length]
  }

  return { scoreFill, accent, scoreCeiling }
}
