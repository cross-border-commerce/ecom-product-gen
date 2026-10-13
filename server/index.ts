import { Hono } from "hono";
import { cors } from "hono/cors";
import { editProductImage, hasApiKey } from "./generate";
import { HERO_PROMPT, PRODUCT_PROMPT, SUB_SHOTS } from "./prompts";

const app = new Hono();
const port = Number(process.env.PORT || 3456);

app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    ready: hasApiKey(),
    model: process.env.IMAGE_MODEL || "gpt-image-2",
  }),
);

app.post("/api/product", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const logo = asFile(body.logo);
  const garment = asFile(body.garment);
  if (!logo || !garment) {
    return c.json({ ok: false, error: "需要同时上传 logo 和 garment" }, 400);
  }
  return runEdit(c, PRODUCT_PROMPT, [logo, garment]);
});

app.post("/api/hero", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const modelImage = asFile(body.model);
  const product = asFile(body.product);
  if (!modelImage || !product) {
    return c.json({ ok: false, error: "需要同时上传 model 和 product" }, 400);
  }
  return runEdit(c, HERO_PROMPT, [modelImage, product]);
});

app.post("/api/sub", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const hero = asFile(body.hero);
  const shotId = String(body.shot || "");
  const shot = SUB_SHOTS.find((item) => item.id === shotId);
  if (!hero || !shot) {
    return c.json({ ok: false, error: "需要上传 hero，并指定 shot" }, 400);
  }
  return runEdit(c, shot.prompt, [hero]);
});

async function runEdit(c: { json: (data: unknown, status?: number) => Response }, prompt: string, images: File[]) {
  try {
    const image = await editProductImage(prompt, images);
    return c.json({ ok: true, image });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生图失败";
    return c.json({ ok: false, error: message }, 500);
  }
}

function asFile(value: unknown): File | null {
  if (value instanceof File) return value;
  if (Array.isArray(value) && value[0] instanceof File) return value[0];
  return null;
}

Bun.serve({
  port,
  idleTimeout: 255,
  fetch: app.fetch,
});

console.log(`ecom-product-gen api http://127.0.0.1:${port}`);
