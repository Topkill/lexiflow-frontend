<template>
  <section>
    <PageHeader title="单词管理" subtitle="按词库维护单词释义、例句和顺序" />
    <el-card class="panel-card" shadow="never">
      <el-alert title="第一版先从词库管理进入具体词库单词列表，后续补全独立检索和编辑表单。" type="info" :closable="false" />
    </el-card>
  </section>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
</script>
