<script setup lang="ts">
import { computed, ref, watch } from "vue"

import {
  getAvatarPresetLabel,
  avatarPresetSources,
} from "@/components/avatars/avatarPresets"
import { cn } from "@/lib/utils"
import { supabase } from "@/services/supabase"
import type { AvatarKey } from "@/types/domain"

const props = withDefaults(
  defineProps<{
    avatarKey: AvatarKey
    avatarAssetPath?: string | null
    alt?: string
    size?: "sm" | "md" | "lg" | "xl"
    selected?: boolean
  }>(),
  {
    alt: "",
    avatarAssetPath: null,
    size: "md",
    selected: false,
  },
)

const source = ref(avatarPresetSources[props.avatarKey])
let sourceRequest = 0
const altText = computed(
  () => props.alt || getAvatarPresetLabel(props.avatarKey),
)

watch(
  () => [props.avatarKey, props.avatarAssetPath] as const,
  async ([avatarKey, avatarAssetPath]) => {
    const request = ++sourceRequest
    source.value = avatarPresetSources[avatarKey]
    if (!avatarAssetPath) return

    const { data, error } = await supabase.storage
      .from("player-avatars")
      .createSignedUrl(avatarAssetPath, 60 * 60)

    if (!error && data?.signedUrl && request === sourceRequest) {
      source.value = data.signedUrl
    }
  },
  { immediate: true },
)

const wrapClass = computed(() =>
  cn(
    "relative overflow-hidden rounded-[1.65rem] border border-white/55 bg-white/70 shadow-[0_18px_40px_rgba(58,38,28,0.12)] backdrop-blur-sm transition",
    props.size === "sm" && "size-12 rounded-[1rem]",
    props.size === "md" && "size-16",
    props.size === "lg" && "size-20",
    props.size === "xl" && "size-24 rounded-[1.8rem]",
    props.selected &&
      "border-[rgba(207,123,82,0.42)] bg-white/88 shadow-[0_24px_56px_rgba(120,79,52,0.18)]",
  ),
)
</script>

<template>
  <div :class="wrapClass">
    <img
      :src="source"
      :alt="altText"
      class="size-full object-cover object-top"
      loading="lazy"
      decoding="async"
    />
  </div>
</template>
