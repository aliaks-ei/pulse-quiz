import {
  DEFAULT_QUESTION_POINTS,
  type GameModeDefinition,
  type QuestionType,
  type QuestionTypeDefinition,
  type QuizQuestion,
} from "@/types/domain"

const singleChoice: QuestionTypeDefinition = {
  type: "single_choice",
  label: "Single choice",
  createDefault: () => {
    const options = Array.from({ length: 4 }, () => ({
      id: crypto.randomUUID(),
      text: "",
      textI18n: {},
    }))

    return {
      prompt: "",
      durationSeconds: 20,
      points: DEFAULT_QUESTION_POINTS,
      options,
      correctOptionId: options[0].id,
      media: null,
      revealMedia: null,
      revealText: null,
    }
  },
  validate: (question: QuizQuestion) => {
    const errors: string[] = []
    if (!question.prompt.trim()) errors.push("Question text is required.")
    if (question.options.length !== 4) {
      errors.push("Single-choice questions require exactly four options.")
    }
    if (question.options.some((option) => !option.text.trim())) {
      errors.push("Every option needs text.")
    }
    if (
      !question.options.some((option) => option.id === question.correctOptionId)
    ) {
      errors.push("Choose a correct option.")
    }
    return errors
  },
}

const questionTypes = new Map<QuestionType, QuestionTypeDefinition>([
  [singleChoice.type, singleChoice],
])

export function getQuestionType(type: string | null | undefined) {
  return (
    questionTypes.get((type ?? "single_choice") as QuestionType) ?? singleChoice
  )
}

export function listQuestionTypes() {
  return [...questionTypes.values()]
}

export const gameModes: readonly GameModeDefinition[] = [
  { mode: "classic", label: "Classic quiz" },
]
