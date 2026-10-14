import { describe, expect, test } from "bun:test";
import { heroPrompt, PLAN_PROMPT, STYLE_PROMPT } from "./prompts";

describe("style prompt", () => {
  test("treats earlier images as same-person model refs and last as product", () => {
    expect(STYLE_PROMPT).toContain("同一人");
    expect(STYLE_PROMPT).toMatch(/前面/);
    expect(STYLE_PROMPT).toMatch(/最后一张/);
    expect(STYLE_PROMPT).toContain("不要用模特原图的衣服");
  });
});

describe("hero prompt", () => {
  test("uses all model refs for identity and last image for the garment", () => {
    const text = heroPrompt("咖啡馆自然光", "白T配牛仔裤");
    expect(text).toContain("同一人");
    expect(text).toMatch(/前面/);
    expect(text).toMatch(/最后一张/);
    expect(text).toContain("不要复制模特原图的衣服");
  });
});

describe("plan prompt", () => {
  test("keeps one person one outfit one location", () => {
    expect(PLAN_PROMPT).toContain("同一人");
    expect(PLAN_PROMPT).toContain("同一套");
    expect(PLAN_PROMPT).toContain("同一地点");
  });
});
