# 商品图工坊

流水线：Logo + 服装 → 产品图 → 模特与商品图穿搭规划 → 规划镜头动作表情 → 主图/副图。

## 启动

```bash
cd ~/IdeaProjects/ecom-product-gen
cp .env.example .env
# 填写 IMAGE_API_BASE_URL、IMAGE_API_KEY
bun install
bun run dev
```

- 前端：http://127.0.0.1:5174 （用 http，不要用 https）
- API：http://127.0.0.1:3456

## Docker / GHCR

镜像：`ghcr.io/cross-border-commerce/ecom-product-gen`

```bash
# 本地构建并运行（读取 .env）
docker compose up --build

# 推到 GitHub Container Registry
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
docker build -t ghcr.io/cross-border-commerce/ecom-product-gen:latest .
docker push ghcr.io/cross-border-commerce/ecom-product-gen:latest
```

推送到 `main` 或打 `v*` 标签时，GitHub Actions 会自动构建并推送到 GHCR。仓库需要 `packages: write` 权限；组织仓库首次推送后把 Package 设为公开或给拉取账号授权。

容器内页面和 API 都在 http://127.0.0.1:3456 。

## 接口

- `POST /api/product` 字段 `logo`、`garment`
- `POST /api/style` 字段 `model`、`product`，返回场景和穿搭
- `POST /api/plan` JSON `{ scene, outfit }`，返回副图镜头
- `POST /api/hero` 字段 `model`、`product`、`scene`、`outfit`
- `POST /api/sub` 字段 `hero`、`scene`、`outfit`、`lens`、`action`、`prop`、`expression`
