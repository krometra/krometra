export const THUMBNAIL_WIDTH = 640;
export const THUMBNAIL_HEIGHT = 300;

export type ThumbnailUpdate = "skip" | "delete" | "upload";

export function thumbnailUpdateFor(visibleBodies: number, legacyProject: boolean): ThumbnailUpdate {
  if (legacyProject) return "skip";
  return visibleBodies > 0 ? "upload" : "delete";
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function coverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): CropRect {
  const targetAspect = targetWidth / targetHeight;
  if (sourceWidth / sourceHeight > targetAspect) {
    const sw = sourceHeight * targetAspect;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  const sh = sourceWidth / targetAspect;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}
