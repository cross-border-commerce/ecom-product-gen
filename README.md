# 商品图工坊

无限画布流程 1：每个 Logo/印花 与全部服装实拍组合，生成电商商品图。

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

`POST /api/product`

multipart 字段：`logo`、`garment`。返回 `{ ok, image }`，`image` 为 data URL。
