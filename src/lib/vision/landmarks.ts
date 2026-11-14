import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export const ASSETS = {
  packageVersion: "0.10.22-rc.20250304",
  wasm: "/mediapipe/0.10.22-rc.20250304",
  model: "/models/face_landmarker-float16-v1.task",
} as const;
export async function loadLandmarker(): Promise<FaceLandmarker> {
  const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(ASSETS.wasm);
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: ASSETS.model, delegate: "CPU" },
    runningMode: "VIDEO", numFaces: 1,
    minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    outputFacialTransformationMatrixes: true,
  });
}
