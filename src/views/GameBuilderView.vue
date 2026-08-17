<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { ArrowDown, ArrowUp, GripVertical } from "lucide-vue-next"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"

import LanguageTabStrip from "@/components/gameBuilder/LanguageTabStrip.vue"
import PrimaryLocalePicker from "@/components/gameBuilder/PrimaryLocalePicker.vue"
import TranslationModal from "@/components/gameBuilder/TranslationModal.vue"
import MediaAsset from "@/components/media/MediaAsset.vue"
import PageShell from "@/components/layout/PageShell.vue"
import Button from "@/components/ui/Button.vue"
import Input from "@/components/ui/Input.vue"
import Kicker from "@/components/ui/Kicker.vue"
import PaperCard from "@/components/ui/PaperCard.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import Textarea from "@/components/ui/Textarea.vue"
import {
  appLocaleOptions,
  getAppLocaleOption,
  type AppLocale,
} from "@/i18n/locale"
import { computeSourceHash } from "@/lib/localized"
import { detectMediaKind } from "@/lib/mediaKind"
import { readMediaDimensions } from "@/lib/mediaDimensions"
import { gameService, validateQuestionMediaFile } from "@/services/gameService"
import { useGameBuilderStore } from "@/stores/gameBuilder"
import {
  MAX_ANSWER_REVEAL_SECONDS,
  MAX_QUESTION_POINTS,
  MAX_SECTION_INTERMISSION_SECONDS,
  MIN_ANSWER_REVEAL_SECONDS,
  MIN_QUESTION_POINTS,
  MIN_SECTION_INTERMISSION_SECONDS,
  type GameSection,
  type LocalizedText,
  type QuestionMedia,
  type QuestionOption,
  type QuizQuestion,
  type SectionIntermissionMode,
} from "@/types/domain"

const store = useGameBuilderStore()
const route = useRoute()
const router = useRouter()
const isLoadingGame = ref(false)
const loadError = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const activeQuestionId = ref("")
const translationModalOpen = ref(false)
const translationDisplayTotal = ref(0)
const translationItems = ref<Array<{ id: string; text: string }>>([])
const draggedQuestionId = ref<string | null>(null)
const dropTarget = ref<{ sectionId: string; index: number } | null>(null)
const localPreviews = ref<
  Record<string, Partial<Record<"media" | "revealMedia", QuestionMedia>>>
>({})
const mediaDropTarget = ref<{
  questionId: string
  field: "media" | "revealMedia"
} | null>(null)
const { t } = useI18n()

const editingGameId = computed(
  () => (route.params.gameId as string | undefined) ?? "",
)
const isEditing = computed(() => Boolean(editingGameId.value))
const questionCountLabel = computed(() =>
  t("libraryView.questionsCount", { count: store.questions.length }),
)
const sectionCountLabel = computed(() =>
  t("gameBuilderView.sectionsCount", { count: store.sections.length }),
)
const sectionQuestions = computed(() => {
  const byId = new Map(
    store.questions.map((question) => [question.id, question]),
  )

  return new Map(
    store.sections.map((section) => [
      section.id,
      section.questionIds
        .map((questionId) => byId.get(questionId))
        .filter((question): question is QuizQuestion => question != null),
    ]),
  )
})
const activeQuestionIndex = computed(() =>
  store.questions.findIndex(
    (question) => question.id === activeQuestionId.value,
  ),
)
const activeQuestion = computed(() => {
  const fallback = store.questions[0] ?? null
  if (activeQuestionIndex.value === -1) return fallback
  return store.questions[activeQuestionIndex.value] ?? fallback
})
const activeSection = computed(() => {
  if (!activeQuestion.value) return store.sections[0] ?? null

  return (
    store.sections.find(
      (section) => section.id === activeQuestion.value?.sectionId,
    ) ?? null
  )
})
const isPrimaryLocaleActive = computed(
  () => store.activeLocale === store.primaryLocale,
)
const activeLocaleLabel = computed(
  () => getAppLocaleOption(store.activeLocale).shortLabel,
)
const primaryLocaleLabel = computed(
  () => getAppLocaleOption(store.primaryLocale).shortLabel,
)
const fallbackPlaceholder = computed(() =>
  t("builder.translations.placeholderFallback", {
    primaryLabel: primaryLocaleLabel.value,
  }),
)
const localizedGameTitle = computed({
  get() {
    if (isPrimaryLocaleActive.value) return store.title
    return store.titleI18n[store.activeLocale]?.text ?? ""
  },
  set(value: string) {
    if (isPrimaryLocaleActive.value) {
      store.title = value
      return
    }

    store.titleI18n = {
      ...store.titleI18n,
      [store.activeLocale]: {
        text: value,
        sourceHash: store.titleI18n[store.activeLocale]?.sourceHash ?? "",
      },
    }
  },
})
const activeQuestionPrompt = computed({
  get() {
    if (!activeQuestion.value) return ""
    if (isPrimaryLocaleActive.value) return activeQuestion.value.prompt
    return activeQuestion.value.promptI18n[store.activeLocale]?.text ?? ""
  },
  set(value: string) {
    if (!activeQuestion.value) return
    if (isPrimaryLocaleActive.value) {
      activeQuestion.value.prompt = value
      return
    }

    activeQuestion.value.promptI18n = {
      ...activeQuestion.value.promptI18n,
      [store.activeLocale]: {
        text: value,
        sourceHash:
          activeQuestion.value.promptI18n[store.activeLocale]?.sourceHash ?? "",
      },
    }
  },
})
const activeQuestionRevealText = computed({
  get() {
    if (!activeQuestion.value) return ""
    if (isPrimaryLocaleActive.value)
      return activeQuestion.value.revealText ?? ""
    return activeQuestion.value.revealTextI18n[store.activeLocale]?.text ?? ""
  },
  set(value: string) {
    if (!activeQuestion.value) return
    if (isPrimaryLocaleActive.value) {
      activeQuestion.value.revealText = value
      return
    }

    activeQuestion.value.revealTextI18n = {
      ...activeQuestion.value.revealTextI18n,
      [store.activeLocale]: {
        text: value,
        sourceHash:
          activeQuestion.value.revealTextI18n[store.activeLocale]?.sourceHash ??
          "",
      },
    }
  },
})

type LocaleStat = {
  emptyQuestions: number
  staleCount: number
  pendingItems: Array<{ id: string; text: string }>
}

const localeStats = computed(() => {
  const primary = store.primaryLocale
  const locales = appLocaleOptions
    .map((option) => option.code)
    .filter((code) => code !== primary)

  const stats = Object.fromEntries(
    locales.map((locale) => [
      locale,
      {
        emptyQuestions: 0,
        staleCount: 0,
        pendingItems: [] as Array<{ id: string; text: string }>,
      },
    ]),
  ) as Record<AppLocale, LocaleStat>
  const emptyTracker = Object.fromEntries(
    locales.map((locale) => [locale, new Set<string>()]),
  ) as Record<AppLocale, Set<string>>

  function consider(
    fieldId: string,
    text: string,
    pickEntry: (locale: AppLocale) => LocalizedText | null | undefined,
    questionId?: string,
  ) {
    if (!text.trim()) return
    const currentHash = computeSourceHash(text)

    for (const locale of locales) {
      const entry = pickEntry(locale)
      if (!entry?.text) {
        stats[locale].pendingItems.push({ id: fieldId, text })
        if (questionId) emptyTracker[locale].add(questionId)
      } else if (entry.sourceHash && entry.sourceHash !== currentHash) {
        stats[locale].pendingItems.push({ id: fieldId, text })
        stats[locale].staleCount += 1
      }
    }
  }

  consider("game:title", store.title, (locale) => store.titleI18n[locale])

  for (const section of store.sections) {
    consider(
      `section:${section.id}:title`,
      section.title,
      (locale) => section.titleI18n[locale],
    )
  }

  for (const question of store.questions) {
    consider(
      `question:${question.id}:prompt`,
      question.prompt,
      (locale) => question.promptI18n[locale],
      question.id,
    )
    consider(
      `question:${question.id}:reveal`,
      question.revealText ?? "",
      (locale) => question.revealTextI18n[locale],
      question.id,
    )
    for (const option of question.options) {
      consider(
        `option:${question.id}:${option.id}`,
        option.text,
        (locale) => option.textI18n[locale],
        question.id,
      )
    }
  }

  for (const locale of locales) {
    stats[locale].emptyQuestions = emptyTracker[locale].size
  }

  return stats
})

function localeRecord<T>(map: (stat: LocaleStat) => T, fallback: T) {
  return Object.fromEntries(
    appLocaleOptions.map((option) => [
      option.code,
      localeStats.value[option.code]
        ? map(localeStats.value[option.code])
        : fallback,
    ]),
  ) as Record<AppLocale, T>
}

const pendingItemByLocale = computed(() =>
  localeRecord((stat) => stat.pendingItems.length, 0),
)
const emptyByLocale = computed(() =>
  localeRecord((stat) => stat.emptyQuestions, 0),
)
const staleCountByLocale = computed(() =>
  localeRecord((stat) => stat.staleCount, 0),
)
const staleByLocale = computed(() =>
  localeRecord((stat) => stat.staleCount > 0, false),
)

watch(
  editingGameId,
  async () => {
    loadError.value = null
    localPreviews.value = {}

    if (isEditing.value) {
      isLoadingGame.value = true

      try {
        const game = await gameService.getGame(editingGameId.value)
        store.reset(game)
        activeQuestionId.value = store.questions[0]?.id ?? ""
      } catch (error) {
        loadError.value =
          error instanceof Error
            ? error.message
            : t("gameBuilderView.loadError")
      } finally {
        isLoadingGame.value = false
      }

      return
    }

    store.reset()
    activeQuestionId.value = store.questions[0]?.id ?? ""
  },
  { immediate: true },
)

watch(
  () => store.questions.map((question) => question.id),
  (questionIds) => {
    if (!questionIds.length) {
      activeQuestionId.value = ""
      return
    }

    if (!questionIds.includes(activeQuestionId.value)) {
      activeQuestionId.value = questionIds[0]
    }
  },
  { immediate: true },
)

function isMediaDropTarget(
  questionIndex: number,
  field: "media" | "revealMedia",
) {
  const question = store.questions[questionIndex]
  return (
    mediaDropTarget.value?.questionId === question?.id &&
    mediaDropTarget.value?.field === field
  )
}

function mediaDropZoneClass(
  questionIndex: number,
  field: "media" | "revealMedia",
) {
  return isMediaDropTarget(questionIndex, field)
    ? "border-[rgba(207,123,82,0.5)] bg-[rgba(255,248,241,0.92)] shadow-[0_16px_36px_rgba(58,38,28,0.12)]"
    : "border-warm-border-strong bg-white/50"
}

async function uploadMediaFile(
  questionIndex: number,
  field: "media" | "revealMedia",
  file: File,
) {
  uploadError.value = null
  try {
    validateQuestionMediaFile(file)
  } catch (error) {
    uploadError.value =
      error instanceof Error ? error.message : t("gameBuilderView.uploadError")
    return
  }

  const previewUrl = URL.createObjectURL(file)
  const previewKind = detectMediaKind(file)
  const previewDimensions = await readMediaDimensions(file, {
    kind: previewKind,
    url: previewUrl,
  })
  const questionId = store.questions[questionIndex].id

  localPreviews.value[questionId] = {
    ...localPreviews.value[questionId],
    [field]: {
      kind: previewKind,
      path: "",
      publicUrl: previewUrl,
      ...(previewDimensions ?? {}),
    },
  }

  try {
    const previousMedia = store.questions[questionIndex][field] ?? null
    const media = await gameService.uploadQuestionMedia(file)
    store.questions[questionIndex][field] = media
    delete localPreviews.value[questionId]?.[field]
    URL.revokeObjectURL(previewUrl)

    if (previousMedia?.path && previousMedia.path !== media.path) {
      void gameService.deleteUploadedMedia([previousMedia.path])
    }
  } catch (error) {
    uploadError.value =
      error instanceof Error ? error.message : t("gameBuilderView.uploadError")
    delete localPreviews.value[questionId]?.[field]
    URL.revokeObjectURL(previewUrl)
  }
}

async function replaceMedia(
  questionIndex: number,
  field: "media" | "revealMedia",
  event: Event,
) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    await uploadMediaFile(questionIndex, field, file)
  } finally {
    target.value = ""
  }
}

function onMediaDragEnter(
  questionIndex: number,
  field: "media" | "revealMedia",
  event: DragEvent,
) {
  if (!event.dataTransfer?.types.includes("Files")) return
  const question = store.questions[questionIndex]
  mediaDropTarget.value = { questionId: question.id, field }
}

function onMediaDragLeave(
  questionIndex: number,
  field: "media" | "revealMedia",
  event: DragEvent,
) {
  if (!isMediaDropTarget(questionIndex, field)) return
  const current = event.currentTarget as Node | null
  const related = event.relatedTarget as Node | null
  if (current?.contains(related)) return
  mediaDropTarget.value = null
}

async function dropMedia(
  questionIndex: number,
  field: "media" | "revealMedia",
  event: DragEvent,
) {
  mediaDropTarget.value = null
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  await uploadMediaFile(questionIndex, field, file)
}

async function removeMedia(
  questionIndex: number,
  field: "media" | "revealMedia",
) {
  const media = store.questions[questionIndex][field]
  const previewUrl =
    localPreviews.value[store.questions[questionIndex].id]?.[field]?.publicUrl
  if (!media?.path) {
    store.questions[questionIndex][field] = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    delete localPreviews.value[store.questions[questionIndex].id]?.[field]
    return
  }

  uploadError.value = null

  try {
    await gameService.deleteUploadedMedia([media.path])
    store.questions[questionIndex][field] = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    delete localPreviews.value[store.questions[questionIndex].id]?.[field]
  } catch (error) {
    uploadError.value =
      error instanceof Error
        ? error.message
        : t("gameBuilderView.removeMediaError")
  }
}

function updateCorrectOption(questionIndex: number, optionId: string) {
  store.questions[questionIndex].correctOptionId = optionId
}

function sectionTitle(section: GameSection) {
  if (isPrimaryLocaleActive.value) return section.title
  return section.titleI18n[store.activeLocale]?.text ?? ""
}

function updateSectionTitle(section: GameSection, value: string) {
  if (isPrimaryLocaleActive.value) {
    section.title = value
    return
  }

  section.titleI18n = {
    ...section.titleI18n,
    [store.activeLocale]: {
      text: value,
      sourceHash: section.titleI18n[store.activeLocale]?.sourceHash ?? "",
    },
  }
}

function questionPrompt(question: QuizQuestion) {
  if (isPrimaryLocaleActive.value) return question.prompt
  return question.promptI18n[store.activeLocale]?.text || question.prompt
}

function optionText(option: QuestionOption) {
  if (isPrimaryLocaleActive.value) return option.text
  return option.textI18n[store.activeLocale]?.text ?? ""
}

function updateOptionText(option: QuestionOption, value: string) {
  if (isPrimaryLocaleActive.value) {
    option.text = value
    return
  }

  option.textI18n = {
    ...option.textI18n,
    [store.activeLocale]: {
      text: value,
      sourceHash: option.textI18n[store.activeLocale]?.sourceHash ?? "",
    },
  }
}

function startTranslation() {
  if (!store.id) return
  const stats = localeStats.value[store.activeLocale]
  const pending = stats?.pendingItems ?? []
  if (!pending.length) return
  translationDisplayTotal.value =
    stats?.staleCount || stats?.emptyQuestions || 0
  translationItems.value = pending
  translationModalOpen.value = true
}

function clearActiveLocale() {
  const label = activeLocaleLabel.value
  if (
    window.confirm(
      t("builder.translations.clearLocaleConfirm", {
        label,
      }),
    )
  ) {
    store.clearTranslation(store.activeLocale)
  }
}

function mediaSummary(media: QuestionMedia | null | undefined) {
  if (!media) return t("gameBuilderView.noMedia")
  return t("gameBuilderView.mediaReady", { kind: media.kind })
}

function previewMedia(questionIndex: number, field: "media" | "revealMedia") {
  const question = store.questions[questionIndex]
  return localPreviews.value[question.id]?.[field] ?? question[field]
}

function questionNumber(questionId: string) {
  return store.questions.findIndex((question) => question.id === questionId) + 1
}

function addSectionAndFocus() {
  store.addSection()
  activeQuestionId.value = store.questions.at(-1)?.id ?? ""
}

function addQuestionToSection(sectionId: string) {
  store.addQuestion(sectionId)
  activeQuestionId.value =
    store.sections
      .find((section) => section.id === sectionId)
      ?.questionIds.at(-1) ??
    store.questions.at(-1)?.id ??
    ""
}

function updateDefaultQuestionPoints(event: Event) {
  const target = event.target as HTMLInputElement
  store.setDefaultQuestionPoints(Number(target.value))
}

function updateDefaultSectionIntermission(event: Event) {
  const target = event.target as HTMLInputElement
  store.setDefaultSectionIntermissionSeconds(Number(target.value))
}

function updateDefaultAnswerReveal(event: Event) {
  const target = event.target as HTMLInputElement
  store.setDefaultAnswerRevealSeconds(Number(target.value))
}

function updateManualQuestionAdvance(event: Event) {
  const target = event.target as HTMLInputElement
  store.setManualQuestionAdvance(target.checked)
}

function updateSectionIntermissionMode(sectionId: string, event: Event) {
  const target = event.target as HTMLSelectElement
  const mode = target.value as SectionIntermissionMode
  const section = store.sections.find((entry) => entry.id === sectionId)
  const fallbackSeconds =
    section?.intermissionSeconds ?? store.defaultSectionIntermissionSeconds
  store.setSectionIntermission(
    sectionId,
    mode,
    mode === "timer" ? fallbackSeconds : null,
  )
}

function updateSectionIntermissionSeconds(sectionId: string, event: Event) {
  const target = event.target as HTMLInputElement
  store.setSectionIntermission(sectionId, "timer", Number(target.value))
}

function moveSection(sectionId: string, direction: -1 | 1) {
  store.moveSection(sectionId, direction)
}

function removeSection(sectionId: string) {
  if (activeQuestion.value?.sectionId === sectionId) {
    const fallbackQuestionId = store.sections
      .filter((section) => section.id !== sectionId)
      .flatMap((section) => section.questionIds)[0]

    activeQuestionId.value = fallbackQuestionId ?? ""
  }

  store.removeSection(sectionId)
}

function removeActiveQuestion() {
  if (!activeQuestion.value) return
  store.removeQuestion(activeQuestion.value.id)
}

function onQuestionDragStart(questionId: string) {
  draggedQuestionId.value = questionId
}

function onQuestionDragEnd() {
  draggedQuestionId.value = null
  dropTarget.value = null
}

function setDropTarget(sectionId: string, index: number) {
  if (!draggedQuestionId.value) return
  dropTarget.value = { sectionId, index }
}

function handleQuestionDrop(sectionId: string, index: number) {
  if (!draggedQuestionId.value) return

  store.moveQuestion(draggedQuestionId.value, sectionId, index)
  activeQuestionId.value = draggedQuestionId.value
  onQuestionDragEnd()
}

async function onSave() {
  const gameId = await store.save()
  await router.push(`/games/${gameId}`)
}
</script>

<template>
  <PageShell stack class="py-6 md:py-8">
    <SurfacePanel
      v-if="isLoadingGame"
      class="text-sm text-[color:var(--text-muted)]"
    >
      {{ t("common.loading") }}
    </SurfacePanel>

    <SurfacePanel v-else-if="loadError" class="text-sm text-error">
      {{ loadError }}
    </SurfacePanel>

    <div
      v-else
      class="flex flex-col gap-[var(--space-section-mobile)] md:gap-[var(--space-section-desktop)]"
    >
      <section
        class="family-stage p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)]"
      >
        <div class="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <div>
            <Kicker class="text-inverse-muted">
              {{
                isEditing
                  ? t("gameBuilderView.editKicker")
                  : t("gameBuilderView.newKicker")
              }}
            </Kicker>
            <h1
              class="app-title mt-4 max-w-4xl font-display font-semibold text-white"
            >
              {{
                isEditing
                  ? t("gameBuilderView.editTitle")
                  : t("gameBuilderView.newTitle")
              }}
            </h1>
            <p class="mt-4 max-w-3xl text-base leading-7 text-inverse-body">
              {{ t("gameBuilderView.body") }}
            </p>

            <div class="mt-8 max-w-3xl space-y-3">
              <label
                class="text-chip font-semibold uppercase tracking-[0.28em] text-inverse-muted"
              >
                {{ t("gameBuilderView.quizTitle") }}
              </label>
              <Input
                v-model="localizedGameTitle"
                :placeholder="
                  isPrimaryLocaleActive
                    ? t('gameBuilderView.quizTitlePlaceholder')
                    : fallbackPlaceholder
                "
              />
            </div>

            <div
              class="mt-6 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4"
            >
              <PrimaryLocalePicker
                :primary-locale="store.primaryLocale"
                :locked="store.hasAnyTranslation"
                @change="store.setPrimaryLocale"
              />

              <div class="space-y-3">
                <label
                  class="text-chip font-semibold uppercase tracking-[0.28em] text-inverse-muted"
                >
                  {{ t("gameBuilderView.defaultQuestionPoints") }}
                </label>
                <input
                  :value="store.defaultQuestionPoints"
                  type="number"
                  :min="MIN_QUESTION_POINTS"
                  :max="MAX_QUESTION_POINTS"
                  class="flex h-12 w-full rounded-[1.35rem] border border-white/14 bg-white/94 px-4 text-sm text-foreground outline-none transition placeholder:text-[#a08f80] focus:border-primary focus:bg-white"
                  @input="updateDefaultQuestionPoints"
                />
                <p class="text-sm leading-6 text-inverse-body">
                  {{ t("gameBuilderView.defaultQuestionPointsBody") }}
                </p>
              </div>

              <div class="space-y-3">
                <label
                  class="text-chip font-semibold uppercase tracking-[0.28em] text-inverse-muted"
                >
                  {{ t("gameBuilderView.defaultSectionIntermission") }}
                </label>
                <input
                  :value="store.defaultSectionIntermissionSeconds"
                  type="number"
                  :min="MIN_SECTION_INTERMISSION_SECONDS"
                  :max="MAX_SECTION_INTERMISSION_SECONDS"
                  class="flex h-12 w-full rounded-[1.35rem] border border-white/14 bg-white/94 px-4 text-sm text-foreground outline-none transition placeholder:text-[#a08f80] focus:border-primary focus:bg-white"
                  @input="updateDefaultSectionIntermission"
                />
                <p class="text-sm leading-6 text-inverse-body">
                  {{ t("gameBuilderView.defaultSectionIntermissionBody") }}
                </p>
              </div>

              <div class="space-y-3">
                <label
                  class="text-chip font-semibold uppercase tracking-[0.28em] text-inverse-muted"
                >
                  {{ t("gameBuilderView.defaultAnswerReveal") }}
                </label>
                <input
                  :value="store.defaultAnswerRevealSeconds"
                  type="number"
                  :min="MIN_ANSWER_REVEAL_SECONDS"
                  :max="MAX_ANSWER_REVEAL_SECONDS"
                  :disabled="store.manualQuestionAdvance"
                  class="flex h-12 w-full rounded-[1.35rem] border border-white/14 bg-white/94 px-4 text-sm text-foreground outline-none transition placeholder:text-[#a08f80] focus:border-primary focus:bg-white"
                  @input="updateDefaultAnswerReveal"
                />
                <label class="flex items-start gap-3 text-sm text-inverse-body">
                  <input
                    :checked="store.manualQuestionAdvance"
                    type="checkbox"
                    class="mt-1 size-4 rounded border-white/30 text-primary"
                    @change="updateManualQuestionAdvance"
                  />
                  <span>{{ t("gameBuilderView.manualQuestionAdvance") }}</span>
                </label>
                <p class="text-sm leading-6 text-inverse-body">
                  {{
                    store.manualQuestionAdvance
                      ? t("gameBuilderView.manualQuestionAdvanceBody")
                      : t("gameBuilderView.defaultAnswerRevealBody")
                  }}
                </p>
              </div>
            </div>
          </div>

          <div class="grid gap-3">
            <div
              class="rounded-[1.3rem] border border-white/10 bg-white/10 p-4"
            >
              <Kicker class="text-inverse-muted">
                {{ t("gameBuilderView.questions") }}
              </Kicker>
              <p class="mt-3 text-3xl font-semibold text-white">
                {{ questionCountLabel }}
              </p>
            </div>
            <div
              class="rounded-[1.3rem] border border-white/10 bg-white/10 p-4"
            >
              <Kicker class="text-inverse-muted">
                {{ t("gameBuilderView.sections") }}
              </Kicker>
              <p class="mt-3 text-3xl font-semibold text-white">
                {{ sectionCountLabel }}
              </p>
            </div>
            <div
              class="rounded-[1.3rem] border border-white/10 bg-white/10 p-4"
            >
              <Kicker class="text-inverse-muted">
                {{ t("gameBuilderView.defaultPointsShort") }}
              </Kicker>
              <p class="mt-3 text-3xl font-semibold text-white">
                {{ store.defaultQuestionPoints }}
              </p>
            </div>
            <div
              class="rounded-[1.3rem] border border-white/10 bg-white/10 p-4"
            >
              <Kicker class="text-inverse-muted">
                {{ t("gameBuilderView.status") }}
              </Kicker>
              <p class="mt-3 text-lg font-semibold text-white">
                {{
                  store.isValid
                    ? t("gameBuilderView.readyToSave")
                    : t("gameBuilderView.fixFirst")
                }}
              </p>
              <p class="mt-2 text-sm leading-6 text-inverse-body">
                {{
                  store.isValid
                    ? t("gameBuilderView.readyBody")
                    : store.validationErrors[0]
                }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <LanguageTabStrip
        :active-locale="store.activeLocale"
        :primary-locale="store.primaryLocale"
        :stale-by-locale="staleByLocale"
        :empty-by-locale="emptyByLocale"
        :pending-item-by-locale="pendingItemByLocale"
        :stale-count-by-locale="staleCountByLocale"
        @select="store.activeLocale = $event"
        @translate="startTranslation"
        @clear="clearActiveLocale"
      />

      <section class="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside class="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <SurfacePanel padded="none" class="p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <Kicker>
                  {{ t("gameBuilderView.sections") }}
                </Kicker>
                <p class="mt-2 text-sm text-[color:var(--text-muted)]">
                  {{ t("gameBuilderView.pickQuestion") }}
                </p>
              </div>
              <Button size="sm" @click="addSectionAndFocus">
                {{ t("gameBuilderView.addSection") }}
              </Button>
            </div>

            <div class="mt-4 space-y-3">
              <div
                v-for="(section, sectionIndex) in store.sections"
                :key="section.id"
                class="rounded-[1.55rem] border border-warm-border-soft bg-white/66 p-3"
                @dragover.prevent="
                  setDropTarget(section.id, section.questionIds.length)
                "
                @drop="
                  handleQuestionDrop(section.id, section.questionIds.length)
                "
              >
                <div class="flex items-start gap-2">
                  <div class="min-w-0 flex-1">
                    <Kicker>
                      {{
                        t("gameBuilderView.sectionShort", {
                          number: sectionIndex + 1,
                        })
                      }}
                    </Kicker>
                    <Input
                      :model-value="sectionTitle(section)"
                      class="mt-2"
                      :placeholder="
                        isPrimaryLocaleActive
                          ? t('gameBuilderView.sectionPlaceholder', {
                              number: sectionIndex + 1,
                            })
                          : fallbackPlaceholder
                      "
                      @update:model-value="updateSectionTitle(section, $event)"
                    />
                  </div>
                  <div class="flex items-center gap-1 pt-6">
                    <button
                      type="button"
                      class="grid size-9 place-items-center rounded-full border border-warm-border bg-white/88 text-[color:var(--warm-ink-soft)] transition hover:bg-white"
                      :disabled="sectionIndex === 0"
                      @click="moveSection(section.id, -1)"
                    >
                      <ArrowUp class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="grid size-9 place-items-center rounded-full border border-warm-border bg-white/88 text-[color:var(--warm-ink-soft)] transition hover:bg-white"
                      :disabled="sectionIndex === store.sections.length - 1"
                      @click="moveSection(section.id, 1)"
                    >
                      <ArrowDown class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="grid size-9 place-items-center rounded-full border border-warm-border bg-white/88 text-[color:var(--warm-ink-soft)] transition hover:bg-white"
                      :disabled="store.sections.length === 1"
                      @click="removeSection(section.id)"
                    >
                      <span class="text-base font-semibold">×</span>
                    </button>
                  </div>
                </div>

                <div class="mt-3">
                  <p
                    class="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)]"
                  >
                    {{ t("gameBuilderView.sectionIntermission") }}
                  </p>
                  <p
                    v-if="sectionIndex === 0"
                    class="mt-2 text-xs leading-5 text-[color:var(--warm-ink-soft)]"
                  >
                    {{ t("gameBuilderView.sectionIntermissionFirstNote") }}
                  </p>
                  <div v-else class="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      :value="section.intermissionMode"
                      class="h-10 rounded-[1.1rem] border border-warm-border bg-white/92 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-white"
                      @change="
                        updateSectionIntermissionMode(section.id, $event)
                      "
                    >
                      <option value="inherit">
                        {{
                          t("gameBuilderView.sectionIntermissionInherit", {
                            seconds: store.defaultSectionIntermissionSeconds,
                          })
                        }}
                      </option>
                      <option value="timer">
                        {{ t("gameBuilderView.sectionIntermissionTimer") }}
                      </option>
                      <option value="manual">
                        {{ t("gameBuilderView.sectionIntermissionManual") }}
                      </option>
                    </select>
                    <input
                      v-if="section.intermissionMode === 'timer'"
                      :value="section.intermissionSeconds ?? ''"
                      type="number"
                      :min="MIN_SECTION_INTERMISSION_SECONDS"
                      :max="MAX_SECTION_INTERMISSION_SECONDS"
                      class="h-10 w-24 rounded-[1.1rem] border border-warm-border bg-white/92 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-white"
                      :placeholder="
                        String(store.defaultSectionIntermissionSeconds)
                      "
                      @input="
                        updateSectionIntermissionSeconds(section.id, $event)
                      "
                    />
                    <span
                      v-if="section.intermissionMode === 'timer'"
                      class="text-xs uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)]"
                    >
                      {{ t("gameBuilderView.secondsAbbr") }}
                    </span>
                  </div>
                </div>

                <div class="mt-3 space-y-2">
                  <button
                    v-for="(question, questionIndex) in sectionQuestions.get(
                      section.id,
                    ) ?? []"
                    :key="question.id"
                    type="button"
                    draggable="true"
                    class="w-full rounded-[1.3rem] border p-3 text-left transition hover:-translate-y-0.5"
                    :class="
                      question.id === activeQuestionId
                        ? 'border-[rgba(207,123,82,0.3)] bg-[rgba(207,123,82,0.1)] shadow-[0_14px_30px_rgba(58,38,28,0.08)]'
                        : dropTarget?.sectionId === section.id &&
                            dropTarget?.index === questionIndex
                          ? 'border-[rgba(207,123,82,0.22)] bg-[rgba(255,248,241,0.94)]'
                          : 'border-warm-border-soft bg-white/78'
                    "
                    @click="activeQuestionId = question.id"
                    @dragstart="onQuestionDragStart(question.id)"
                    @dragend="onQuestionDragEnd"
                    @dragover.prevent="setDropTarget(section.id, questionIndex)"
                    @drop="handleQuestionDrop(section.id, questionIndex)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span
                        class="flex items-center gap-2 text-sm font-semibold text-foreground"
                      >
                        <GripVertical
                          class="size-4 text-[color:var(--warm-ink-soft)]"
                        />
                        {{
                          t("gameBuilderView.questionShort", {
                            number: questionNumber(question.id),
                          })
                        }}
                      </span>
                      <div
                        class="flex flex-wrap items-center justify-end gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)]"
                      >
                        <span>
                          {{
                            t("gameManageView.seconds", {
                              count: question.durationSeconds,
                            })
                          }}
                        </span>
                        <span>
                          {{
                            t("gameBuilderView.pointsShort", {
                              score: question.points,
                            })
                          }}
                        </span>
                      </div>
                    </div>
                    <p
                      class="mt-2 line-clamp-2 text-sm leading-6 text-[color:var(--text-body)]"
                    >
                      {{
                        questionPrompt(question) ||
                        t("gameBuilderView.untitledQuestion")
                      }}
                    </p>
                  </button>
                </div>

                <button
                  type="button"
                  class="mt-3 w-full rounded-[1.1rem] border border-dashed px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)] transition"
                  :class="
                    dropTarget?.sectionId === section.id &&
                    dropTarget?.index === section.questionIds.length
                      ? 'border-[rgba(207,123,82,0.3)] bg-[rgba(255,248,241,0.88)]'
                      : 'border-warm-border bg-white/52'
                  "
                  @click="addQuestionToSection(section.id)"
                  @dragover.prevent="
                    setDropTarget(section.id, section.questionIds.length)
                  "
                  @drop="
                    handleQuestionDrop(section.id, section.questionIds.length)
                  "
                >
                  {{ t("gameBuilderView.addQuestionToSection") }}
                </button>
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel
            v-if="store.validationErrors.length > 1"
            padded="none"
            class="rounded-[1.7rem] border-warm-border bg-[rgba(255,250,244,0.94)] p-5 text-sm leading-6 shadow-[0_12px_30px_rgba(55,37,26,0.08)]"
          >
            <p class="font-medium text-foreground">
              {{ t("gameBuilderView.fixFirst") }}
            </p>
            <ul class="mt-3 space-y-2">
              <li
                v-for="issue in store.validationErrors.slice(0, 6)"
                :key="issue"
              >
                {{ issue }}
              </li>
            </ul>
          </SurfacePanel>
        </aside>

        <section v-if="activeQuestion && activeQuestionIndex >= 0">
          <SurfacePanel padded="none" class="p-5 md:p-6">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Kicker>
                  {{
                    t("gameBuilderView.editQuestionLabel", {
                      number: activeQuestionIndex + 1,
                    })
                  }}
                </Kicker>
                <h2
                  class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground"
                >
                  {{ t("gameBuilderView.editQuestionTitle") }}
                </h2>
                <p
                  class="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--warm-ink-soft)]"
                >
                  {{ t("gameBuilderView.editQuestionBody") }}
                </p>
                <p
                  v-if="activeSection"
                  class="mt-4 inline-flex rounded-full border border-warm-border bg-white/72 px-4 py-2 text-sm font-semibold text-[color:var(--text-body)]"
                >
                  {{
                    t("gameBuilderView.questionSection", {
                      number: activeSection.position + 1,
                      title: sectionTitle(activeSection),
                    })
                  }}
                </p>
              </div>

              <div class="flex flex-wrap gap-3">
                <Button variant="danger" @click="removeActiveQuestion">
                  {{ t("common.removeQuestion") }}
                </Button>
                <Button
                  :disabled="!store.isValid || store.isSaving"
                  @click="onSave"
                >
                  {{
                    store.isSaving
                      ? t("common.saving")
                      : isEditing
                        ? t("common.saveChanges")
                        : t("common.saveQuiz")
                  }}
                </Button>
              </div>
            </div>

            <div class="mt-8 space-y-3">
              <label
                class="text-chip font-semibold uppercase tracking-[0.28em] text-[color:var(--text-subtle)]"
              >
                {{ t("gameBuilderView.questionLabel") }}
              </label>
              <Textarea
                v-model="activeQuestionPrompt"
                :placeholder="
                  isPrimaryLocaleActive
                    ? t('gameBuilderView.questionPlaceholder')
                    : fallbackPlaceholder
                "
                :rows="4"
              />
            </div>

            <div class="mt-8 grid gap-4 md:grid-cols-2">
              <button
                v-for="(option, optionIndex) in activeQuestion.options"
                :key="option.id"
                type="button"
                class="rounded-[1.6rem] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(58,38,28,0.08)]"
                :class="
                  activeQuestion.correctOptionId === option.id
                    ? 'border-[rgba(207,123,82,0.3)] bg-[rgba(207,123,82,0.08)]'
                    : 'border-warm-border-soft bg-white/72'
                "
                @click="updateCorrectOption(activeQuestionIndex, option.id)"
              >
                <div class="flex items-center justify-between gap-3">
                  <span
                    class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)]"
                  >
                    {{
                      t("gameBuilderView.answerLabel", {
                        number: optionIndex + 1,
                      })
                    }}
                  </span>
                  <span
                    class="rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]"
                    :class="
                      activeQuestion.correctOptionId === option.id
                        ? 'border-[rgba(207,123,82,0.22)] bg-[rgba(207,123,82,0.12)] text-primary'
                        : 'border-warm-border bg-white/72 text-[color:var(--warm-ink-soft)]'
                    "
                  >
                    {{
                      activeQuestion.correctOptionId === option.id
                        ? t("gameBuilderView.correct")
                        : t("gameBuilderView.markCorrect")
                    }}
                  </span>
                </div>
                <Input
                  :model-value="optionText(option)"
                  class="mt-3"
                  :placeholder="
                    isPrimaryLocaleActive
                      ? t('gameBuilderView.answerPlaceholder')
                      : fallbackPlaceholder
                  "
                  @click.stop
                  @update:model-value="updateOptionText(option, $event)"
                />
              </button>
            </div>

            <div class="mt-8 space-y-4">
              <div class="grid gap-4 md:grid-cols-2">
                <div class="min-w-0">
                  <label
                    class="text-chip font-semibold uppercase tracking-[0.28em] text-[color:var(--text-subtle)]"
                  >
                    {{ t("gameBuilderView.timer") }}
                  </label>
                  <input
                    v-model.number="activeQuestion.durationSeconds"
                    type="number"
                    min="5"
                    max="300"
                    class="mt-3 flex h-12 w-full rounded-[1.35rem] border border-warm-border bg-white/92 px-4 text-sm text-foreground outline-none transition placeholder:text-[#a08f80] focus:border-primary focus:bg-white/96"
                  />
                </div>

                <div class="min-w-0">
                  <label
                    class="text-chip font-semibold uppercase tracking-[0.28em] text-[color:var(--text-subtle)]"
                  >
                    {{ t("gameBuilderView.questionPoints") }}
                  </label>
                  <input
                    v-model.number="activeQuestion.points"
                    type="number"
                    :min="MIN_QUESTION_POINTS"
                    :max="MAX_QUESTION_POINTS"
                    class="mt-3 flex h-12 w-full rounded-[1.35rem] border border-warm-border bg-white/92 px-4 text-sm text-foreground outline-none transition placeholder:text-[#a08f80] focus:border-primary focus:bg-white/96"
                  />
                </div>
              </div>

              <div class="grid gap-4 lg:grid-cols-2">
                <PaperCard class="flex h-full flex-col p-4">
                  <Kicker>
                    {{ t("gameBuilderView.questionMedia") }}
                  </Kicker>
                  <p
                    class="mt-2 text-sm leading-6 text-[color:var(--warm-ink-soft)]"
                  >
                    {{ t("gameBuilderView.questionMediaBody") }}
                  </p>

                  <div
                    class="mt-4 flex min-h-[16rem] flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-dashed px-4 text-center text-sm leading-6 text-[color:var(--warm-ink-soft)] transition md:min-h-[18rem]"
                    :class="mediaDropZoneClass(activeQuestionIndex, 'media')"
                    @dragenter.prevent="
                      onMediaDragEnter(activeQuestionIndex, 'media', $event)
                    "
                    @dragover.prevent="
                      onMediaDragEnter(activeQuestionIndex, 'media', $event)
                    "
                    @dragleave="
                      onMediaDragLeave(activeQuestionIndex, 'media', $event)
                    "
                    @drop.prevent="
                      dropMedia(activeQuestionIndex, 'media', $event)
                    "
                  >
                    <MediaAsset
                      v-if="previewMedia(activeQuestionIndex, 'media')"
                      :media="previewMedia(activeQuestionIndex, 'media')"
                      :alt="t('gameBuilderView.questionMediaPreviewAlt')"
                      presentation="editor"
                      class="w-full"
                    />
                    <template v-else>
                      <span class="font-semibold text-foreground">
                        {{ t("gameBuilderView.dropMedia") }}
                      </span>
                      <span class="mt-1">
                        {{ t("gameBuilderView.questionMediaBody") }}
                      </span>
                    </template>
                  </div>

                  <div class="mt-4 flex flex-1 flex-col justify-end">
                    <p
                      v-if="previewMedia(activeQuestionIndex, 'media')"
                      class="text-xs uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)]"
                    >
                      {{
                        mediaSummary(previewMedia(activeQuestionIndex, "media"))
                      }}
                    </p>

                    <div class="mt-4 flex flex-wrap gap-3">
                      <label class="inline-flex">
                        <span class="sr-only">{{
                          t("gameBuilderView.uploadQuestionMedia")
                        }}</span>
                        <input
                          type="file"
                          accept="image/*,audio/*,video/*"
                          class="hidden"
                          @change="
                            replaceMedia(activeQuestionIndex, 'media', $event)
                          "
                        />
                        <span
                          class="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-warm-border bg-white/90 px-5 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-white"
                        >
                          {{
                            activeQuestion.media
                              ? t("gameBuilderView.replaceMedia")
                              : t("gameBuilderView.addMedia")
                          }}
                        </span>
                      </label>
                      <Button
                        v-if="activeQuestion.media"
                        variant="danger"
                        @click="removeMedia(activeQuestionIndex, 'media')"
                      >
                        {{ t("common.remove") }}
                      </Button>
                    </div>
                  </div>
                </PaperCard>

                <PaperCard class="flex h-full flex-col p-4">
                  <Kicker>
                    {{ t("gameBuilderView.revealMedia") }}
                  </Kicker>
                  <p
                    class="mt-2 text-sm leading-6 text-[color:var(--warm-ink-soft)]"
                  >
                    {{ t("gameBuilderView.revealMediaBody") }}
                  </p>

                  <div
                    class="mt-4 flex min-h-[16rem] flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-dashed px-4 text-center text-sm leading-6 text-[color:var(--warm-ink-soft)] transition md:min-h-[18rem]"
                    :class="
                      mediaDropZoneClass(activeQuestionIndex, 'revealMedia')
                    "
                    @dragenter.prevent="
                      onMediaDragEnter(
                        activeQuestionIndex,
                        'revealMedia',
                        $event,
                      )
                    "
                    @dragover.prevent="
                      onMediaDragEnter(
                        activeQuestionIndex,
                        'revealMedia',
                        $event,
                      )
                    "
                    @dragleave="
                      onMediaDragLeave(
                        activeQuestionIndex,
                        'revealMedia',
                        $event,
                      )
                    "
                    @drop.prevent="
                      dropMedia(activeQuestionIndex, 'revealMedia', $event)
                    "
                  >
                    <MediaAsset
                      v-if="previewMedia(activeQuestionIndex, 'revealMedia')"
                      :media="previewMedia(activeQuestionIndex, 'revealMedia')"
                      :alt="t('gameBuilderView.revealMediaPreviewAlt')"
                      presentation="editor"
                      class="w-full"
                    />
                    <template v-else>
                      <span class="font-semibold text-foreground">
                        {{ t("gameBuilderView.dropMedia") }}
                      </span>
                      <span class="mt-1">
                        {{ t("gameBuilderView.revealMediaBody") }}
                      </span>
                    </template>
                  </div>

                  <div class="mt-4 flex flex-1 flex-col justify-end">
                    <p
                      v-if="previewMedia(activeQuestionIndex, 'revealMedia')"
                      class="text-xs uppercase tracking-[0.18em] text-[color:var(--warm-ink-soft)]"
                    >
                      {{
                        mediaSummary(
                          previewMedia(activeQuestionIndex, "revealMedia"),
                        )
                      }}
                    </p>

                    <div class="mt-4 flex flex-wrap gap-3">
                      <label class="inline-flex">
                        <span class="sr-only">{{
                          t("gameBuilderView.uploadRevealMedia")
                        }}</span>
                        <input
                          type="file"
                          accept="image/*,audio/*,video/*"
                          class="hidden"
                          @change="
                            replaceMedia(
                              activeQuestionIndex,
                              'revealMedia',
                              $event,
                            )
                          "
                        />
                        <span
                          class="inline-flex h-11 cursor-pointer items-center justify-center rounded-full border border-warm-border bg-white/90 px-5 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-white"
                        >
                          {{
                            activeQuestion.revealMedia
                              ? t("gameBuilderView.replaceMedia")
                              : t("gameBuilderView.addMedia")
                          }}
                        </span>
                      </label>
                      <Button
                        v-if="activeQuestion.revealMedia"
                        variant="danger"
                        @click="removeMedia(activeQuestionIndex, 'revealMedia')"
                      >
                        {{ t("common.remove") }}
                      </Button>
                    </div>
                  </div>
                </PaperCard>
              </div>
            </div>

            <div class="mt-8 space-y-3">
              <label
                class="text-chip font-semibold uppercase tracking-[0.28em] text-[color:var(--text-subtle)]"
              >
                {{ t("gameBuilderView.answerNote") }}
              </label>
              <Textarea
                v-model="activeQuestionRevealText"
                :placeholder="
                  isPrimaryLocaleActive
                    ? t('gameBuilderView.answerNotePlaceholder')
                    : fallbackPlaceholder
                "
                :rows="4"
              />
            </div>

            <p
              v-if="uploadError"
              class="mt-6 rounded-[1.35rem] border border-[#f1c3c3] bg-[linear-gradient(180deg,rgba(255,243,243,0.95),rgba(255,250,247,0.96))] px-4 py-3 text-sm text-[#a24f55]"
            >
              {{ uploadError }}
            </p>

            <div class="mt-8 flex flex-wrap gap-3">
              <Button variant="danger" @click="removeActiveQuestion">
                {{ t("common.removeQuestion") }}
              </Button>
              <Button
                :disabled="!store.isValid || store.isSaving"
                @click="onSave"
              >
                {{
                  store.isSaving
                    ? t("common.saving")
                    : isEditing
                      ? t("common.saveChanges")
                      : t("common.saveQuiz")
                }}
              </Button>
              <Button
                v-if="isEditing"
                :to="`/games/${editingGameId}`"
                variant="secondary"
              >
                {{ t("gameBuilderView.backToQuiz") }}
              </Button>
            </div>
          </SurfacePanel>
        </section>
      </section>
    </div>

    <TranslationModal
      :open="translationModalOpen"
      :game-id="store.id"
      :source-locale="store.primaryLocale"
      :target-locale="store.activeLocale"
      :items="translationItems"
      :display-total="translationDisplayTotal"
      @close="translationModalOpen = false"
    />
  </PageShell>
</template>
