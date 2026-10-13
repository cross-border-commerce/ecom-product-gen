import { apiBaseUrl, apiKey, imageModel, imageQuality, imageSize } from "./config";

export function hasApiKey() {
  return Boolean(apiKey);
}

function isDropped(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /socket connection was closed|ECONNRESET|UND_ERR_SOCKET|fetch failed/i.test(text);
}

export async function editProductImage(prompt: string, images: File[]) {
  if (!apiKey) {
    throw new Error("未配置 IMAGE_API_KEY");
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await requestEdit(prompt, images);
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !isDropped(error)) break;
    }
  }
  const text = lastError instanceof Error ? lastError.message : "生图失败";
  if (isDropped(lastError)) {
    throw new Error("上游连接被断开，生图接口超时或中断，请再试一次");
  }
  throw new Error(text);
}

async function requestEdit(prompt: string, images: File[]) {
  const form = new FormData();
  form.set("model", imageModel);
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("size", imageSize);
  form.set("quality", imageQuality);
  if (!/gpt-image/.test(imageModel)) {
    form.set("response_format", "b64_json");
  }
  images.forEach((image, index) => {
    const name = index === 0 ? "logo.png" : "garment.png";
    form.append("image", image, name);
  });
  const url = `${apiBaseUrl()}/images/edits`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(240_000),
    verbose: true,
  } as RequestInit);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || payload?.msg || `生图失败 ${response.status}`;
    throw new Error(message);
  }
  const item = payload?.data?.[0];
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }
  if (item?.url) {
    const image = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!image.ok) throw new Error("下载生成结果失败");
    const bytes = Buffer.from(await image.arrayBuffer());
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }
  throw new Error("生图接口没有返回图片");
}
