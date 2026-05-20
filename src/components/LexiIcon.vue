<script setup>
defineProps({
  name: {
    type: String,
    required: true,
  },
})
</script>

<template>
  <svg class="lexi-icon" viewBox="0 0 24 24" aria-hidden="true">
    <g v-if="name === 'home'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="m4 10.5 8-6.5 8 6.5" />
      <path d="M6.5 9.5V20h11V9.5" />
      <path d="M10 20v-5h4v5" />
    </g>
    <g v-else-if="name === 'book'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5Z" />
      <path d="M8 8h6.5" />
      <path d="M8 11h5" />
      <path d="M8.5 19.5A3.5 3.5 0 0 1 5 16" />
    </g>
    <g v-else-if="name === 'calendar'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M6 5.5h12A2.5 2.5 0 0 1 20.5 8v9.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5V8A2.5 2.5 0 0 1 6 5.5Z" />
      <path d="M7.5 3.5v4" />
      <path d="M16.5 3.5v4" />
      <path d="M3.5 9.5h17" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
    </g>
    <g v-else-if="name === 'study'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M4.5 5.5h6A3.5 3.5 0 0 1 14 9v10.5H7.5A3.5 3.5 0 0 1 4 16V6a.5.5 0 0 1 .5-.5Z" />
      <path d="M14 9a3.5 3.5 0 0 1 3.5-3.5h2a.5.5 0 0 1 .5.5v10a3.5 3.5 0 0 1-3.5 3.5H14" />
      <path d="M8 9h2.5" />
      <path d="M8 12h2.5" />
    </g>
    <g v-else-if="name === 'review'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M6.5 8.5A7 7 0 1 1 5.9 16" />
      <path d="M6.5 4.5v4h4" />
      <path d="m9.5 12 2 2 4-4" />
    </g>
    <g v-else-if="name === 'cloze'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M6 4.5h12A2.5 2.5 0 0 1 20.5 7v10A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7A2.5 2.5 0 0 1 6 4.5Z" />
      <path d="M7.5 9h9" />
      <path d="M7.5 13h3" />
      <path d="M13.5 13h3" />
      <path d="M7.5 16.5h6" />
    </g>
    <g v-else-if="name === 'report'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M6.5 3.5h8l4 4v13h-12z" />
      <path d="M14.5 3.5v4h4" />
      <path d="M9 11h6" />
      <path d="M9 14.5h6" />
      <path d="M9 18h3.5" />
    </g>
    <g v-else-if="name === 'warning'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="m12 4 9 16H3z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    </g>
    <g v-else-if="name === 'star'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="m12 3.5 2.55 5.17 5.7.83-4.13 4.03.97 5.68L12 16.52l-5.1 2.69.98-5.68L3.75 9.5l5.7-.83z" />
    </g>
    <g v-else-if="name === 'chart'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M4.5 19.5h15" />
      <path d="M7 16v-5" />
      <path d="M12 16V7" />
      <path d="M17 16v-8" />
    </g>
    <g v-else-if="name === 'settings'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.2 13.4a7.7 7.7 0 0 0 0-2.8l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2.4-1.4L14 2.8h-4l-.4 2.5a7.5 7.5 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2.8l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2.4 1.4l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.4-1.4l2.4 1 2-3.4z" />
    </g>
    <g v-else-if="name === 'ai'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M8 7.5h8A3.5 3.5 0 0 1 19.5 11v2A3.5 3.5 0 0 1 16 16.5H8A3.5 3.5 0 0 1 4.5 13v-2A3.5 3.5 0 0 1 8 7.5Z" />
      <path d="M8.5 11.5h.01" />
      <path d="M15.5 11.5h.01" />
      <path d="M12 3.5v4" />
      <path d="M9 20.5h6" />
      <path d="M12 16.5v4" />
    </g>
    <path v-else-if="name === 'star-filled'" fill="currentColor" d="m12 3.5 2.55 5.17 5.7.83-4.13 4.03.97 5.68L12 16.52l-5.1 2.69.98-5.68L3.75 9.5l5.7-.83z" />
    <g v-else fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 8v4l2.5 2.5" />
    </g>
  </svg>
</template>
