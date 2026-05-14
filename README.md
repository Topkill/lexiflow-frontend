# LexiFlow Frontend

LexiFlow 前端采用 Vue3 + Vite + Element Plus，覆盖用户端背单词工作台和管理员后台基础页面。

## 技术栈

- Vue3
- Vue Router
- Pinia
- Axios
- Element Plus
- Vite

## 本地启动

```powershell
npm install
npm run dev
```

默认开发地址：`http://127.0.0.1:5173`。

开发环境已配置 `/api` 代理到后端 `http://localhost:8080`。

## 当前页面

- 登录、注册
- 用户端：今日任务、词库、学习计划、学习卡片、复习、完形填空、报告、错词、收藏、统计、设置、私有 AI 配置
- 管理端：数据看板、用户管理、词库管理、单词管理、Excel 导入、AI 配置、AI 日志、系统配置
