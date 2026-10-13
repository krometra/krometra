import { describe, expect, it } from "vitest";
import { coverCrop, thumbnailUpdateFor } from "./projectThumbnail";

describe("coverCrop", () => {
  it("trims the sides of a wide viewport", () => {
    expect(coverCrop(2000, 600, 640, 300)).toEqual({ sx: 360, sy: 0, sw: 1280, sh: 600 });
  });

  it("trims top and bottom of a tall viewport", () => {
    expect(coverCrop(640, 600, 640, 300)).toEqual({ sx: 0, sy: 150, sw: 640, sh: 300 });
  });

  it("keeps a viewport of the same aspect intact", () => {
    expect(coverCrop(1280, 600, 640, 300)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 600 });
  });
});

describe("thumbnailUpdateFor", () => {
  it("uploads a snapshot of a non-empty scene and removes the preview of an empty one", () => {
    expect(thumbnailUpdateFor(2, false)).toBe("upload");
    expect(thumbnailUpdateFor(0, false)).toBe("delete");
  });

  it("never touches the preview of an unsupported server kernel project", () => {
    expect(thumbnailUpdateFor(3, true)).toBe("skip");
  });
});
