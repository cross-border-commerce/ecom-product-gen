export function asFile(value: unknown): File | null {
  return asFiles(value)[0] || null;
}

export function asFiles(value: unknown): File[] {
  if (value instanceof File) return [value];
  if (Array.isArray(value)) return value.filter((item): item is File => item instanceof File);
  return [];
}
