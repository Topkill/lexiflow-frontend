<template>
  <section>
    <PageHeader title="Excel 导入" subtitle="下载模板、上传词库单词并查看错误报告" />
    <el-card class="panel-card narrow" shadow="never">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="模板下载">GET /api/v1/admin/imports/word-template</el-descriptions-item>
        <el-descriptions-item label="上传导入">POST /api/v1/admin/wordbooks/{wordbookId}/imports</el-descriptions-item>
        <el-descriptions-item label="错误报告">GET /api/v1/admin/imports/{importTaskId}/error-report</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </section>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
</script>
