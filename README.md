# 三万卷

三万卷是一个基于 Flask、SQLite 和 React 搭建的单机个人图书管理与阅读网站，支持 EPUB、PDF 文件的入库、检索、分类浏览、信息维护和在线阅读。

项目定位为个人自助使用，不面向公网部署。仓库只包含程序源代码和小规模测试数据，不包含真实电子书文件、个人图书数据库或封面文件。

## 功能

- EPUB、PDF 文件上传、MD5 去重与自动归档
- 扫描临时文件夹并批量入库
- 按书名、作者或图书 ID 检索
- 图书信息分页浏览、编辑和软删除
- 中图法分类浏览与学科统计
- EPUB 在线阅读
- PDF 阅读页与可折叠 AI 图书录入助手
- 从 CIP、书名页、版权页和封底截图提取书目信息，生成中图法与 AI 初评
- OPDS 电子书目录、检索与下载接口
- SQLite 只读 SQL 查询与分页展示

## 技术栈

| 层次 | 主要技术 |
| --- | --- |
| 后端 | Python 3.9 及以上、Flask、Flask-CORS、SQLite |
| 前端 | React 19、TypeScript、Vite、Axios、TanStack Query、EPUB.js |

## 运行环境

- Python 3.9 及以上
- Node.js 20.19 及以上，或 22.12 及以上
- npm
- SQLite 由 Python 标准库提供，无需单独安装

## 目录结构

```text
.
├── flask/                         Flask 后端
│   ├── api/                       API 接口
│   ├── 提示词/                    图书提取与分类评估提示词
│   ├── app.py                     应用入口
│   ├── requirements.txt           Python 依赖
│   ├── 配置.example.json          本地配置模板
│   └── 元数据.测试.db             小型测试数据库
├── react-frontend/                React 前端
│   ├── public/变量配置.js         前端运行配置
│   └── src/                       页面、组件和类型定义
├── AGENTS.md                      AI 编程规范
├── LICENSE                        MIT 许可证
└── README.md
```

以下内容属于本地数据或生成物，不提交到 Git：

- `存档/`
- `flask/元数据.db`
- `flask/配置.json`
- `flask/venv/`
- `react-frontend/node_modules/`
- `react-frontend/dist/`

## 快速开始

建议先启动后端，再启动前端。

### 1. 启动后端

```bash
cd flask
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp 配置.example.json 配置.json
python app.py
```

默认后端地址：

```text
http://127.0.0.1:5001/api
```

`配置.example.json` 默认连接 `元数据.测试.db`，可以直接用于查看页面、测试分页和验证接口。

### 2. 启动前端

另开一个终端：

```bash
cd react-frontend
npm ci
npm run dev
```

默认前端地址：

```text
http://localhost:5173/
```

## 使用个人图书库

将个人数据库放到后端目录，例如：

```text
flask/元数据.db
```

然后在 `flask/配置.json` 中仅修改数据库文件：

```text
"数据库文件": "元数据.db"
```

不要用上面的片段替换整个配置文件，同时按实际情况修改以下配置项：

| 配置项 | 作用 |
| --- | --- |
| `资源.数据库文件` | SQLite 数据库文件名，相对于 `flask/` 目录 |
| `资源.临时文件夹` | 上传文件的临时保存目录 |
| `资源.图书资源.类型存储位置.EPUB` | EPUB 文件存储根目录 |
| `资源.图书资源.类型存储位置.PDF` | PDF 文件存储根目录 |
| `资源.图书资源.封面存储位置` | 封面文件存储目录 |
| `服务器.地址` | Flask 监听地址 |
| `服务器.端口` | Flask 监听端口 |
| `服务器.排障` | 是否启用 Flask 调试模式 |
| `大语言模型.接口地址` | OpenAI 兼容的基础地址或完整 `chat/completions` 地址 |
| `大语言模型.模型` | 支持图片输入的模型名称 |
| `大语言模型.API密钥` | 本地直接填写密钥，不建议提交到 Git |
| `大语言模型.API密钥环境变量` | 从环境变量读取密钥，默认 `AI_API_KEY` |
| `大语言模型.最大图片数量` | 单次提取允许提交的图片数量 |
| `大语言模型.最大单图字节` | 单张图片压缩后的字节上限 |
| `大语言模型.最大请求字节` | 图片提取请求的总大小上限 |
| `大语言模型.响应格式` | 默认 `json_object`，不兼容时可留空 |
| `大语言模型.最大输出token数` | 模型单次响应的最大输出 token 数 |
| `大语言模型.思考模式` | `disabled` 直接输出 JSON，`enabled` 启用思考模式 |
| `大语言模型.思考强度` | 思考模式启用时使用 `low`、`high` 或 `max` |

单机使用时建议保持以下设置：

```text
"地址": "127.0.0.1"
"排障": false
```

## 电子书存储规则

EPUB 和 PDF 使用独立的存储目录。程序在入库时计算文件 MD5，并根据 MD5 检查重复文件。

### EPUB

EPUB 文件按 MD5 前两位分片存储：

```text
EPUB 根目录/
└── 12万/
    ├── 00/
    │   └── <md5>.epub
    ├── 01/
    │   └── <md5>.epub
    └── ... 共 256 个子目录
```

文件原扩展名会统一为 `.epub`，文件名改为完整的 MD5 值。

### PDF

PDF 文件保留原始文件名，按入库顺序分配编号目录：

```text
PDF 根目录/
├── 10000/
│   └── 原始文件名.pdf
├── 10001/
│   └── 原始文件名.pdf
└── ...
```

编号从 `10000` 开始，每个目录最多保存 200 个文件；目录达到容量后自动使用下一个编号。若同名文件已经存在，程序会添加数字序号，避免覆盖。

## 测试数据库

`flask/元数据.测试.db` 用于开发和自动化测试，包含：

| 表 | 记录数 |
| --- | ---: |
| `中图法_v5` | 16855 |
| `研究生教育学科专业目录_2022` | 194 |
| `各表字段详解` | 10 |
| `书籍` | 200，其中 EPUB 100、PDF 100 |

测试记录保留了书名、作者、出版社、ISBN、中图法和文件格式等基础字段。文件哈希、文件名和存储位置均为虚构值，不包含实际图书文件，可用于分页、筛选、分类统计和接口测试。

## 前后端分离配置

前端通过以下文件读取后端接口地址：

```text
react-frontend/public/变量配置.js
```

本地运行默认配置：

```javascript
window.__APP_CONFIG__ = {
  API_BASE_URL: 'http://127.0.0.1:5001/api'
};
```

如果前后端运行在局域网内的不同设备上，需要：

1. 将后端配置中的 `服务器.地址` 改为 `0.0.0.0`。
2. 将 `API_BASE_URL` 改为运行后端设备的局域网地址，例如 `http://192.168.1.10:5001/api`。
3. 确认系统防火墙允许访问后端端口。

该项目未实现身份认证和访问控制，不建议通过公网地址暴露服务。

## 大语言模型配置

后端使用 OpenAI 兼容的 `chat/completions` 接口，模型必须支持图片输入。DeepSeek 的 `deepseek-flash` 已支持图片输入。推荐通过环境变量保存密钥：

```bash
export AI_API_KEY="你的 API 密钥"
```

在 `flask/配置.json` 中设置接口地址和模型名称。接口地址可以填写基础地址，也可以填写完整的 `chat/completions` 地址：

```json
"大语言模型": {
  "接口地址": "https://api.deepseek.com",
  "模型": "deepseek-flash",
  "API密钥": "",
  "API密钥环境变量": "AI_API_KEY",
  "最大输出token数": 4096,
  "思考模式": "disabled",
  "思考强度": "low"
}
```

也可以直接填写 `大语言模型.API密钥`，但不要将该配置提交到 Git。`deepseek-flash` 默认启用思考模式，图书字段提取和初评建议保持 `思考模式` 为 `disabled`，避免推理内容耗尽输出预算。模型未配置时，阅读页仍可正常使用，只是 AI 接口会返回配置提示。

AI 录入遵循两步确认流程：

1. 截取 CIP、书名页、版权页或封底，提取书名、包含译者的责任者、出版社、CIP 分类号和主题词等字段。
2. 用户核对基础字段后，再生成中图法、标签、AI 评分和 AI 评估。

中图法如果来自版权页 CIP 数据，会标记为原文提取；其余情况标记为 AI 推断。AI 评分使用 1 至 5 分，并保存到 `书籍.ai评分`，评估文字保存到 `书籍.ai评估`。

## 主要接口

所有接口均以 `/api` 为前缀。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/books` | GET | 分页获取图书，支持按 ID 查询 |
| `/books/<id>` | PUT | 修改图书信息，可同时写入 AI 评分与评估 |
| `/upload` | POST | 上传并立即入库 PDF、EPUB |
| `/import-temp` | POST | 扫描临时目录并批量入库 |
| `/search-name` | GET | 按书名搜索 |
| `/search-all` | GET | 按书名或作者搜索 |
| `/search-id` | GET | 按 ID 获取或下载图书文件 |
| `/ztf/children` | GET | 获取中图法下级分类 |
| `/ztf/books` | GET | 按中图法分类查询图书 |
| `/subject-stats` | GET | 获取学科统计 |
| `/query` | POST | 执行只读 SQL 查询 |
| `/delete` | POST | 将图书记录标记为缺失 |
| `/ai/status` | GET | 查询大语言模型配置状态 |
| `/ai/books/<id>/extract` | POST | 从截图提取书目信息 |
| `/ai/books/<id>/evaluate` | POST | 生成中图法、标签与 AI 初评 |
| `/opds/` | GET | OPDS 目录入口 |

## 构建与检查

前端静态检查和生产构建：

```bash
cd react-frontend
npm run lint
npm run build
```

后端当前未配置自动化测试，开发时可以使用 `flask/元数据.测试.db` 验证接口和数据库操作。

## 数据说明

测试数据库中的书名、作者、出版社和 ISBN 等字段属于基础书目信息，不包含图书正文。请勿向仓库提交受版权保护的 EPUB、PDF、完整个人书目数据库、封面文件或包含个人路径的配置。

## 安全说明

本项目按单机个人使用设计，当前未实现登录认证、权限隔离、CSRF 防护和 HTTPS。请勿直接部署到公网；如果确需在局域网使用，应限制可信设备访问，并保持 Flask 调试模式关闭。

## 许可证

本项目采用最宽松的 MIT License，详见 `LICENSE`。
