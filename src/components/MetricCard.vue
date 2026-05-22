<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '-' },
  suffix: { type: String, default: '' },
  tone: { type: String, default: 'default' },
  visual: { type: String, default: '' },
})
</script>

<template>
  <div class="metric-card" :class="`metric-${tone}`">
    <div class="metric-label">{{ label }}</div>
    <div class="metric-value">{{ value }}<span>{{ suffix }}</span></div>
    <svg v-if="visual" class="metric-illustration" viewBox="0 0 96 96" aria-hidden="true">
      <g v-if="visual === 'words'">
        <path d="M24 28h32c8 0 16 5 16 13v29c0 3-2 5-5 5H34c-8 0-14-6-14-14V32c0-2 2-4 4-4z" />
        <path d="M30 38h28M30 50h24M30 62h20" />
        <path d="M72 42c-5-3-10-4-16-4v37" />
      </g>
      <g v-else-if="visual === 'review'">
        <path d="M27 34a27 27 0 0 1 42 2" />
        <path d="M69 21v15H54" />
        <path d="M69 62a27 27 0 0 1-42-2" />
        <path d="M27 75V60h15" />
        <path d="M38 48h20" />
      </g>
      <g v-else-if="visual === 'done'">
        <rect x="24" y="22" width="48" height="56" rx="11" />
        <path d="M36 39h24M36 56h13" />
        <path d="M45 66l7 7 14-18" />
      </g>
      <g v-else-if="visual === 'streak'">
        <path d="M49 18c12 12 22 24 22 39 0 15-10 25-23 25S25 72 25 58c0-10 5-18 13-26-1 9 2 14 8 18 7-8 8-20 3-32z" />
        <path d="M46 62c-4 5-3 12 3 14 7-2 9-9 4-17" />
      </g>
    </svg>
  </div>
</template>
