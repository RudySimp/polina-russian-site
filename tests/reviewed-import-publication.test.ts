import { describe, expect, it } from "vitest";
import {
  mergeReviewedImport,
  reviewedApprovalHash,
  reviewedPublishedHash,
} from "../scripts/lib/reviewed-import-publication.mjs";
import { exercises } from "../apps/showcase/src/content/registry";
const fixture = exercises.find(
  (item) => item.id === "oge-slovosochetaniya-017",
)!;
const approval = {
  candidateId: "reviewed-source",
  revision: 1,
  answer: "прогулки зимой",
};
function locked(existing = fixture) {
  return {
    candidateId: approval.candidateId,
    approvalHash: reviewedApprovalHash(approval),
    publishedRevision: existing.revision,
    publishedHash: reviewedPublishedHash(existing),
  };
}
describe("Repeated imports preserve reviewed published editions", () => {
  it("retains a corrected payload, source group, receipt, and metadata when its old source approval is unchanged", () => {
    const existing = {
      ...fixture,
      sourceTextId: "reviewed-source-group",
      ruleElements: [
        {
          ruleIndex: 0,
          position: 1,
          rulePath: "/theory/slovosochetaniya/?exam=OGE#algorithm",
          errorType: "rule-identification",
          skillIds: ["reviewed-rule"],
        },
      ],
      shortAnswerConstraints: { requiredWords: ["прогулки"] },
    };
    const rebuilt = {
      ...fixture,
      text: "obsolete raw extraction",
      explanation: "obsolete explanation",
      sourceTextId: undefined,
      shortAnswerConstraints: undefined,
    };
    expect(
      mergeReviewedImport(existing, rebuilt, approval, locked(existing)),
    ).toBe(existing);
  });
  it("rejects changed approval at the same revision even when somebody copies an old receipt", () => {
    const changed = { ...approval, answer: "другой ключ" };
    expect(() =>
      mergeReviewedImport(fixture, fixture, changed, locked()),
    ).toThrow(/requires a revision/u);
  });
  it("accepts changed content only above the published revision with the matching new receipt", () => {
    const revision = fixture.revision + 1;
    const updated = {
      ...fixture,
      revision,
      explanation: "Независимо проверенное новое объяснение.",
      publicationReview: { ...fixture.publicationReview!, revision },
    };
    expect(
      mergeReviewedImport(
        fixture,
        updated,
        { ...approval, revision },
        locked(),
      ),
    ).toBe(updated);
  });
  it("rejects a higher revision carrying a receipt from its predecessor", () => {
    const revision = fixture.revision + 1;
    expect(() =>
      mergeReviewedImport(
        fixture,
        { ...fixture, revision },
        { ...approval, revision },
        locked(),
      ),
    ).toThrow(/independent receipt/u);
  });
  it("detects a silent edit of a locked published condition while allowing derived feedback metadata", () => {
    const lock = locked();
    expect(() =>
      mergeReviewedImport(
        { ...fixture, prompt: "silently changed" },
        fixture,
        approval,
        lock,
      ),
    ).toThrow(/without a higher reviewed revision/u);
    const enriched = {
      ...fixture,
      skillIds: ["new-derived-tag"],
      shortAnswerConstraints: { requiredWords: ["прогулки"] },
    };
    expect(mergeReviewedImport(enriched, fixture, approval, lock)).toBe(
      enriched,
    );
  });
  it("requires a revision receipt for a newly admitted id and a lock for an existing one", () => {
    const newItem = {
      ...fixture,
      id: "new-exercise",
      publicationReview: undefined,
    };
    expect(() =>
      mergeReviewedImport(undefined, newItem, approval, undefined),
    ).toThrow(/new exercise requires/u);
    expect(() =>
      mergeReviewedImport(fixture, fixture, approval, undefined),
    ).toThrow(/missing publication lock/u);
  });
});
