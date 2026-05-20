<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import { fetchUserAiConfig, saveUserAiConfig } from '../../api/user'

const loading = ref(false)
const saving = ref(false)
const form = reactive({ apiBaseUrl: '', apiKey: '', modelName: '', temperature: 0.7, streamEnabled: false, enabled: true })
const configured = ref(false)

async function loadConfig() {
  loading.value = true
  try {
    const data = await fetchUserAiConfig()
    configured.value = data.configured
    Object.assign(form, { apiBaseUrl: data.apiBaseUrl || '', modelName: data.modelName || '', temperature: data.temperature || 0.7, streamEnabled: data.streamEnabled ?? false, enabled: data.enabled ?? true })
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await saveUserAiConfig(form)
    form.apiKey = ''
    configured.value = true
    ElMessage.success('私有 AI 配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <section>
    <PageHeader title="AI 私有配置" subtitle="配置自己的 OpenAI 兼容接口，不占用公共配额" />
    <el-card class="panel-card narrow" shadow="never" v-loading="loading">
      <el-alert v-if="configured" title="已配置私有 API Key，前端不会回显密钥" type="success" :closable="false" class="mb-16" />
      <el-form label-position="top">
        <el-form-item label="API Base URL"><el-input v-model="form.apiBaseUrl" placeholder="https://api.openai.com/v1" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="form.apiKey" type="password" show-password placeholder="保存时加密写入后端" /></el-form-item>
        <el-form-item label="模型名称"><el-input v-model="form.modelName" placeholder="gpt-4.1-mini" /></el-form-item>
        <el-form-item label="温度"><el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" /></el-form-item>
        <el-form-item label="流式输出">
          <el-switch
            v-model="form.streamEnabled"
            active-text="流式"
            inactive-text="非流式"
            inline-prompt
          />
        </el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
        <el-button type="primary" :loading="saving" :disabled="saving" @click="save">保存配置</el-button>
      </el-form>
    </el-card>
  </section>
</template>
