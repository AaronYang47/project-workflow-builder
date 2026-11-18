import type { CollaborativeViewState } from "./collaboration-types";

export const COLLABORATIVE_PATHS = {
  workflow: "/",
  conditions: "/release-conditions",
  "process-overview": "/process-overview",
} as const;

export function collaborativePageFromPath(
  path: string,
): NonNullable<CollaborativeViewState["page"]> | undefined {
  const normalized = path.replace(/\/$/, "") || "/";
  return (Object.keys(COLLABORATIVE_PATHS) as (keyof typeof COLLABORATIVE_PATHS)[]).find(
    (key) => COLLABORATIVE_PATHS[key] === normalized,
  );
}

/** A viewer who explicitly opens a layer from L5 can inspect it independently. */
export const INDEPENDENT_LAYER_PARAM = "browseLayer";
