export function readPath(object: unknown, path: string): unknown {
  return path.split(".").reduce((value: unknown, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, object);
}

export function writePath<T extends object>(object: T, path: string, value: unknown): T {
  const result = structuredClone(object) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let cursor = result;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] = (cursor[key] as Record<string, unknown>) || {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys.at(-1)!] = value;
  return result as T;
}
