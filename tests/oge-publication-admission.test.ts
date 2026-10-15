import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { eligible } from "../apps/showcase/src/oge/engine";
import {
  publicationAdmission,
  admissionPayload,
} from "../apps/showcase/src/content/publication-admission.mjs";
import legacy from "../content/oge-legacy-admission.json";
import { createHash } from "node:crypto";
const old = exercises.find((e) => e.id === legacy.entries[0].id)!;
const reviewed = exercises.find(
  (e) => e.exam === "OGE" && e.publicationReview,
)!;
describe("P1-07 explicit educational admission", () => {
  it("retains exactly registered old revisions without inventing a new content review", () => {
    expect(publicationAdmission(old)).toBe("legacy-editorial");
    expect(eligible(old)).toBe(true);
    expect(publicationAdmission({ ...old, id: "new-unreviewed" })).toBeNull();
    expect(
      publicationAdmission({ ...old, revision: old.revision + 1 }),
    ).toBeNull();
  });
  it("pins legacy conditions keys explanations and rights with SHA-256 and does not mistake metadata edits for review", () => {
    for (const record of legacy.entries) {
      const exercise = exercises.find((e) => e.id === record.id)!;
      expect(
        createHash("sha256").update(admissionPayload(exercise)).digest("hex"),
      ).toBe(record.sha256);
    }
    expect(admissionPayload({ ...old, skillIds: ["new-metadata"] })).toBe(
      admissionPayload(old),
    );
    expect(admissionPayload({ ...old, answers: ["different"] })).not.toBe(
      admissionPayload(old),
    );
  });
  it("requires every facet plus author date and exact revision for a new admission", () => {
    expect(publicationAdmission(reviewed)).toBe("revision-reviewed");
    for (const patch of [
      { revision: reviewed.revision + 1 },
      { by: "" },
      { at: "bad-date" },
      { condition: false },
      { key: false },
      { alternatives: false },
      { explanation: false },
      { rights: false },
    ])
      expect(
        publicationAdmission({
          ...reviewed,
          publicationReview: { ...reviewed.publicationReview!, ...patch },
        }),
      ).toBeNull();
  });
  it("does not infer teacher approval from a review mode string", () => {
    expect(
      publicationAdmission({
        ...reviewed,
        publicationReview: {
          ...reviewed.publicationReview!,
          mode: "method-approved",
        },
      }),
    ).toBeNull();
  });
});
