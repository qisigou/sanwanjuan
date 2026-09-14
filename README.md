# 人生三万卷

基于 Flask、SQLite 和 React 的个人图书管理系统，支持 EPUB、PDF 图书的入库、检索、分页浏览、信息维护和在线阅读。

项目仓库只包含程序源代码和小规模测试数据，不包含真实电子书文件或个人图书数据库。

## 功能

- EPUB、PDF 文件上传与元数据采集
- 按书名搜索和按 ID 查询
- 图书信息分页浏览、编辑与软删除
- 中图法分类浏览和学科统计
- EPUB 在线阅读
- OPDS 电子书目录与下载接口
- SQLite 只读 SQL 查询与分页展示

## 技术栈

- 后端：Python 3.9 及以上、Flask、Flask-CORS、SQLite
- 前端：React 19、TypeScript、Vite、Axios、EPUB.js

## 目录结构

```text
.
├── flask/                         Flask 后端
│   ├── api/                       API 接口
│   ├── app.py                     应用入口
│   ├── requirements.txt           Python 依赖
│   ├── 配置.example.json          本地配置模板
│   └── 元数据.测试.db             小型测试数据库
├── react-frontend/                React 前端
│   ├── src/                       页面、组件和类型定义
│   └── package.json               前端依赖与脚本
├── AGENTS.md                      AI 编程规范
└── README.md
```

`存档/`、`flask/元数据.db`、`flask/venv/`、`react-frontend/node_modules/` 和 `react-frontend/dist/` 均为本地内容，不提交到 Git。

## 测试数据库

`flask/元数据.测试.db` 用于开发和自动化测试，包含：

- `中图法_v5`：16855 条中图法分类数据
- `研究生教育学科专业目录_2022`：194 条学科专业数据
- `各表字段详解`：10 条字段说明
- `书籍`：100 条 EPUB 和 100 条 PDF 测试记录，共 200 条

测试记录中的文件哈希、文件名和存储位置均为虚构值，可以安全用于分页、筛选、分类统计和接口测试。测试数据库不包含实际图书文件。

## 后端启动

```bash
cd flask
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp 配置.example.json 配置.json
python app.py
```

默认接口地址为：

```text
http://127.0.0.1:5001/api
```

`配置.example.json` 默认使用 `元数据.测试.db`。使用个人图书库时，将 `数据库文件` 改为 `元数据.db`，并修改临时目录、电子书目录和封面目录。

## 前端启动

```bash
cd react-frontend
npm ci
npm run dev
```

默认访问地址：

```text
http://localhost:5173/
```

前端 API 地址配置位于：

```text
react-frontend/public/变量配置.js
```

## 构建与检查

```bash
cd react-frontend
npm run lint
npm run build
```

## 数据说明

测试数据库中的书名、作者、出版社和 ISBN 等字段属于基础书目信息，不含图书正文。请不要向仓库提交受版权保护的 EPUB、PDF、完整个人书目数据库、封面文件或包含个人路径的配置。

## 安全说明

当前项目主要用于本机运行。公开部署前应关闭 Flask 排障模式，限制 CORS 来源，并为上传、修改、导入和删除接口增加身份认证与权限控制。

## 许可证

本项目采用最宽松的 MIT License，详见 `LICENSE`。
