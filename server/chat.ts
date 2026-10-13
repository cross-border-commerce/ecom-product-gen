import sharp from "sharp";
import { apiBaseUrl, apiKey, textModel } from "./config";

async function toVisionJpeg(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const out = await sharp(input).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  return new File([out], "vision.jpg", { type: "image/jpeg" });
}

export async function chatText(prompt: string, images: File[] = []) {
  if (!apiKey) throw new Error("未配置 IMAGE_API_KEY");
  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const image of images) {
    const jpeg = await toVisionJpeg(image);
    const bytes = Buffer.from(await jpeg.arrayBuffer());
    content.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${bytes.toString("base64")}` },
    });
  }
  const response = await fetch(`${apiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: textModel,
      messages: [{ role: "user", content }],
      temperature: 0.4,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await response.text();
  let payload: any = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { message: raw.slice(0, 240) };
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `文本接口失败 ${response.status}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("文本接口没有返回内容");
  return text.trim();
}

function parseJsonObject(raw: string) {
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  return JSON.parse(start >= 0 ? jsonText.slice(start, end + 1) : jsonText);
}

export function parseStyle(raw: string) {
  try {
    const parsed = parseJsonObject(raw);
    const scene = String(parsed.scene || parsed.场景 || "").trim();
    const outfit = String(parsed.outfit || parsed.穿搭 || "").trim();
    if (scene && outfit) return { scene, outfit };
  } catch {
    // gpt-5.6 有时不返回纯 JSON
  }
  const sceneMatch = raw.match(/场景[:：]\s*([^\n]+)/);
  const outfitMatch = raw.match(/穿搭[:：]\s*([\s\S]+)/);
  const scene = sceneMatch?.[1]?.trim() || "贴近模特参考图的真实拍摄环境";
  const outfit = outfitMatch?.[1]?.trim() || raw.slice(0, 400);
  if (!outfit) throw new Error("穿搭规划没有解析出场景或穿搭");
  return { scene, outfit };
}

export function parseShots(raw: string) {
  const parsed = parseJsonObject(raw);
  const shots = parsed.shots || parsed.副图 || [];
  if (!Array.isArray(shots) || shots.length === 0) throw new Error("镜头规划没有解析出副图");
  return shots.map((shot: Record<string, string>, index: number) => ({
    id: shot.id || `sub${index + 1}`,
    name: shot.name || `副图${index + 1}`,
    lens: shot.lens || shot.镜头 || "",
    action: shot.action || shot.动作 || "",
    prop: shot.prop || shot.配饰 || "无",
    expression: shot.expression || shot.表情 || "自然",
  }));
}
