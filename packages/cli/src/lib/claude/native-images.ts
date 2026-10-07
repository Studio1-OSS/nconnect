import { isVisionModel, type ModelDefinition } from "@nconnect/models";

/**
 * Whether Claude Code's images go to the target model as images, or are first
 * turned into text by a separate vision model.
 *
 * A model Nebius lists with image input (GLM 5.3 Flash, Kimi K3, Kimi K2.6)
 * sees the image itself: no extra vision call, and nothing lost in a
 * description. Text-only models keep the description path, which is the only
 * way an image can reach them at all.
 *
 * `NCONNECT_CLAUDE_IMAGES=describe` forces the description path for every
 * model, as an escape hatch if a model's image input misbehaves.
 */
export const CLAUDE_IMAGES_ENV = "NCONNECT_CLAUDE_IMAGES";

/**
 * How many of the most recent images stay as images. Every image in the
 * history is re-sent (and re-billed) on every turn, so older ones are swapped
 * for a cached one-time description instead of growing without bound over a
 * long session of screenshots.
 */
export const NATIVE_IMAGE_LIMIT = 8;

export function sendsImagesNatively(
  model: ModelDefinition,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[CLAUDE_IMAGES_ENV]?.trim().toLowerCase() === "describe") {
    return false;
  }
  return isVisionModel(model);
}
