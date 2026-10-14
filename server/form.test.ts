import { describe, expect, test } from "bun:test";
import { asFile, asFiles } from "./form";

describe("asFiles", () => {
  test("collects a single File", () => {
    const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
    expect(asFiles(file)).toEqual([file]);
  });

  test("collects an array of Files", () => {
    const a = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const b = new File(["b"], "b.jpg", { type: "image/jpeg" });
    expect(asFiles([a, b])).toEqual([a, b]);
  });

  test("returns empty for missing values", () => {
    expect(asFiles(undefined)).toEqual([]);
    expect(asFiles(null)).toEqual([]);
    expect(asFiles("skip")).toEqual([]);
  });
});

describe("asFile", () => {
  test("returns the first File from an array", () => {
    const a = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const b = new File(["b"], "b.jpg", { type: "image/jpeg" });
    expect(asFile([a, b])).toBe(a);
  });
});
