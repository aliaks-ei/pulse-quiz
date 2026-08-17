import { flushPromises } from "@vue/test-utils"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest"

vi.mock("motion-v", () => import("@/test/motion-stub"))

vi.mock("vue-router", () => {
  const route = {
    params: { gameId: "game-1" },
    path: "/games/game-1/walkthrough",
  }
  const router = { push: vi.fn(() => Promise.resolve()) }
  return { useRoute: () => route, useRouter: () => router }
})

vi.mock("@/services/gameService", () => ({
  gameService: { getGame: vi.fn() },
}))

import WalkthroughView from "@/views/WalkthroughView.vue"
import { gameService } from "@/services/gameService"
import { translate } from "@/i18n"
import { makeGame } from "@/test/factories"
import { mountWithApp } from "@/test/pinia"

const getGame = gameService.getGame as Mock

const childStubs = {
  QuestionPhase: true,
  LeaderboardPhase: true,
  FinalResultsPanel: true,
  RoundSummary: true,
  GameplayTransition: true,
  LanguageSwitcher: true,
}

function mountView() {
  return mountWithApp(WalkthroughView, { global: { stubs: childStubs } })
}

describe("WalkthroughView", () => {
  beforeEach(() => {
    getGame.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("loads the game and renders the walkthrough controls", async () => {
    getGame.mockResolvedValue(makeGame())
    const wrapper = mountView()
    await flushPromises()

    expect(getGame).toHaveBeenCalledWith("game-1")
    const restart = wrapper
      .findAll("button")
      .find((b) => b.text() === translate("walkthroughView.restart"))
    expect(restart).toBeDefined()
  })

  it("shows the empty state for a game without questions", async () => {
    getGame.mockResolvedValue(makeGame({ questions: [] }))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain(translate("walkthroughView.emptyTitle"))
  })

  it("surfaces a load error", async () => {
    getGame.mockRejectedValue(new Error("not found"))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe("not found")
  })

  it("toggles between host and player preview modes", async () => {
    getGame.mockResolvedValue(makeGame())
    const wrapper = mountView()
    await flushPromises()

    const playerBtn = wrapper
      .findAll("button")
      .find((b) => b.text() === translate("walkthroughView.walkAsPlayer"))
    await playerBtn?.trigger("click")

    expect(playerBtn?.classes().join(" ")).toContain("bg-white")
  })
})
