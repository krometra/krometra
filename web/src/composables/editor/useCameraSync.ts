import { onMounted, onUnmounted, ref } from "vue";
import * as THREE from "three";
import { ISO_VIEW } from "@/composables/useViewCube";
import { WORLD_UP } from "@/lib/orientation";
import type { ViewportRef } from "./types";

interface Vec3 { x: number; y: number; z: number }

export function useCameraSync(viewportRef: ViewportRef) {
  const cameraState = ref<{ position: Vec3; target: Vec3; up: Vec3 }>({
    position: { x: 0, y: 0, z: 15 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: WORLD_UP.x, y: WORLD_UP.y, z: WORLD_UP.z },
  });
  let interval: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    interval = setInterval(() => {
      if (viewportRef.value) {
        cameraState.value = viewportRef.value.getCameraState();
      }
    }, 50); // 20 fps — enough for cube sync
  });

  onUnmounted(() => {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  });

  function handleViewChange(view: { position: Vec3; target: Vec3; up: Vec3 }) {
    const pos = new THREE.Vector3(view.position.x, view.position.y, view.position.z);
    const tgt = new THREE.Vector3(view.target.x, view.target.y, view.target.z);
    const up = new THREE.Vector3(view.up.x, view.up.y, view.up.z);
    viewportRef.value?.animateCameraTo(pos, tgt, up);
  }

  function handleViewIso() {
    handleViewChange(ISO_VIEW);
  }

  function handleOrbit(orbit: { azimuth: number; elevation: number }) {
    viewportRef.value?.orbitBy(orbit.azimuth, orbit.elevation);
  }

  return { cameraState, handleViewChange, handleViewIso, handleOrbit };
}
