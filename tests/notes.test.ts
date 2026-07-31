import assert from "node:assert/strict";
import test from "node:test";
import {
  clearStoredNotes,
  deleteStoredNote,
  loadStoredNotes,
  packPrivateNote,
  storeReceivedNote,
  unpackPrivateNote,
  type StorageLike,
} from "../shared/notes.ts";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("private notes survive the optical container", async () => {
  const packed = await packPrivateNote("Meet by the north door.", 1_750_000_000_000, "note-1");
  const recovered = await unpackPrivateNote(packed.packed.container);

  assert.deepEqual(recovered.note, packed.note);
  assert.equal(recovered.file.compression, "none");
});

test("received notes are stored newest-first and deduplicated", async () => {
  const storage = new MemoryStorage();
  const first = (await packPrivateNote("first", 100, "first")).note;
  const second = (await packPrivateNote("second", 200, "second")).note;

  storeReceivedNote(storage, first, 300);
  storeReceivedNote(storage, second, 400);
  const duplicate = storeReceivedNote(storage, second, 500);

  assert.equal(duplicate.added, false);
  assert.deepEqual(loadStoredNotes(storage).map((note) => note.id), ["second", "first"]);
  assert.deepEqual(deleteStoredNote(storage, "second").map((note) => note.id), ["first"]);
  clearStoredNotes(storage);
  assert.deepEqual(loadStoredNotes(storage), []);
});

test("empty private notes are rejected", async () => {
  await assert.rejects(packPrivateNote("  \n"), /Write a note/);
});
