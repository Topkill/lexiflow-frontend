<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  icon: {
    type: [Object, Function],
    required: true,
  },
  error: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="starter-panel" :class="{ 'is-error': error }">
    <div class="starter-icon">
      <el-icon><component :is="icon" /></el-icon>
    </div>
    <div class="starter-copy">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="starter-actions">
      <slot />
    </div>
  </div>
</template>
