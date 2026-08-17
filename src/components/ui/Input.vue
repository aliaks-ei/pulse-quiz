<script setup lang="ts">
import { computed, useId } from "vue"

import { cn } from "@/lib/utils"

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    id?: string
    placeholder?: string
    type?: string
    tone?: "default" | "warm"
  }>(),
  {
    id: undefined,
    placeholder: "",
    type: "text",
    tone: "default",
  },
)

const inputId = computed(() => props.id ?? useId())

const classes = computed(() =>
  cn(
    "flex h-12 w-full rounded-[1.1rem] border px-4 text-[0.96rem] outline-none transition focus:ring-2 focus:ring-primary/12",
    props.tone === "warm"
      ? "border-warm-border-strong bg-white/96 text-foreground placeholder:text-[color:var(--text-subtle)] focus:border-primary focus:bg-white"
      : "border-warm-border-strong bg-white/94 text-foreground placeholder:text-[color:var(--text-subtle)] focus:border-primary/45 focus:bg-white",
  ),
)
</script>

<template>
  <input
    :id="inputId"
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :class="classes"
  />
</template>
