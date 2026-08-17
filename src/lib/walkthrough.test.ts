import { describe, expect, it } from "vitest"

import {
  advanceWalkthroughState,
  buildWalkthroughParticipant,
  canSubmitWalkthroughAnswer,
  createWalkthroughState,
  getWalkthroughLeaderboard,
  getWalkthroughRoundSummary,
  restartWalkthrough,
  submitWalkthroughAnswer,
  syncWalkthroughState,
  WALKTHROUGH_PHASE_DURATIONS_MS,
} from "@/lib/walkthrough"
import {
  DEFAULT_ANSWER_REVEAL_SECONDS,
  DEFAULT_QUESTION_POINTS,
  DEFAULT_SECTION_INTERMISSION_SECONDS,
  type Game,
} from "@/types/domain"

function createGame(): Game {
  return {
    id: "game-1",
    title: "Friday Trivia",
    primaryLocale: "en",
    titleI18n: {},
    ownerId: "owner-1",
    defaultQuestionPoints: DEFAULT_QUESTION_POINTS,
    defaultSectionIntermissionSeconds: DEFAULT_SECTION_INTERMISSION_SECONDS,
    defaultAnswerRevealSeconds: DEFAULT_ANSWER_REVEAL_SECONDS,
    manualQuestionAdvance: false,
    createdAt: "2026-04-23T10:00:00.000Z",
    updatedAt: "2026-04-23T10:00:00.000Z",
    questions: [
      {
        id: "question-1",
        sectionId: "section-1",
        position: 0,
        prompt: "Question 1",
        promptI18n: {},
        durationSeconds: 15,
        points: 2,
        correctOptionId: "option-1b",
        media: null,
        revealMedia: null,
        revealText: "Reveal 1",
        revealTextI18n: {},
        options: [
          { id: "option-1a", text: "A", textI18n: {} },
          { id: "option-1b", text: "B", textI18n: {} },
          { id: "option-1c", text: "C", textI18n: {} },
          { id: "option-1d", text: "D", textI18n: {} },
        ],
      },
      {
        id: "question-2",
        sectionId: "section-1",
        position: 1,
        prompt: "Question 2",
        promptI18n: {},
        durationSeconds: 20,
        points: 5,
        correctOptionId: "option-2a",
        media: null,
        revealMedia: null,
        revealText: "Reveal 2",
        revealTextI18n: {},
        options: [
          { id: "option-2a", text: "A", textI18n: {} },
          { id: "option-2b", text: "B", textI18n: {} },
          { id: "option-2c", text: "C", textI18n: {} },
          { id: "option-2d", text: "D", textI18n: {} },
        ],
      },
      {
        id: "question-3",
        sectionId: "section-2",
        position: 2,
        prompt: "Question 3",
        promptI18n: {},
        durationSeconds: 10,
        points: 3,
        correctOptionId: "option-3c",
        media: null,
        revealMedia: null,
        revealText: "Reveal 3",
        revealTextI18n: {},
        options: [
          { id: "option-3a", text: "A", textI18n: {} },
          { id: "option-3b", text: "B", textI18n: {} },
          { id: "option-3c", text: "C", textI18n: {} },
          { id: "option-3d", text: "D", textI18n: {} },
        ],
      },
    ],
    sections: [
      {
        id: "section-1",
        title: "Round One",
        titleI18n: {},
        position: 0,
        questionIds: ["question-1", "question-2"],
        intermissionMode: "inherit",
        intermissionSeconds: null,
      },
      {
        id: "section-2",
        title: "Round Two",
        titleI18n: {},
        position: 1,
        questionIds: ["question-3"],
        intermissionMode: "inherit",
        intermissionSeconds: null,
      },
    ],
  }
}

describe("walkthrough state", () => {
  it("starts on the first question with the first section active", () => {
    const state = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("host@example.com"),
      1_000,
    )

    expect(state.phase).toBe("question_active")
    expect(state.currentQuestionIndex).toBe(0)
    expect(state.currentSectionIndex).toBe(0)
    expect(state.phaseEndsAtMs).toBe(16_000)
    expect(state.participant.displayName).toBe("host")
  })

  it("locks in a correct answer and adds score once", () => {
    const initial = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("host@example.com"),
      1_000,
    )

    const answered = submitWalkthroughAnswer(initial, "option-1b", 5_000)
    const duplicate = submitWalkthroughAnswer(answered, "option-1a", 6_000)

    expect(answered.submittedOptionId).toBe("option-1b")
    expect(answered.submittedIsCorrect).toBe(true)
    expect(answered.submittedPoints).toBe(2)
    expect(answered.score).toBe(2)
    expect(answered.answers).toHaveLength(1)
    expect(duplicate).toEqual(answered)
  })

  it("stops accepting answers after time expires", () => {
    const initial = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("host@example.com"),
      1_000,
    )

    expect(canSubmitWalkthroughAnswer(initial, 5_000)).toBe(true)
    expect(canSubmitWalkthroughAnswer(initial, 16_001)).toBe(false)

    const lateAnswer = submitWalkthroughAnswer(initial, "option-1b", 16_001)

    expect(lateAnswer.phase).toBe("answer_transition")
    expect(lateAnswer.submittedOptionId).toBeNull()
    expect(lateAnswer.score).toBe(0)
  })

  it("moves through transition, reveal, summary, leaderboard, and next question", () => {
    let state = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("host@example.com"),
      1_000,
    )

    state = submitWalkthroughAnswer(state, "option-1b", 5_000)
    state = advanceWalkthroughState(state, 6_000)
    expect(state.phase).toBe("answer_transition")
    expect(state.phaseEndsAtMs).toBe(
      6_000 + WALKTHROUGH_PHASE_DURATIONS_MS.answer_transition,
    )

    state = advanceWalkthroughState(state, 7_000)
    expect(state.phase).toBe("answer_reveal")
    expect(state.phaseEndsAtMs).toBe(
      7_000 + WALKTHROUGH_PHASE_DURATIONS_MS.answer_reveal,
    )

    state = advanceWalkthroughState(state, 8_000)
    expect(state.phase).toBe("question_active")
    expect(state.currentQuestionIndex).toBe(1)

    state = submitWalkthroughAnswer(state, "option-2b", 8_000)
    state = advanceWalkthroughState(state, 9_000)
    expect(state.phase).toBe("answer_transition")

    state = advanceWalkthroughState(state, 10_000)
    expect(state.phase).toBe("answer_reveal")

    state = advanceWalkthroughState(state, 11_000)
    expect(state.phase).toBe("round_summary")

    const summary = getWalkthroughRoundSummary(state)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toMatchObject({
      pointsGained: 2,
      totalScore: 2,
      rank: 1,
    })

    state = advanceWalkthroughState(state, 12_000)
    expect(state.phase).toBe("round_leaderboard")

    state = advanceWalkthroughState(state, 13_000)
    expect(state.phase).toBe("question_active")
    expect(state.currentQuestionIndex).toBe(2)
    expect(state.currentSectionIndex).toBe(1)
  })

  it("auto-advances when timers expire", () => {
    let state = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("host@example.com"),
      1_000,
    )

    state = syncWalkthroughState(state, 16_000)
    expect(state.phase).toBe("answer_transition")

    state = syncWalkthroughState(
      state,
      16_000 + WALKTHROUGH_PHASE_DURATIONS_MS.answer_transition + 1,
    )
    expect(state.phase).toBe("answer_reveal")

    state = syncWalkthroughState(
      state,
      16_000 +
        WALKTHROUGH_PHASE_DURATIONS_MS.answer_transition +
        WALKTHROUGH_PHASE_DURATIONS_MS.answer_reveal +
        1,
    )
    expect(state.phase).toBe("question_active")
    expect(state.currentQuestionIndex).toBe(1)
  })

  it("finishes after the last leaderboard and exposes final leaderboard", () => {
    let state = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant(null),
      1_000,
    )

    state = submitWalkthroughAnswer(state, "option-1b", 2_000)
    state = advanceWalkthroughState(state, 3_000)
    state = advanceWalkthroughState(state, 4_000)
    state = advanceWalkthroughState(state, 5_000)
    state = submitWalkthroughAnswer(state, "option-2a", 5_000)
    state = advanceWalkthroughState(state, 6_000)
    state = advanceWalkthroughState(state, 7_000)
    state = advanceWalkthroughState(state, 8_000)
    state = advanceWalkthroughState(state, 9_000)
    state = advanceWalkthroughState(state, 11_000)
    state = submitWalkthroughAnswer(state, "option-3c", 12_000)
    state = advanceWalkthroughState(state, 12_000)
    state = advanceWalkthroughState(state, 13_000)
    state = advanceWalkthroughState(state, 14_000)

    expect(state.phase).toBe("finished")
    expect(state.finishedAtMs).toBe(14_000)

    const leaderboard = getWalkthroughLeaderboard(state)
    expect(leaderboard).toEqual([
      {
        playerId: "host-preview",
        displayName: "Host Preview",
        avatarKey: "avatar-01",
        score: 10,
        rank: 1,
      },
    ])
  })

  it("uses each question's configured points for mixed scoring", () => {
    let state = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("host@example.com"),
      1_000,
    )

    state = submitWalkthroughAnswer(state, "option-1b", 2_000)
    state = advanceWalkthroughState(state, 3_000)
    state = advanceWalkthroughState(state, 4_000)
    state = advanceWalkthroughState(state, 5_000)
    state = submitWalkthroughAnswer(state, "option-2a", 5_000)

    expect(state.score).toBe(7)
    expect(state.answers.map((answer) => answer.awardedPoints)).toEqual([2, 5])
  })

  it("restarts from the first question while preserving the preview participant", () => {
    const initial = createWalkthroughState(
      createGame(),
      buildWalkthroughParticipant("quizmaster@example.com"),
      1_000,
    )
    const answered = submitWalkthroughAnswer(initial, "option-1b", 2_000)
    const restarted = restartWalkthrough(answered, 9_000)

    expect(restarted.phase).toBe("question_active")
    expect(restarted.currentQuestionIndex).toBe(0)
    expect(restarted.score).toBe(0)
    expect(restarted.answers).toEqual([])
    expect(restarted.participant.displayName).toBe("quizmaster")
    expect(restarted.phaseEndsAtMs).toBe(24_000)
  })
})
