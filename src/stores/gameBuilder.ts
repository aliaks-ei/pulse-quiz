import { defineStore } from "pinia"
import { computed, ref } from "vue"

import { i18n, translate } from "@/i18n"
import { defaultAppLocale, type AppLocale } from "@/i18n/locale"
import { computeSourceHash } from "@/lib/localized"
import { gameService } from "@/services/gameService"
import {
  DEFAULT_ANSWER_REVEAL_SECONDS,
  DEFAULT_QUESTION_POINTS,
  DEFAULT_SECTION_INTERMISSION_SECONDS,
  MAX_ANSWER_REVEAL_SECONDS,
  type I18nMap,
  MAX_QUESTION_POINTS,
  MAX_SECTION_INTERMISSION_SECONDS,
  MIN_ANSWER_REVEAL_SECONDS,
  MIN_QUESTION_POINTS,
  MIN_SECTION_INTERMISSION_SECONDS,
  type Game,
  type GameSection,
  type QuizQuestion,
} from "@/types/domain"

function createEmptyQuestion(
  position: number,
  sectionId: string,
  points: number,
): QuizQuestion {
  const optionIds = Array.from({ length: 4 }, () => crypto.randomUUID())

  return {
    id: crypto.randomUUID(),
    type: "single_choice",
    sectionId,
    position,
    prompt: "",
    promptI18n: {},
    durationSeconds: 20,
    points,
    correctOptionId: optionIds[0],
    media: null,
    revealMedia: null,
    revealText: "",
    revealTextI18n: {},
    options: optionIds.map((id) => ({
      id,
      text: "",
      textI18n: {},
    })),
  }
}

function createEmptySection(position: number): GameSection {
  return {
    id: crypto.randomUUID(),
    title: `Section ${position + 1}`,
    titleI18n: {},
    position,
    questionIds: [],
    intermissionMode: "inherit",
    intermissionSeconds: null,
  }
}

export const useGameBuilderStore = defineStore("gameBuilder", () => {
  const id = ref("")
  const title = ref("")
  const primaryLocale = ref<AppLocale>(defaultAppLocale)
  const titleI18n = ref<I18nMap>({})
  const activeLocale = ref<AppLocale>(defaultAppLocale)
  const defaultQuestionPoints = ref(DEFAULT_QUESTION_POINTS)
  const defaultSectionIntermissionSeconds = ref(
    DEFAULT_SECTION_INTERMISSION_SECONDS,
  )
  const defaultAnswerRevealSeconds = ref(DEFAULT_ANSWER_REVEAL_SECONDS)
  const manualQuestionAdvance = ref(false)
  const questions = ref<QuizQuestion[]>([])
  const sections = ref<GameSection[]>([])
  const isSaving = ref(false)

  function syncStructure(
    nextSections: GameSection[],
    nextQuestions: QuizQuestion[],
  ) {
    const questionMap = new Map(
      nextQuestions.map((question) => [question.id, question]),
    )
    let position = 0

    sections.value = nextSections.map((section, index) => ({
      ...section,
      position: index,
      questionIds: section.questionIds.filter((questionId) =>
        questionMap.has(questionId),
      ),
    }))

    questions.value = sections.value.flatMap((section) =>
      section.questionIds
        .map((questionId) => questionMap.get(questionId))
        .filter((question): question is QuizQuestion => question != null)
        .map((question) => ({
          ...question,
          sectionId: section.id,
          position: position++,
        })),
    )
  }

  function reset(game?: Game) {
    if (!game) {
      id.value = ""
      title.value = ""
      primaryLocale.value = defaultAppLocale
      titleI18n.value = {}
      activeLocale.value = defaultAppLocale
      defaultQuestionPoints.value = DEFAULT_QUESTION_POINTS
      defaultSectionIntermissionSeconds.value =
        DEFAULT_SECTION_INTERMISSION_SECONDS
      defaultAnswerRevealSeconds.value = DEFAULT_ANSWER_REVEAL_SECONDS
      manualQuestionAdvance.value = false
      const firstSection = createEmptySection(0)
      const firstQuestion = createEmptyQuestion(
        0,
        firstSection.id,
        defaultQuestionPoints.value,
      )
      syncStructure(
        [
          {
            ...firstSection,
            questionIds: [firstQuestion.id],
          },
        ],
        [firstQuestion],
      )
      return
    }

    id.value = game.id
    title.value = game.title
    primaryLocale.value = game.primaryLocale
    titleI18n.value = game.titleI18n
    activeLocale.value = game.primaryLocale
    defaultQuestionPoints.value = game.defaultQuestionPoints
    defaultSectionIntermissionSeconds.value =
      game.defaultSectionIntermissionSeconds ??
      DEFAULT_SECTION_INTERMISSION_SECONDS
    defaultAnswerRevealSeconds.value =
      game.defaultAnswerRevealSeconds ?? DEFAULT_ANSWER_REVEAL_SECONDS
    manualQuestionAdvance.value = game.manualQuestionAdvance ?? false
    const nextQuestions = game.questions.map((question, index) => {
      const fallbackQuestion = createEmptyQuestion(
        index,
        question.sectionId,
        question.points,
      )
      const nextOptions =
        question.options.length === 4
          ? question.options
          : fallbackQuestion.options.map((option, optionIndex) => ({
              ...option,
              text: question.options[optionIndex]?.text ?? "",
              textI18n: question.options[optionIndex]?.textI18n ?? {},
            }))

      return {
        ...question,
        sectionId: question.sectionId,
        position: index,
        media: question.media ?? null,
        promptI18n: question.promptI18n ?? {},
        revealMedia: question.revealMedia ?? null,
        revealText: question.revealText ?? "",
        revealTextI18n: question.revealTextI18n ?? {},
        points: question.points,
        options: nextOptions.map((option) => ({
          ...option,
          textI18n: option.textI18n ?? {},
        })),
        correctOptionId: nextOptions.some(
          (option) => option.id === question.correctOptionId,
        )
          ? question.correctOptionId
          : nextOptions[0].id,
      }
    })

    const nextSections =
      game.sections.length > 0
        ? game.sections.map((section, index) => ({
            ...section,
            position: index,
            questionIds: section.questionIds.filter((questionId) =>
              nextQuestions.some((question) => question.id === questionId),
            ),
          }))
        : [
            {
              ...createEmptySection(0),
              questionIds: nextQuestions.map((question) => question.id),
            },
          ]

    syncStructure(nextSections, nextQuestions)
  }

  function addSection() {
    const nextSection = createEmptySection(sections.value.length)
    const nextQuestion = createEmptyQuestion(
      questions.value.length,
      nextSection.id,
      defaultQuestionPoints.value,
    )

    syncStructure(
      [
        ...sections.value,
        {
          ...nextSection,
          questionIds: [nextQuestion.id],
        },
      ],
      [...questions.value, nextQuestion],
    )
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    const sectionIndex = sections.value.findIndex(
      (section) => section.id === sectionId,
    )
    const targetIndex = sectionIndex + direction

    if (
      sectionIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= sections.value.length
    ) {
      return
    }

    const nextSections = sections.value.slice()
    const [section] = nextSections.splice(sectionIndex, 1)
    nextSections.splice(targetIndex, 0, section)
    syncStructure(nextSections, questions.value)
  }

  function addQuestion(sectionId: string) {
    const nextQuestion = createEmptyQuestion(
      questions.value.length,
      sectionId,
      defaultQuestionPoints.value,
    )
    const nextSections = sections.value.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            questionIds: [...section.questionIds, nextQuestion.id],
          }
        : section,
    )

    syncStructure(nextSections, [...questions.value, nextQuestion])
  }

  function moveQuestion(
    questionId: string,
    targetSectionId: string,
    targetIndex: number,
  ) {
    const sourceSection = sections.value.find((section) =>
      section.questionIds.includes(questionId),
    )
    const targetSection = sections.value.find(
      (section) => section.id === targetSectionId,
    )

    if (!sourceSection || !targetSection) return

    const sourceIndex = sourceSection.questionIds.indexOf(questionId)
    const normalizedTargetIndex =
      sourceSection.id === targetSectionId && sourceIndex < targetIndex
        ? targetIndex - 1
        : targetIndex

    const nextSections = sections.value.map((section) => {
      if (section.id === sourceSection.id) {
        return {
          ...section,
          questionIds: section.questionIds.filter((id) => id !== questionId),
        }
      }

      return {
        ...section,
        questionIds: [...section.questionIds],
      }
    })

    const targetSectionIndex = nextSections.findIndex(
      (section) => section.id === targetSectionId,
    )
    const targetQuestionIds =
      nextSections[targetSectionIndex].questionIds.slice()

    targetQuestionIds.splice(
      Math.max(0, Math.min(normalizedTargetIndex, targetQuestionIds.length)),
      0,
      questionId,
    )

    nextSections[targetSectionIndex] = {
      ...nextSections[targetSectionIndex],
      questionIds: targetQuestionIds,
    }

    syncStructure(nextSections, questions.value)
  }

  function removeSection(sectionId: string) {
    if (sections.value.length === 1) return

    const sectionIndex = sections.value.findIndex(
      (section) => section.id === sectionId,
    )
    if (sectionIndex === -1) return

    const section = sections.value[sectionIndex]
    const targetSectionId =
      sections.value[sectionIndex - 1]?.id ??
      sections.value[sectionIndex + 1]?.id

    const nextSections = sections.value
      .filter((candidate) => candidate.id !== sectionId)
      .map((candidate) => {
        if (candidate.id !== targetSectionId) {
          return {
            ...candidate,
            questionIds: [...candidate.questionIds],
          }
        }

        return {
          ...candidate,
          questionIds:
            sectionIndex > 0
              ? [...candidate.questionIds, ...section.questionIds]
              : [...section.questionIds, ...candidate.questionIds],
        }
      })

    syncStructure(nextSections, questions.value)
  }

  function removeQuestion(questionId: string) {
    const remainingQuestions = questions.value.filter(
      (question) => question.id !== questionId,
    )

    if (!remainingQuestions.length) {
      const fallbackSection = sections.value[0] ?? createEmptySection(0)
      const fallbackQuestion = createEmptyQuestion(
        0,
        fallbackSection.id,
        defaultQuestionPoints.value,
      )
      syncStructure(
        [
          {
            ...fallbackSection,
            questionIds: [fallbackQuestion.id],
          },
        ],
        [fallbackQuestion],
      )
      return
    }

    const nextSections = sections.value.map((section) => ({
      ...section,
      questionIds: section.questionIds.filter((id) => id !== questionId),
    }))

    syncStructure(nextSections, remainingQuestions)
  }

  function setDefaultQuestionPoints(points: number) {
    defaultQuestionPoints.value = points
    questions.value = questions.value.map((question) => ({
      ...question,
      points,
    }))
  }

  function setDefaultSectionIntermissionSeconds(seconds: number) {
    defaultSectionIntermissionSeconds.value = seconds
  }

  function setDefaultAnswerRevealSeconds(seconds: number) {
    defaultAnswerRevealSeconds.value = seconds
  }

  function setManualQuestionAdvance(isManual: boolean) {
    manualQuestionAdvance.value = isManual
  }

  function setSectionIntermission(
    sectionId: string,
    mode: GameSection["intermissionMode"],
    seconds: number | null,
  ) {
    sections.value = sections.value.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            intermissionMode: mode,
            intermissionSeconds: mode === "timer" ? seconds : null,
          }
        : section,
    )
  }

  const hasAnyTranslation = computed(() => {
    if (Object.keys(titleI18n.value).length > 0) return true
    if (sections.value.some((section) => Object.keys(section.titleI18n).length))
      return true

    return questions.value.some(
      (question) =>
        Object.keys(question.promptI18n).length > 0 ||
        Object.keys(question.revealTextI18n).length > 0 ||
        question.options.some((option) => Object.keys(option.textI18n).length),
    )
  })

  function withTranslation(
    map: I18nMap,
    locale: AppLocale,
    translatedText: string,
    sourceText: string,
  ): I18nMap {
    return {
      ...map,
      [locale]: {
        text: translatedText,
        sourceHash: computeSourceHash(sourceText),
      },
    }
  }

  function applyTranslations(
    targetLocale: AppLocale,
    results: Array<{ id: string; text: string }>,
  ) {
    for (const { id: resultId, text: translatedText } of results) {
      const [kind, uuid, field] = resultId.split(":")

      if (kind === "game" && uuid === "title") {
        titleI18n.value = withTranslation(
          titleI18n.value,
          targetLocale,
          translatedText,
          title.value,
        )
        continue
      }

      if (kind === "section") {
        const index = sections.value.findIndex((section) => section.id === uuid)
        if (index === -1) continue

        const section = sections.value[index]
        sections.value[index] = {
          ...section,
          titleI18n: withTranslation(
            section.titleI18n,
            targetLocale,
            translatedText,
            section.title,
          ),
        }
        continue
      }

      if (kind === "question") {
        const index = questions.value.findIndex(
          (question) => question.id === uuid,
        )
        if (index === -1) continue

        const question = questions.value[index]
        if (field === "prompt") {
          questions.value[index] = {
            ...question,
            promptI18n: withTranslation(
              question.promptI18n,
              targetLocale,
              translatedText,
              question.prompt,
            ),
          }
        } else if (field === "reveal") {
          questions.value[index] = {
            ...question,
            revealTextI18n: withTranslation(
              question.revealTextI18n,
              targetLocale,
              translatedText,
              question.revealText ?? "",
            ),
          }
        }
        continue
      }

      if (kind === "option") {
        const questionIndex = questions.value.findIndex(
          (question) => question.id === uuid,
        )
        if (questionIndex === -1) continue

        const question = questions.value[questionIndex]
        const optionIndex = question.options.findIndex(
          (option) => option.id === field,
        )
        if (optionIndex === -1) continue

        const options = [...question.options]
        options[optionIndex] = {
          ...options[optionIndex],
          textI18n: withTranslation(
            options[optionIndex].textI18n,
            targetLocale,
            translatedText,
            options[optionIndex].text,
          ),
        }
        questions.value[questionIndex] = { ...question, options }
      }
    }
  }

  function setPrimaryLocale(locale: AppLocale) {
    if (hasAnyTranslation.value) {
      throw new Error(
        "Clear all translations before changing the primary language",
      )
    }

    primaryLocale.value = locale
    activeLocale.value = locale
  }

  function clearTranslation(locale: AppLocale) {
    const stripped = (map: I18nMap) => {
      const next = { ...map }
      delete next[locale]
      return next
    }

    titleI18n.value = stripped(titleI18n.value)
    sections.value = sections.value.map((section) => ({
      ...section,
      titleI18n: stripped(section.titleI18n),
    }))
    questions.value = questions.value.map((question) => ({
      ...question,
      promptI18n: stripped(question.promptI18n),
      revealTextI18n: stripped(question.revealTextI18n),
      options: question.options.map((option) => ({
        ...option,
        textI18n: stripped(option.textI18n),
      })),
    }))
  }

  async function save() {
    isSaving.value = true
    try {
      const gameId = await gameService.saveGame({
        id: id.value,
        title: title.value,
        primaryLocale: primaryLocale.value,
        titleI18n: titleI18n.value,
        defaultQuestionPoints: defaultQuestionPoints.value,
        defaultSectionIntermissionSeconds:
          defaultSectionIntermissionSeconds.value,
        defaultAnswerRevealSeconds: defaultAnswerRevealSeconds.value,
        manualQuestionAdvance: manualQuestionAdvance.value,
        questions: questions.value,
        sections: sections.value,
      })

      id.value = gameId
      return gameId
    } finally {
      isSaving.value = false
    }
  }

  const validationErrors = computed(() => {
    // Reactivity hook: recompute validation messages when the locale changes.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    i18n.global.locale
    const errors: string[] = []

    if (!title.value.trim()) {
      errors.push(translate("gameBuilderView.validation.addQuizTitle"))
    }

    if (!questions.value.length) {
      errors.push(translate("gameBuilderView.validation.addQuestion"))
    }

    if (
      defaultQuestionPoints.value < MIN_QUESTION_POINTS ||
      defaultQuestionPoints.value > MAX_QUESTION_POINTS
    ) {
      errors.push(
        translate("gameBuilderView.validation.setDefaultPoints", {
          min: MIN_QUESTION_POINTS,
          max: MAX_QUESTION_POINTS,
        }),
      )
    }

    if (
      defaultSectionIntermissionSeconds.value <
        MIN_SECTION_INTERMISSION_SECONDS ||
      defaultSectionIntermissionSeconds.value > MAX_SECTION_INTERMISSION_SECONDS
    ) {
      errors.push(
        translate("gameBuilderView.validation.setDefaultSectionIntermission", {
          min: MIN_SECTION_INTERMISSION_SECONDS,
          max: MAX_SECTION_INTERMISSION_SECONDS,
        }),
      )
    }

    if (
      defaultAnswerRevealSeconds.value < MIN_ANSWER_REVEAL_SECONDS ||
      defaultAnswerRevealSeconds.value > MAX_ANSWER_REVEAL_SECONDS
    ) {
      errors.push(
        translate("gameBuilderView.validation.setDefaultAnswerReveal", {
          min: MIN_ANSWER_REVEAL_SECONDS,
          max: MAX_ANSWER_REVEAL_SECONDS,
        }),
      )
    }

    sections.value.forEach((section, index) => {
      if (!section.title.trim()) {
        errors.push(
          translate("gameBuilderView.validation.addSectionTitle", {
            number: index + 1,
          }),
        )
      }

      if (section.questionIds.length === 0) {
        errors.push(
          translate("gameBuilderView.validation.addSectionQuestion", {
            number: index + 1,
          }),
        )
      }

      if (
        index > 0 &&
        section.intermissionMode === "timer" &&
        (section.intermissionSeconds == null ||
          section.intermissionSeconds < MIN_SECTION_INTERMISSION_SECONDS ||
          section.intermissionSeconds > MAX_SECTION_INTERMISSION_SECONDS)
      ) {
        errors.push(
          translate("gameBuilderView.validation.setSectionIntermission", {
            number: index + 1,
            min: MIN_SECTION_INTERMISSION_SECONDS,
            max: MAX_SECTION_INTERMISSION_SECONDS,
          }),
        )
      }
    })

    questions.value.forEach((question, index) => {
      if (!question.prompt.trim()) {
        errors.push(
          translate("gameBuilderView.validation.addQuestionText", {
            number: index + 1,
          }),
        )
      }

      if (question.durationSeconds < 5 || question.durationSeconds > 300) {
        errors.push(
          translate("gameBuilderView.validation.setTimer", {
            number: index + 1,
          }),
        )
      }

      if (
        question.points < MIN_QUESTION_POINTS ||
        question.points > MAX_QUESTION_POINTS
      ) {
        errors.push(
          translate("gameBuilderView.validation.setPoints", {
            number: index + 1,
            min: MIN_QUESTION_POINTS,
            max: MAX_QUESTION_POINTS,
          }),
        )
      }

      if (question.options.length !== 4) {
        errors.push(
          translate("gameBuilderView.validation.needsAnswers", {
            number: index + 1,
          }),
        )
      }

      if (question.options.some((option) => !option.text.trim())) {
        errors.push(
          translate("gameBuilderView.validation.fillAnswers", {
            number: index + 1,
          }),
        )
      }

      if (
        !question.options.some(
          (option) => option.id === question.correctOptionId,
        )
      ) {
        errors.push(
          translate("gameBuilderView.validation.pickCorrect", {
            number: index + 1,
          }),
        )
      }
    })

    return errors
  })

  const isValid = computed(() => {
    return validationErrors.value.length === 0
  })

  return {
    id,
    title,
    primaryLocale,
    titleI18n,
    activeLocale,
    defaultQuestionPoints,
    defaultSectionIntermissionSeconds,
    defaultAnswerRevealSeconds,
    manualQuestionAdvance,
    questions,
    sections,
    isSaving,
    isValid,
    hasAnyTranslation,
    validationErrors,
    reset,
    addSection,
    moveSection,
    addQuestion,
    moveQuestion,
    removeSection,
    removeQuestion,
    setDefaultQuestionPoints,
    setDefaultSectionIntermissionSeconds,
    setDefaultAnswerRevealSeconds,
    setManualQuestionAdvance,
    setSectionIntermission,
    applyTranslations,
    setPrimaryLocale,
    clearTranslation,
    save,
  }
})
