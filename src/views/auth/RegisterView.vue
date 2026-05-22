<script setup>
import { reactive, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { Lock, Message, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  email: '',
  nickname: '',
  password: '',
})

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
}

async function submit() {
  if (loading.value) return
  loading.value = true
  try {
    await formRef.value.validate()
    await auth.register(form)
    ElMessage.success('注册成功，请登录')
    router.push('/login')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-shell">
      <section class="auth-panel">
        <div class="auth-brand">
          <div class="brand-mark large">L</div>
          <div>
            <h1>LexiFlow</h1>
            <p>AI 辅助背单词工作台</p>
          </div>
        </div>
        <div class="auth-panel-heading">
          <span class="auth-kicker">注册</span>
          <h2>创建学习账号</h2>
          <p>开始你的考试词库学习计划。</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="auth-form" @keyup.enter="submit">
          <el-form-item label="邮箱" prop="email">
            <el-input v-model.trim="form.email" size="large" placeholder="student@example.com">
              <template #prefix><el-icon><Message /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model.trim="form.nickname" size="large" placeholder="你的昵称">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" size="large" type="password" show-password placeholder="包含字母和数字">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" :disabled="loading" class="full-button" @click="submit">注册</el-button>
        </el-form>

        <div class="auth-footer">
          <span>已有账号？</span>
          <RouterLink to="/login">登录</RouterLink>
        </div>
      </section>
    </section>
  </main>
</template>
