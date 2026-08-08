import assert from "node:assert/strict";
import test from "node:test";
import { cameraChoices, cameraTrackConstraints } from "../receive/camera-selection";

test("cameraChoices keeps video inputs and supplies privacy-safe fallback labels", () => {
  const choices = cameraChoices([
    { deviceId: "mic", kind: "audioinput", label: "Microphone" },
    { deviceId: "wide", kind: "videoinput", label: "Back Wide Camera" },
    { deviceId: "tele", kind: "videoinput", label: "" },
  ]);

  assert.deepEqual(choices, [
    { deviceId: "wide", label: "Back Wide Camera" },
    { deviceId: "tele", label: "Camera 2" },
  ]);
});

test("cameraTrackConstraints targets a chosen lens exactly", () => {
  assert.deepEqual(cameraTrackConstraints("tele", 1280), {
    deviceId: { exact: "tele" },
    width: { ideal: 1280 },
    height: { ideal: 960 },
  });
});

test("cameraTrackConstraints asks for a rear camera when selection is automatic", () => {
  assert.deepEqual(cameraTrackConstraints("", 960), {
    facingMode: "environment",
    width: { ideal: 960 },
    height: { ideal: 720 },
  });
});
