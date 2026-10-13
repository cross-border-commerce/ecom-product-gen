import { apiBaseUrl, apiKey, textModel } from "./config";

export async function chatText(prompt: string, image?: File) {
  if (!apiKey) throw new Error("未配置 IMAGE_API_KEY");
  const content: unknown[] = [{ type: "text", text: prompt }];
  if (image) {
    const bytes = Buffer.from(await image.arrayBuffer());
    const mime = image.type || "image/png";
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` },
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
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `文本接口失败 ${response.status}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("文本接口没有返回内容");
  return text.trim();
}

export function parseShots(raw: string) {
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 ? jsonText.slice(start, end + 1) : jsonText);
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
