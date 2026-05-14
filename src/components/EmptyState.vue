<script setup>
defineProps({
  title: { type: String, default: '暂无数据' },
  description: { type: String, default: '' },
})
</script>

<template>
  <el-empty :description="title">
    <p v-if="description" class="empty-description">{{ description }}</p>
    <slot />
  </el-empty>
</template>
