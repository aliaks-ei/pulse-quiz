<script setup lang="ts">
import { computed } from "vue"

type Rounded = "sm" | "md" | "lg" | "full"
type Tone = "light" | "dark"

const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    rounded?: Rounded
    tone?: Tone
  }>(),
  {
    width: "100%",
    height: "1rem",
    rounded: "md",
    tone: "light",
  },
)

const radiusClass = computed(
  () =>
    ({
      sm: "rounded-md",
      md: "rounded-lg",
      lg: "rounded-2xl",
      full: "rounded-full",
    })[props.rounded],
)

const toneClass = computed(() =>
  props.tone === "dark" ? "bg-white/12" : "bg-black/8",
)
</script>

<template>
  <div
    aria-hidden="true"
    class="skeleton-block animate-pulse"
    :class="[radiusClass, toneClass]"
    :style="{ width, height }"
  />
</template>
