# 朝暮 · Zhaomu

一个只属于两个人的私密小站：时间轴、相册、心事信箱、愿望清单、两地天气、纪念日和见面倒计时。

前端 **React + Vite + TypeScript**，后端 **Cloudflare Workers + Hono + D1 + R2**。照片和语音存在私有 R2 桶里，只能通过带登录会话的 `/media/:id` 读取。

> 这个仓库只包含源代码和通用演示数据，不包含任何真实用户记录、照片、语音或 Cloudflare 凭据。

## 功能

- **时间轴**：记录文字、心情、照片、语音；支持「仅自己可见」
- **相册**：照片上传、预览、原图下载、独立照片删除
- **心事信箱**：23:00 定时解锁，支持文字和语音；未解锁时服务端不返回正文
- **愿望清单**：新增、编辑、完成、撤回、删除；完成时自动生成一条时间轴回忆
- **两地天气**：Open-Meteo 实时天气，按经纬度计算直线距离
- **纪念日**：在一起的日子、两个生日、自定义纪念日
- **首页**：每日轮换的短句、倒计时、纪念日横滑卡片
- **戳一下**：每天最多 5 次，对方下次打开首页能看到未读
- **设置**：城市、纪念日、主题色、深色模式、照片原图策略、数据导出

## 技术栈

- React 18 + TypeScript + Vite 6
- React Router 6
- dayjs
- Hono 4
- Cloudflare Workers / D1 / R2
- 手写 CSS，移动端优先，Morandi 低饱和主题

## 本地运行

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

需要两个终端：

```bash
# 终端 1：本地 Workers API，端口 8787
pnpm dev:api

# 终端 2：前端，端口 5173
pnpm dev
```

打开 `http://localhost:5173`，首次会进入初始化页。

- 本地初始化码：`zhaomu-setup`
- 创建两个账号后，第一个账号会自动登录

### 演示数据

```bash
pnpm db:seed
```

会写入两个演示账号和一组通用示例数据。

| 名字 | 邮箱 | 密码 |
| --- | --- | --- |
| 小朝 | `a@zhaomu.local` | `test12345` |
| 小暮 | `b@zhaomu.local` | `test12345` |

从空数据重来：

```bash
pnpm db:reset
```

## 部署到 Cloudflare

前置：Cloudflare 账号、已安装依赖、Node.js 20+。

```bash
# 1. 登录
npx wrangler login

# 2. 创建 D1 和 R2
npx wrangler d1 create zhaomu
npx wrangler r2 bucket create zhaomu-media

# 3. 复制配置，填入自己的 D1 database_id 和初始化码
cp wrangler.example.jsonc wrangler.jsonc

# 4. 建表
npx wrangler d1 migrations apply zhaomu --remote

# 5. 构建并部署
pnpm build
npx wrangler deploy
```

部署完成后打开 Worker 地址，输入初始化码，创建两个账号。初始化完成后 setup 接口会返回 409，不能再创建账号。

### 配置说明

- `wrangler.example.jsonc`：公开的配置模板
- `wrangler.jsonc`：本地真实配置，已被 `.gitignore` 忽略，**不要提交**
- `.dev.vars.example`：本地环境变量模板
- `.dev.vars`：本地真实环境变量，已被忽略，**不要提交**

## 安全与隐私

- 密码使用 PBKDF2-SHA256（100,000 次，Cloudflare Workers Web Crypto 上限）
- 会话使用 HttpOnly Cookie，30 天有效
- 「仅自己」的记录在 SQL 层过滤，对方拿不到
- 未解锁的信件只返回 `locked`，不返回正文和语音地址
- 私密记录里的媒体返回 403
- 生产环境拒绝 SVG 上传
- 照片可选「保留原图」或「只存压缩图」；列表使用压缩预览，原图按设置保留

公开仓库请务必确认：

- 不要提交 `.dev.vars`、`wrangler.jsonc`、`.wrangler/`、`shots/`、备份文件
- 不要把真实照片、语音、D1 导出文件放进项目目录
- 如果要公开部署，初始化码不要使用示例值

## 项目结构

```text
src/            前端页面、组件、API 客户端
worker/         Hono API、鉴权、媒体和 D1/R2 访问
migrations/     D1 表结构与默认设置
scripts/        本地种子数据、截图、开发检查脚本
public/         图标、manifest、演示用抽象图
```

## 已知限制

- 照片没有多尺寸缩略图，列表使用 1600px 压缩预览
- HEIC 照片会被拦截，需要兼容格式或截图
- 语音格式跟随浏览器，跨浏览器的 WebM/MP4 兼容性有限
- 农历生日和农历纪念日还没做
- 地图足迹、每日一问、年度报告还没做
- 没有密码重置、登录限流

## License

MIT
