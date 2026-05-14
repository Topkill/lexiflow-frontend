<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import { createClozeTask } from '../../api/ai'

const loading = ref(false)
const result = ref(null)
const form = reactive({
  sourceType: 'MIXED',
  regenerate: false,
})

async function submit() {
  loading.value = true
  try {
    result.value = await createClozeTask(form)
    ElMessage.success('完形填空任务已创建')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section>
    <PageHeader title="AI 完形填空" subtitle="基于今日新词和错误复习词生成选词填空" />
    <el-card class="panel-card narrow" shadow="never">
      <el-form label-position="top">
        <el-form-item label="生成来源">
          <el-segmented v-model="form.sourceType" :options="['TODAY_NEW', 'WRONG_REVIEW', 'MIXED']" />
        </el-form-item>
        <el-form-item label="重新生成">
          <el-switch v-model="form.regenerate" />
        </el-form-item>
        <el-button type="primary" :loading="loading" @click="submit">生成练习</el-button>
      </el-form>
      <el-alert v-if="result" class="mt-16" type="success" :closable="false" :title="`任务 ${result.taskId} 已完成，题目 ${result.quizId || '-'}`" />
    </el-card>
  </section>
</template>
