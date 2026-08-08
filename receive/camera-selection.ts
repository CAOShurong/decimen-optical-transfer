export interface CameraChoice {
  deviceId: string;
  label: string;
}

/** Turn MediaDevices results into stable, human-readable selector entries.
 *  Labels become available only after camera permission on most browsers. */
export function cameraChoices(
  devices: ReadonlyArray<Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">>,
): CameraChoice[] {
  let fallbackNumber = 0;
  return devices.flatMap((device) => {
    if (device.kind !== "videoinput" || !device.deviceId) return [];
    fallbackNumber++;
    return [
      {
        deviceId: device.deviceId,
        label: device.label.trim() || `Camera ${fallbackNumber}`,
      },
    ];
  });
}

/** Prefer the rear camera until a user selects an exact lens. */
export function cameraTrackConstraints(deviceId: string, captureWidth: number): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }),
    width: { ideal: captureWidth },
    height: { ideal: Math.round((captureWidth * 3) / 4) },
  };
}
