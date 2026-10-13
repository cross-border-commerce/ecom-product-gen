# 商品图工坊

流水线：Logo + 服装 → 产品图 → 模特识场景 → 规划镜头 → 主图/副图。

## 启动

```bash
cd ~/IdeaProjects/ecom-product-gen
cp .env.example .env
# 填写 IMAGE_API_BASE_URL、IMAGE_API_KEY
bun install
bun run dev
```

- 前端：http://127.0.0.1:5174
- API：http://127.0.0.1:3456

## 接口

- `POST /api/product` 字段 `logo`、`garment`
- `POST /api/scene` 字段 `model`
- `POST /api/plan` JSON `{ scene }`
- `POST /api/hero` 字段 `model`、`product`、`scene`
- `POST /api/sub` 字段 `hero`、`scene`、`lens`、`action`、`prop`、`expression`
