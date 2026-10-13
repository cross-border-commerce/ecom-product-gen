export function apiBaseUrl() {
  const raw = (process.env.IMAGE_API_BASE_URL || "https://api.openai.com").trim().replace(/\/+$/, "");
  return raw.toLowerCase().endsWith("/v1") ? raw : `${raw}/v1`;
}

export const apiKey = process.env.IMAGE_API_KEY || "";
export const imageModel = process.env.IMAGE_MODEL || "gpt-image-2";
export const textModel = process.env.IMAGE_TEXT_MODEL || "gpt-5.6";
export const imageSize = process.env.IMAGE_SIZE || "1024x1024";
export const imageQuality = process.env.IMAGE_QUALITY || "auto";
