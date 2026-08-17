<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import { useI18n } from "vue-i18n"

import type { QuestionMedia } from "@/types/domain"

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    media?: QuestionMedia | null
    alt?: string
    fit?: "cover" | "contain"
    controls?: boolean
    autoplay?: boolean
    presentation?: "default" | "editor"
    framed?: boolean
  }>(),
  {
    media: null,
    alt: undefined,
    fit: "cover",
    controls: true,
    autoplay: false,
    presentation: "default",
    framed: true,
  },
)

const resolvedAlt = computed(() => props.alt ?? t("media.assetAlt"))
const isEditorPresentation = computed(() => props.presentation === "editor")
const mediaAspectRatio = computed(() => {
  const { width, height } = props.media ?? {}
  if (!width || !height || width <= 0 || height <= 0) return undefined

  return `${width} / ${height}`
})
const videoRef = ref<HTMLVideoElement | null>(null)
const autoplayBlocked = ref(false)

async function attemptVideoAutoplay() {
  autoplayBlocked.value = false

  if (!props.autoplay || props.media?.kind !== "video") return

  await nextTick()

  const video = videoRef.value
  if (!video) return

  video.muted = false
  video.playsInline = true

  try {
    await video.play()
  } catch {
    autoplayBlocked.value = true
  }
}

function playVideo() {
  const video = videoRef.value
  if (!video) return

  autoplayBlocked.value = false
  video.muted = false
  void video.play().catch(() => {
    autoplayBlocked.value = true
  })
}

watch(
  () => [props.media?.publicUrl, props.media?.kind, props.autoplay],
  () => {
    void attemptVideoAutoplay()
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="props.media?.publicUrl"
    class="relative h-full overflow-hidden rounded-[1.5rem]"
    :class="[
      props.framed
        ? 'border border-warm-border-soft bg-white/80 shadow-[0_14px_28px_rgba(58,38,28,0.1)]'
        : 'bg-transparent',
      isEditorPresentation && props.media.kind !== 'audio'
        ? 'aspect-[4/3] min-h-[16rem] md:min-h-[18rem]'
        : null,
    ]"
    :style="{ aspectRatio: mediaAspectRatio }"
  >
    <img
      v-if="props.media.kind === 'image'"
      :src="props.media.publicUrl"
      :alt="resolvedAlt"
      loading="lazy"
      class="h-full w-full"
      :class="[
        isEditorPresentation ? 'min-h-[16rem] md:min-h-[18rem]' : 'min-h-56',
        props.fit === 'cover' ? 'object-cover' : 'object-contain',
      ]"
    />
    <audio
      v-else-if="props.media.kind === 'audio'"
      :src="props.media.publicUrl"
      class="w-full bg-white/70 p-5"
      :controls="props.controls"
    />
    <video
      v-else
      ref="videoRef"
      :src="props.media.publicUrl"
      class="h-full w-full bg-white/70"
      :class="[
        isEditorPresentation ? 'min-h-[16rem] md:min-h-[18rem]' : 'min-h-56',
        props.fit === 'cover' ? 'object-cover' : 'object-contain',
      ]"
      :controls="props.controls"
      :autoplay="props.autoplay"
      playsinline
      @loadedmetadata="attemptVideoAutoplay"
    />
    <div
      v-if="props.media.kind === 'video' && autoplayBlocked"
      class="absolute inset-x-0 bottom-0 flex justify-center bg-[linear-gradient(180deg,transparent,rgba(31,22,18,0.76))] px-4 pb-4 pt-12"
    >
      <button
        type="button"
        class="rounded-full border border-white/16 bg-white/92 px-5 py-2 text-sm font-semibold text-foreground shadow-[0_12px_28px_rgba(0,0,0,0.18)] transition hover:bg-white"
        @click="playVideo"
      >
        Play reveal video
      </button>
    </div>
  </div>
</template>
