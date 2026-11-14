export type CameraStatus = "idle" | "requesting" | "active" | "stopped" | "denied" | "no-camera" | "unsupported" | "insecure" | "unreadable" | "error";

export class CameraError extends Error {
  constructor(public status: CameraStatus, message: string) { super(message); }
}
export async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError("insecure", "Use localhost or HTTPS to access the camera.");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported", "This browser does not support webcam access. Use desktop Chrome.");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) throw new CameraError("denied", "Camera permission denied. Allow camera access in Chrome site settings, then retry.");
    if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) throw new CameraError("no-camera", "No usable camera found. Connect a camera and retry.");
    if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) throw new CameraError("unreadable", "Camera is busy or unreadable. Close other camera apps and retry.");
    throw new CameraError("error", error instanceof Error ? error.message : "Camera access failed.");
  }
}
export function releaseCamera(stream: MediaStream | null) { stream?.getTracks().forEach(track => track.stop()); }
