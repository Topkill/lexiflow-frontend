<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PageHeader from '../../components/PageHeader.vue'
import { fetchProfile, fetchUserSettings, updateProfile, updateUserSettings } from '../../api/user'

const loading = ref(false)
const saving = ref(false)
const profile = reactive({ nickname: '', avatarUrl: '' })
const settings = reactive({ targetExam: 'CET4', dailyNewWords: 30, aiKeyMode: 'PUBLIC', enableDailyReport: true, timezone: 'Asia/Shanghai' })

async function loadData() {
  loading.value = true
  try {
    const [profileData, settingsData] = await Promise.all([fetchProfile(), fetchUserSettings()])
    Object.assign(profile, profileData)
    Object.assign(settings, settingsData)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await Promise.all([updateProfile(profile), updateUserSettings(settings)])
    ElMessage.success('设置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="个人设置" subtitle="资料、学习偏好和 AI Key 使用方式" />
    <el-card class="panel-card narrow" shadow="never" v-loading="loading">
      <el-form label-position="top">
        <el-form-item label="昵称"><el-input v-model="profile.nickname" /></el-form-item>
        <el-form-item label="头像 URL"><el-input v-model="profile.avatarUrl" /></el-form-item>
        <el-form-item label="目标考试">
          <el-select v-model="settings.targetExam" class="full-input">
            <el-option label="CET4" value="CET4" />
            <el-option label="CET6" value="CET6" />
            <el-option label="考研英语" value="POSTGRADUATE" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认每日新词"><el-input-number v-model="settings.dailyNewWords" :min="1" :max="300" /></el-form-item>
        <el-form-item label="AI Key 模式">
          <el-segmented v-model="settings.aiKeyMode" :options="['PUBLIC', 'PRIVATE']" />
        </el-form-item>
        <el-form-item label="日报入口"><el-switch v-model="settings.enableDailyReport" /></el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </el-form>
    </el-card>
  </section>
</template>
