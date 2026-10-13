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

- 前端：http://127.0.0.1:5174
- API：http://127.0.0.1:3456

## 接口

- `POST /api/product` 字段 `logo`、`garment`
- `POST /api/style` 字段 `model`、`product`，返回场景和穿搭
- `POST /api/plan` JSON `{ scene, outfit }`，返回副图镜头
- `POST /api/hero` 字段 `model`、`product`、`scene`、`outfit`
- `POST /api/sub` 字段 `hero`、`scene`、`outfit`、`lens`、`action`、`prop`、`expression`
