import { Hono } from "hono";
import { cors } from "hono/cors";
import { chatText, parseShots } from "./chat";
import { imageModel } from "./config";
import { editProductImage, hasApiKey } from "./generate";
import { heroPrompt, PLAN_PROMPT, PRODUCT_PROMPT, SCENE_PROMPT, subPrompt } from "./prompts";

const app = new Hono();
const port = Number(process.env.PORT || 3456);

app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    ready: hasApiKey(),
    model: imageModel,
  }),
);

app.post("/api/product", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const logo = asFile(body.logo);
  const garment = asFile(body.garment);
  if (!logo || !garment) return c.json({ ok: false, error: "需要同时上传 logo 和 garment" }, 400);
  return runEdit(c, PRODUCT_PROMPT, [logo, garment]);
});

app.post("/api/scene", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const modelImage = asFile(body.model);
  if (!modelImage) return c.json({ ok: false, error: "需要上传 model" }, 400);
  try {
    const scene = await chatText(SCENE_PROMPT, modelImage);
    return c.json({ ok: true, scene });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "识场景失败" }, 500);
  }
});

app.post("/api/plan", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const scene = String(body.scene || "").trim();
  if (!scene) return c.json({ ok: false, error: "需要 scene" }, 400);
  try {
    const raw = await chatText(`${PLAN_PROMPT}${scene}`);
    const shots = parseShots(raw);
    return c.json({ ok: true, shots });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "规划镜头失败" }, 500);
  }
});

app.post("/api/hero", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const modelImage = asFile(body.model);
  const product = asFile(body.product);
  const scene = String(body.scene || "").trim();
  if (!modelImage || !product) return c.json({ ok: false, error: "需要同时上传 model 和 product" }, 400);
  return runEdit(c, heroPrompt(scene || "贴近模特参考图的真实拍摄环境"), [modelImage, product]);
});

app.post("/api/sub", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const hero = asFile(body.hero);
  const scene = String(body.scene || "");
  const lens = String(body.lens || "");
  const action = String(body.action || "");
  const prop = String(body.prop || "无");
  const expression = String(body.expression || "自然");
  if (!hero || !lens || !action) return c.json({ ok: false, error: "需要 hero、lens、action" }, 400);
  return runEdit(c, subPrompt(scene, { lens, action, prop, expression }), [hero]);
});

async function runEdit(c: { json: (data: unknown, status?: number) => Response }, prompt: string, images: File[]) {
  try {
    const image = await editProductImage(prompt, images);
    return c.json({ ok: true, image });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "生图失败" }, 500);
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
