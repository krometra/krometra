import { onBeforeUnmount, watch, type Ref } from "vue";
import { useApi } from "@/composables/useApi";
import { useDocument } from "@/composables/shared/useDocument";
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, thumbnailUpdateFor } from "@/lib/projectThumbnail";
import type { ViewportRef } from "./types";

const THUMBNAIL_DELAY_MS = 3000;

export function useProjectThumbnail(deps: {
  projectId: string;
  viewportRef: ViewportRef;
  visibleBodies: Ref<number>;
  legacyProject: Ref<boolean>;
}) {
  const api = useApi();
  const documentStore = useDocument();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let publishedVersion = 0;

  async function publish() {
    timer = null;
    const version = documentStore.version.value;
    if (version === publishedVersion) return;
    const update = thumbnailUpdateFor(deps.visibleBodies.value, deps.legacyProject.value);
    if (update === "skip") return;
    publishedVersion = version;
    const path = `/projects/${deps.projectId}/thumbnail`;
    try {
      if (update === "delete") {
        await api.delete(path);
        return;
      }
      const image = await deps.viewportRef.value?.captureImage(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      if (!image) return;
      const form = new FormData();
      form.set("image", image, "thumbnail.png");
      await api.multipartPut(path, form);
    } catch (error) {
      console.warn("Не удалось обновить превью проекта:", error);
    }
  }

  watch(documentStore.version, (version) => {
    if (version <= 0) return;
    if (publishedVersion === 0) {
      publishedVersion = version;
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(publish, THUMBNAIL_DELAY_MS);
  });

  onBeforeUnmount(() => {
    if (!timer) return;
    clearTimeout(timer);
    void publish();
  });
}
