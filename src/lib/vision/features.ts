import type { Eye, Features, Landmark } from "@/types/vision";

// Anatomical left/right, independent of the mirrored preview. Coordinates are
// converted to camera pixel aspect before projection onto the eye's own axes.
export function normalizeEye(iris: Landmark, a: Landmark, b: Landmark, top: Landmark, bottom: Landmark, aspect = 4 / 3): Eye | null {
  if (![iris, a, b, top, bottom].every(p => p && [p.x, p.y, p.z].every(Number.isFinite)) || !Number.isFinite(aspect) || aspect <= 0) return null;
  const dx = (b.x - a.x) * aspect, dy = b.y - a.y;
  const width = Math.hypot(dx, dy);
  if (width < 0.01) return null;
  const ix = (iris.x - a.x) * aspect, iy = iris.y - a.y;
  const normalized = { x: (ix * dx + iy * dy) / width ** 2, y: (-ix * dy + iy * dx) / width ** 2 };
  const aperture = Math.hypot((bottom.x - top.x) * aspect, bottom.y - top.y) / width;
  if (normalized.x < -0.25 || normalized.x > 1.25 || Math.abs(normalized.y) > 0.6 || aperture < 0.08 || aperture > 0.65) return null;
  return { iris: { x: iris.x, y: iris.y }, corners: [a, b], normalized, aperture };
}

export function extractFeatures(points: readonly Landmark[] | undefined, matrix: readonly number[] | undefined, aspect: number): Features | null {
  if (!points || points.length < 478 || !matrix || matrix.length !== 16 || !matrix.every(Number.isFinite)) return null;
  // Keep both axes oriented image-left to image-right for both eyes.
  const left = normalizeEye(points[473], points[362], points[263], points[386], points[374], aspect);
  const right = normalizeEye(points[468], points[33], points[133], points[159], points[145], aspect);
  if (!left || !right) return null;
  // MediaPipe transformation matrix is column-major. Remove uniform scale.
  const scale = Math.hypot(matrix[0], matrix[1], matrix[2]);
  if (scale < 1e-8) return null;
  const yaw = Math.asin(Math.max(-1, Math.min(1, -matrix[2] / scale)));
  const pitch = Math.atan2(matrix[6], matrix[10]);
  if (Math.abs(yaw) > 1 || Math.abs(pitch) > 0.9) return null;
  return { left, right, yaw, pitch, vector: [left.normalized.x, left.normalized.y, right.normalized.x, right.normalized.y, yaw, pitch], landmarkCount: points.length, minAperture: Math.min(left.aperture, right.aperture) };
}
