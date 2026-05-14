<template>
  <section>
    <PageHeader title="公共 AI 配置" subtitle="维护 OpenAI 兼容接口、模型和公共配额" />
    <el-card class="panel-card" shadow="never">
      <el-alert title="后端公共 AI 配置接口已完成，下一轮补列表、编辑、激活和停用表单。" type="info" :closable="false" />
    </el-card>
  </section>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
</script>
