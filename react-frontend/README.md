# 三万卷前端

三万卷的 React 前端，使用 React 19、TypeScript、Vite 和 EPUB.js 构建。

## 启动

```bash
npm ci
npm run dev
```

默认访问地址：

```text
http://localhost:5173/
```

## 后端接口配置

编辑：

```text
public/变量配置.js
```

将 `API_BASE_URL` 设置为 Flask 后端地址。默认值为：

```javascript
window.__APP_CONFIG__ = {
  API_BASE_URL: 'http://127.0.0.1:5001/api'
};
```

## 构建

```bash
npm run lint
npm run build
```

完整的安装、配置和项目说明请阅读根目录的 [`README.md`](../README.md)。
