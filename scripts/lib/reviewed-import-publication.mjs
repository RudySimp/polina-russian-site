import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { admissionPayload, publicationAdmission } from "../../apps/showcase/src/content/publication-admission.mjs";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const reviewedApprovalHash = (approval) => sha256(JSON.stringify(approval));
export const reviewedPublishedHash = (exercise) => sha256(admissionPayload(exercise));
export function mergeReviewedImport(existing, proposed, approval, lock) {
  const currentApprovalHash = reviewedApprovalHash(approval);
  if (!existing) {
    assert(proposed.publicationReview && publicationAdmission(proposed), proposed.id + ": a new exercise requires an independent revision receipt");
    return proposed;
  }
  assert(lock, proposed.id + ": missing publication lock; preserve current material and review before importing");
  assert.equal(lock.candidateId, approval.candidateId);
  if (lock.approvalHash === currentApprovalHash) {
    if (reviewedPublishedHash(existing) !== lock.publishedHash) {
      assert(existing.revision > lock.publishedRevision && existing.publicationReview && publicationAdmission(existing), existing.id + ": existing published condition changed without a higher reviewed revision");
    }
    // A previously corrected, independently published edition remains authoritative.
    // Rebuilding its old source approval must not erase corrections or feedback metadata.
    return existing;
  }
  assert(proposed.revision > existing.revision, proposed.id + ": changed approval requires a revision above the current published edition");
  assert(proposed.publicationReview && publicationAdmission(proposed), proposed.id + ": changed condition requires an independent receipt for the new revision");
  return proposed;
}
