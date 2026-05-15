<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import { useAuthStore } from '../../stores/auth'
import { changePassword, fetchProfile, fetchUserSettings, updateProfile, updateUserSettings } from '../../api/user'

const auth = useAuthStore()
const loading = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)
const profileFormRef = ref()
const passwordFormRef = ref()

const profileForm = reactive({ nickname: '', avatarUrl: '', targetExam: null, dailyNewWords: 30, aiKeyMode: 'PUBLIC', enableDailyReport: true, timezone: 'Asia/Shanghai' })
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const profileRules = {
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 1, max: 64, message: '昵称长度不能超过 64 个字符', trigger: 'blur' },
  ],
  avatarUrl: [{ max: 512, message: '头像地址不能超过 512 个字符', trigger: 'blur' }],
  dailyNewWords: [{ required: true, message: '请输入默认每日新词数', trigger: 'change' }],
  aiKeyMode: [{ required: true, message: '请选择 AI Key 模式', trigger: 'change' }],
}

const passwordRules = {
  oldPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
    { max: 64, message: '密码长度不能超过 64 位', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 64, message: '新密码长度需要为 8-64 位', trigger: 'blur' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '新密码必须包含字母和数字', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的新密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

async function loadData() {
  loading.value = true
  try {
    const [profileData, settingsData] = await Promise.all([fetchProfile(), fetchUserSettings()])
    Object.assign(profileForm, {
      nickname: profileData.nickname || '',
      avatarUrl: profileData.avatarUrl || '',
      targetExam: settingsData.targetExam || null,
      dailyNewWords: settingsData.dailyNewWords || 30,
      aiKeyMode: settingsData.aiKeyMode || 'PUBLIC',
      enableDailyReport: settingsData.enableDailyReport ?? true,
      timezone: settingsData.timezone || 'Asia/Shanghai',
    })
  } finally {
    loading.value = false
  }
}

async function saveProfileAndSettings() {
  await profileFormRef.value.validate()
  savingProfile.value = true
  try {
    const [savedProfile, savedSettings] = await Promise.all([
      updateProfile({ nickname: profileForm.nickname, avatarUrl: profileForm.avatarUrl }),
      updateUserSettings({
        targetExam: profileForm.targetExam,
        dailyNewWords: profileForm.dailyNewWords,
        aiKeyMode: profileForm.aiKeyMode,
        enableDailyReport: profileForm.enableDailyReport,
        timezone: profileForm.timezone,
      }),
    ])
    Object.assign(profileForm, {
      nickname: savedProfile.nickname || '',
      avatarUrl: savedProfile.avatarUrl || '',
      targetExam: savedSettings.targetExam || null,
      dailyNewWords: savedSettings.dailyNewWords || 30,
      aiKeyMode: savedSettings.aiKeyMode || 'PUBLIC',
      enableDailyReport: savedSettings.enableDailyReport ?? true,
      timezone: savedSettings.timezone || 'Asia/Shanghai',
    })
    auth.setUser(savedProfile)
    ElMessage.success('个人设置已保存')
  } finally {
    savingProfile.value = false
  }
}

async function submitPassword() {
  await passwordFormRef.value.validate()
  savingPassword.value = true
  try {
    await changePassword({ oldPassword: passwordForm.oldPassword, newPassword: passwordForm.newPassword })
    Object.assign(passwordForm, { oldPassword: '', newPassword: '', confirmPassword: '' })
    await nextTick()
    passwordFormRef.value?.clearValidate()
    ElMessage.success('密码已更新')
  } finally {
    savingPassword.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="个人设置" subtitle="管理资料、学习偏好和账号安全" />

    <div class="work-grid">
      <el-card class="panel-card" shadow="never" v-loading="loading">
        <template #header>
          <div class="card-header-row">
            <span>资料与偏好</span>
            <el-icon><User /></el-icon>
          </div>
        </template>
        <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-position="top">
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model.trim="profileForm.nickname" maxlength="64" show-word-limit />
          </el-form-item>
          <el-form-item label="头像 URL" prop="avatarUrl">
            <el-input v-model.trim="profileForm.avatarUrl" maxlength="512" placeholder="https://example.com/avatar.png" />
          </el-form-item>
          <el-form-item label="目标考试" prop="targetExam">
            <el-select v-model="profileForm.targetExam" clearable class="full-input" placeholder="选择目标考试">
              <el-option label="CET4" value="CET4" />
              <el-option label="CET6" value="CET6" />
              <el-option label="考研英语" value="POSTGRADUATE" />
            </el-select>
          </el-form-item>
          <el-form-item label="默认每日新词" prop="dailyNewWords">
            <el-input-number v-model="profileForm.dailyNewWords" :min="1" :max="300" />
          </el-form-item>
          <el-form-item label="AI Key 模式" prop="aiKeyMode">
            <el-segmented
              v-model="profileForm.aiKeyMode"
              :options="[
                { label: '公共配置', value: 'PUBLIC' },
                { label: '私有配置', value: 'PRIVATE' },
              ]"
            />
          </el-form-item>
          <el-form-item label="日报入口" prop="enableDailyReport">
            <el-switch v-model="profileForm.enableDailyReport" />
          </el-form-item>
          <el-button type="primary" :loading="savingProfile" @click="saveProfileAndSettings">保存设置</el-button>
        </el-form>
      </el-card>

      <el-card class="panel-card" shadow="never">
        <template #header>
          <div class="card-header-row">
            <span>账号安全</span>
            <el-icon><Lock /></el-icon>
          </div>
        </template>
        <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-position="top">
          <el-form-item label="当前密码" prop="oldPassword">
            <el-input v-model="passwordForm.oldPassword" type="password" show-password autocomplete="current-password" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" placeholder="至少 8 位，包含字母和数字" />
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
          </el-form-item>
          <el-button type="primary" plain :loading="savingPassword" @click="submitPassword">更新密码</el-button>
        </el-form>
      </el-card>
    </div>
  </section>
</template>
