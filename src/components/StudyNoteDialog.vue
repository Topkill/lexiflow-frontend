<script setup>
import { computed, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import MarkdownIt from 'markdown-it'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  initialNote: {
    type: Object,
    default: () => ({}),
  },
  saving: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '保存笔记',
  },
  confirmText: {
    type: String,
    default: '保存',
  },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const form = reactive({
  title: '',
  quotedText: '',
  contentMd: '',
})

const contentPreviewHtml = computed(() => {
  const text = form.contentMd.trim()
  return text ? markdown.render(text) : ''
})

function normalize(value) {
  return String(value || '').trim()
}

function resetForm() {
  form.title = props.initialNote?.title || ''
  form.quotedText = props.initialNote?.quotedText || ''
  form.contentMd = props.initialNote?.contentMd || ''
}

function closeDialog() {
  emit('update:modelValue', false)
}

function submit() {
  const quotedText = normalize(form.quotedText)
  const contentMd = normalize(form.contentMd)
  if (!quotedText && !contentMd) {
    ElMessage.warning('引用内容和笔记正文至少填写一个')
    return
  }
  emit('submit', {
    title: normalize(form.title),
    quotedText,
    contentMd,
  })
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    resetForm()
  }
})

watch(() => props.initialNote, () => {
  if (props.modelValue) {
    resetForm()
  }
}, { deep: true })
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="620px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="study-note-dialog">
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="255" show-word-limit placeholder="给这条笔记起个标题" />
        </el-form-item>
        <el-form-item v-if="form.quotedText" label="引用快照">
          <div class="study-note-quote-preview">{{ form.quotedText }}</div>
        </el-form-item>
        <el-form-item label="我的笔记">
          <el-input
            v-model="form.contentMd"
            type="textarea"
            :rows="7"
            maxlength="5000"
            show-word-limit
            placeholder="可以写复盘、疑问、例句或后续行动"
          />
        </el-form-item>
        <div v-if="contentPreviewHtml" class="study-note-md-preview" v-html="contentPreviewHtml"></div>
      </el-form>
    </div>
    <template #footer>
      <el-button :disabled="saving" @click="closeDialog">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ confirmText }}</el-button>
    </template>
  </el-dialog>
</template>
