import assert from "node:assert/strict";
import test from "node:test";
import { packFile, unpackFile, verifyFile } from "../shared/protocol.ts";

test("arbitrary file metadata and bytes survive the optical container", async () => {
  const source = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
  const packed = await packFile("résumé.bin", "application/octet-stream", source);
  const recovered = await unpackFile(packed.container);

  assert.equal(packed.compression, "none");
  assert.equal(recovered.name, "résumé.bin");
  assert.equal(recovered.type, "application/octet-stream");
  assert.deepEqual(recovered.bytes, source);
  assert.equal(await verifyFile(recovered), true);
});

test("SHA-256 verification rejects changed file bytes", async () => {
  const packed = await packFile("message.txt", "text/plain", new TextEncoder().encode("hello"));
  const recovered = await unpackFile(packed.container);
  recovered.bytes[0] ^= 0xff;

  assert.equal(await verifyFile(recovered), false);
});

test("compressible files use gzip and recover exactly", async () => {
  const source = new TextEncoder().encode("decimen optical transfer\n".repeat(4_000));
  const packed = await packFile("notes.txt", "text/plain", source);
  const recovered = await unpackFile(packed.container);

  assert.equal(packed.compression, "gzip");
  assert.ok(packed.transmittedSize < source.length / 10);
  assert.equal(recovered.compression, "gzip");
  assert.deepEqual(recovered.bytes, source);
  assert.equal(await verifyFile(recovered), true);
});

test("gzip output length is bounded by the declared original size", async () => {
  const source = new TextEncoder().encode("bounded output\n".repeat(1_000));
  const packed = await packFile("bounded.txt", "text/plain", source);
  const malformed = packed.container.slice();
  new DataView(malformed.buffer).setUint32(9, source.length + 1, true);

  await assert.rejects(unpackFile(malformed), /gzip payload length/);
});

test("malformed optical containers are rejected", async () => {
  await assert.rejects(unpackFile(new Uint8Array(49)), /header is invalid/);
});
