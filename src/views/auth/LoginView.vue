<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Lock, Message, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth'
import { SESSION_EXPIRED_REASON } from '../../utils/sessionEvents'

const LOGIN_CAPTCHA_REQUIRED = 11004
const LOGIN_CAPTCHA_INVALID = 11005

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const formRef = ref()
const loading = ref(false)
const captchaLoading = ref(false)
const captchaVisible = ref(false)
const captchaImage = ref('')

const form = reactive({
  email: '',
  password: '',
  captchaId: '',
  captchaCode: '',
})
const sessionExpired = computed(() => route.query.reason === SESSION_EXPIRED_REASON)
const captchaErrorCodes = new Set([LOGIN_CAPTCHA_REQUIRED, LOGIN_CAPTCHA_INVALID])

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captchaCode: [
    {
      validator: (rule, value, callback) => {
        if (!captchaVisible.value) {
          callback()
          return
        }
        if (!value) {
          callback(new Error('请输入验证码'))
          return
        }
        if (!/^\d{4}$/.test(value)) {
          callback(new Error('请输入 4 位数字验证码'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function errorMessage(error) {
  return error?.response?.data?.message || error?.message || '登录失败'
}

async function loadCaptcha() {
  if (captchaLoading.value) return
  captchaLoading.value = true
  try {
    const captcha = await auth.fetchLoginCaptcha({ silentError: true })
    form.captchaId = captcha.captchaId
    form.captchaCode = ''
    captchaImage.value = captcha.imageDataUrl
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    captchaLoading.value = false
  }
}

async function showCaptcha() {
  captchaVisible.value = true
  await loadCaptcha()
}

async function submit() {
  if (loading.value) return
  loading.value = true
  try {
    await formRef.value.validate()
  } catch {
    loading.value = false
    return
  }
  try {
    await auth.login({ ...form }, { silentError: true })
    ElMessage.success('登录成功')
    router.push(route.query.redirect || (auth.isAdmin ? '/admin' : '/app'))
  } catch (error) {
    if (captchaErrorCodes.has(error?.code)) {
      await showCaptcha()
      ElMessage.warning(errorMessage(error))
      return
    }
    ElMessage.error(errorMessage(error))
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
          <span class="auth-kicker">登录</span>
          <h2>回到学习台</h2>
          <p>输入账号后继续你的单词学习。</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="auth-form" @keyup.enter="submit">
          <el-alert
            v-if="sessionExpired"
            title="登录状态已失效，请重新登录"
            type="warning"
            show-icon
            :closable="false"
          />
          <el-form-item label="邮箱" prop="email">
            <el-input v-model.trim="form.email" size="large" placeholder="student@example.com">
              <template #prefix><el-icon><Message /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" size="large" type="password" show-password placeholder="至少 8 位">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item v-if="captchaVisible" label="验证码" prop="captchaCode">
            <div class="captcha-row">
              <el-input
                v-model.trim="form.captchaCode"
                size="large"
                maxlength="4"
                inputmode="numeric"
                placeholder="4 位数字"
              />
              <button class="captcha-image-button" type="button" :disabled="captchaLoading" @click="loadCaptcha">
                <img v-if="captchaImage" :src="captchaImage" alt="验证码">
              </button>
              <el-button
                :icon="Refresh"
                :loading="captchaLoading"
                :disabled="captchaLoading"
                size="large"
                title="刷新验证码"
                aria-label="刷新验证码"
                @click="loadCaptcha"
              />
            </div>
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" :disabled="loading" class="full-button" @click="submit">登录</el-button>
        </el-form>

        <div class="auth-footer">
          <span>还没有账号？</span>
          <RouterLink to="/register">注册</RouterLink>
        </div>
      </section>
    </section>
  </main>
</template>
