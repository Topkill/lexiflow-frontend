<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '-' },
  suffix: { type: String, default: '' },
  tone: { type: String, default: 'default' },
})
</script>

<template>
  <div class="metric-card" :class="`metric-${tone}`">
    <div class="metric-label">{{ label }}</div>
    <div class="metric-value">{{ value }}<span>{{ suffix }}</span></div>
  </div>
</template>
