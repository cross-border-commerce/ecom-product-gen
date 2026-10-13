import { Hono } from "hono";
import { cors } from "hono/cors";
import { chatText, parseShots, parseStyle } from "./chat";
import { imageModel } from "./config";
import { editProductImage, hasApiKey } from "./generate";
import { heroPrompt, PLAN_PROMPT, PRODUCT_PROMPT, STYLE_PROMPT, subPrompt } from "./prompts";

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
  console.log("[product] start", logo.name, garment.name);
  return runEdit(c, PRODUCT_PROMPT, [logo, garment], "product");
});

app.post("/api/style", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const modelImage = asFile(body.model);
  const product = asFile(body.product);
  if (!modelImage || !product) return c.json({ ok: false, error: "需要同时上传 model 和 product" }, 400);
  try {
    console.log("[style] start");
    const raw = await chatText(STYLE_PROMPT, [modelImage, product]);
    const parsed = parseStyle(raw);
    console.log("[style] done");
    return c.json({ ok: true, ...parsed });
  } catch (error) {
    console.log("[style] fail", error instanceof Error ? error.message : error);
    return c.json({ ok: false, error: error instanceof Error ? error.message : "穿搭规划失败" }, 500);
  }
});

app.post("/api/plan", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const scene = String(body.scene || "").trim();
  const outfit = String(body.outfit || "").trim();
  if (!scene || !outfit) return c.json({ ok: false, error: "需要 scene 和 outfit" }, 400);
  try {
    console.log("[plan] start");
    const raw = await chatText(`${PLAN_PROMPT}${outfit}\n\n场景：\n${scene}`);
    const shots = parseShots(raw);
    console.log("[plan] done", shots.length);
    return c.json({ ok: true, shots });
  } catch (error) {
    console.log("[plan] fail", error instanceof Error ? error.message : error);
    return c.json({ ok: false, error: error instanceof Error ? error.message : "规划镜头失败" }, 500);
  }
});

app.post("/api/hero", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const modelImage = asFile(body.model);
  const product = asFile(body.product);
  const scene = String(body.scene || "").trim();
  const outfit = String(body.outfit || "").trim();
  if (!modelImage || !product) return c.json({ ok: false, error: "需要同时上传 model 和 product" }, 400);
  console.log("[hero] start");
  return runEdit(c, heroPrompt(scene, outfit), [modelImage, product], "hero");
});

app.post("/api/sub", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const hero = asFile(body.hero);
  const scene = String(body.scene || "");
  const outfit = String(body.outfit || "");
  const lens = String(body.lens || "");
  const action = String(body.action || "");
  const prop = String(body.prop || "无");
  const expression = String(body.expression || "自然");
  if (!hero || !lens || !action) return c.json({ ok: false, error: "需要 hero、lens、action" }, 400);
  console.log("[sub] start", lens);
  return runEdit(c, subPrompt(scene, outfit, { lens, action, prop, expression }), [hero], "sub");
});

async function runEdit(c: { json: (data: unknown, status?: number) => Response }, prompt: string, images: File[], label = "edit") {
  try {
    const image = await editProductImage(prompt, images);
    console.log(`[${label}] done`);
    return c.json({ ok: true, image });
  } catch (error) {
    console.log(`[${label}] fail`, error instanceof Error ? error.message : error);
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
