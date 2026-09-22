import assert from "node:assert/strict";
import {
  assertGroundedReviewPaperContract,
  assertReviewPaperDifficulty,
  FUNCTION_REVIEW_SECTION_IDS,
} from "../../artifacts/api-server/src/lib/review-paper-contract";

assert.doesNotThrow(() => assertReviewPaperDifficulty("advanced"));
assert.throws(
  () => assertReviewPaperDifficulty("intermediate"),
  /must explicitly declare advanced difficulty/,
);

const validSections = FUNCTION_REVIEW_SECTION_IDS.map((id) => ({
  id,
  points: 2,
  prompt: `مطلوب مستخرج من المصدر لمسار ${id}.`,
  sourceNodeIds: ["node-1"],
  evidence: "معلومة مسترجعة",
}));

assert.doesNotThrow(() =>
  assertGroundedReviewPaperContract(
    validSections,
    20,
    [{ id: "node-1", document: "هذه معلومة مسترجعة من المصدر." }],
  ),
);

const missingSectionCitation = validSections.map((section, index) =>
  index === 6 ? { ...section, sourceNodeIds: [] } : section,
);
assert.throws(
  () => assertGroundedReviewPaperContract(
    missingSectionCitation,
    20,
    [{ id: "node-1", document: "هذه معلومة مسترجعة من المصدر." }],
  ),
  /matching retrieved evidence/,
);

const unknownSectionCitation = validSections.map((section, index) =>
  index === 7 ? { ...section, sourceNodeIds: ["not-retrieved"] } : section,
);
assert.throws(
  () => assertGroundedReviewPaperContract(
    unknownSectionCitation,
    20,
    [{ id: "node-1", document: "هذه معلومة مسترجعة من المصدر." }],
  ),
  /matching retrieved evidence/,
);

console.log("Review paper grounding contract passed");