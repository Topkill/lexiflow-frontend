<template>
  <main class="not-found-page">
    <el-result icon="warning" title="页面不存在" sub-title="当前地址没有匹配的 LexiFlow 页面">
      <template #extra>
        <el-button type="primary" @click="$router.push('/app')">返回首页</el-button>
      </template>
    </el-result>
  </main>
</template>
