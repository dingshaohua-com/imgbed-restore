# Imgbed Restore

这是一个为 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed) 准备的补充工具，用来把 Cloudflare R2 中已经存在的文件重新写入 CloudFlare-ImgBed 的 D1 元数据。

适用场景：

- R2 里已有文件，但 CloudFlare-ImgBed 的 D1 数据库缺少对应记录
- 迁移、恢复备份或手动上传 R2 对象后，需要让 CloudFlare-ImgBed 管理端重新识别这些文件
- 只想按 R2 对象前缀批量补齐某一批文件的图床元数据

本项目本身不是图床服务，不替代 CloudFlare-ImgBed；它只是调用目标 CloudFlare-ImgBed 实例的管理接口，将 R2 对象列表转换为可写入的文件元数据。页面在 `public/index.html`，接口由 Cloudflare Worker 提供。

## 本地启动

```txt
pnpm install
pnpm run dev
```

启动后打开 Wrangler 输出的本地地址即可使用页面。页面会先读取浏览器本地保存的表单参数；如果没有本地保存，再从 Worker 环境变量加载默认参数。

## 本地环境变量

本地开发使用 Wrangler 约定的 `.dev.vars` 文件。这个文件包含密钥，已经在 `.gitignore` 中，**不要提交到 Git**。

在项目根目录创建 `.dev.vars`：

```txt
IMGBED_RESTORE_BASE_URL="https://img.example.com"
IMGBED_RESTORE_API_TOKEN="imgbed_xxx"
IMGBED_RESTORE_R2_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com"
IMGBED_RESTORE_R2_ACCESS_KEY_ID="xxx"
IMGBED_RESTORE_R2_SECRET_ACCESS_KEY="xxx"
IMGBED_RESTORE_R2_BUCKET="my-bucket"
IMGBED_RESTORE_CHANNEL_NAME="default"
IMGBED_RESTORE_PREFIX=""
IMGBED_RESTORE_REGION="auto"
IMGBED_RESTORE_PAGE_SIZE="1000"
IMGBED_RESTORE_CHECK_CONCURRENCY="20"
IMGBED_RESTORE_RESTORE_BATCH_SIZE="200"
```

字段说明：

- `IMGBED_RESTORE_BASE_URL`：目标 CloudFlare-ImgBed 服务地址，例如 `https://img.example.com`
- `IMGBED_RESTORE_API_TOKEN`：目标 CloudFlare-ImgBed 管理 API Token
- `IMGBED_RESTORE_R2_ENDPOINT`：R2 S3 API endpoint，不要带 bucket 路径
- `IMGBED_RESTORE_R2_ACCESS_KEY_ID`：R2 API Token 的 Access Key ID
- `IMGBED_RESTORE_R2_SECRET_ACCESS_KEY`：R2 API Token 的 Secret Access Key
- `IMGBED_RESTORE_R2_BUCKET`：R2 bucket 名称
- `IMGBED_RESTORE_CHANNEL_NAME`：写入 CloudFlare-ImgBed 元数据时使用的渠道名
- `IMGBED_RESTORE_PREFIX`：只同步指定前缀，为空表示同步整个 bucket
- `IMGBED_RESTORE_REGION`：R2 通常使用 `auto`
- `IMGBED_RESTORE_PAGE_SIZE`：R2 列表分页大小
- `IMGBED_RESTORE_CHECK_CONCURRENCY`：检查目标文件是否已存在的并发数
- `IMGBED_RESTORE_RESTORE_BATCH_SIZE`：批量写入 CloudFlare-ImgBed 的批大小

## 页面使用

默认页面为：

```txt
/
```

页面行为：

- 优先读取浏览器 `localStorage` 中保存过的表单参数
- 如果本地没有保存，再请求 `GET /sync/defaults` 从环境变量填充默认值
- 清除本机保存后，刷新页面会重新从环境变量填充默认值
- “同步范围”和“性能与策略”默认折叠，一般保持默认即可

注意：`GET /sync/defaults` 会把环境变量返回到浏览器，适合本地或私有工具使用。如果要公开部署，建议先给页面和接口加访问控制。

目标 CloudFlare-ImgBed 实例需要能通过管理 API Token 调用批量恢复接口。本工具会读取 R2 对象，检查目标实例里是否已有记录，并按批次调用目标实例写入缺失的元数据。

## 同步接口

路由：

```txt
POST /sync/r2-d1
```

请求体示例：

```json
{
  "baseUrl": "https://img.example.com",
  "apiToken": "imgbed_xxx",
  "r2Endpoint": "https://<accountid>.r2.cloudflarestorage.com",
  "r2AccessKeyId": "xxx",
  "r2SecretAccessKey": "xxx",
  "r2Bucket": "my-bucket",
  "channelName": "default",
  "prefix": "",
  "region": "auto",
  "pageSize": 1000,
  "checkConcurrency": 20,
  "restoreBatchSize": 200,
  "overwrite": false,
  "skipRebuild": false
}
```

如果请求体缺少字段，接口会优先使用环境变量中的默认值补齐。

返回数据包含：

- `objectTotal`：R2 扫描对象总数
- `writeTotal`：本次写入记录数
- `skippedExisting`：跳过已存在记录数，仅 `overwrite=false` 时有意义
- `rebuildTriggered`：是否触发索引重建

## 参数提示

`r2Endpoint` 不要带 bucket 名或路径：

```txt
IMGBED_RESTORE_R2_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com"
IMGBED_RESTORE_R2_BUCKET="one"
```

`prefix` 用来限制只同步某个目录前缀，例如：

```txt
IMGBED_RESTORE_PREFIX="uploads/"
```

留空则同步整个 bucket。

`skipRebuild` 表示同步后跳过索引重建。第一次正式同步通常不要勾选；如果连续跑多次，可以前几次勾选，最后一次不勾选。

## 部署

```txt
pnpm run deploy
```

生产环境不要提交或上传 `.dev.vars`。建议在 Cloudflare Dashboard 的 Worker Variables / Secrets 中配置同名变量，或用 Wrangler secrets 写入敏感值：

```txt
pnpm exec wrangler secret put IMGBED_RESTORE_API_TOKEN
pnpm exec wrangler secret put IMGBED_RESTORE_R2_ACCESS_KEY_ID
pnpm exec wrangler secret put IMGBED_RESTORE_R2_SECRET_ACCESS_KEY
```

非敏感变量可以放在 `wrangler.jsonc` 的 `vars` 中，敏感 token 和 secret 建议用 secrets。

## 其他命令

生成或同步 Worker 类型：

```txt
pnpm run cf-typegen
```

本项目开启了 `nodejs_compat`，用于兼容部分依赖 Node.js 能力的 npm 包。
