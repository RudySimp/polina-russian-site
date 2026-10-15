/** Existing v1 read limits stay compatible; launch batches are deliberately smaller. */
export const sessionLimits = Object.freeze({
  maxItems: 1000,
  maxFieldChars: 50_000,
  maxSerializedChars: 3_000_000,
  // A UTF-16 code unit occupies at most three UTF-8 bytes. This preserves v1.
  maxSerializedBytes: 9_000_000,
  practiceBatchItems: 100,
});

export function serializedSessionBytes(raw: string) {
  return new TextEncoder().encode(raw).byteLength;
}
