import assert from "node:assert/strict";
import {
  assertGroundedScienceReviewPaperContract,
  SCIENCE_REVIEW_SECTION_IDS,
  selectGroundedScientificScenario,
} from "../../artifacts/api-server/src/lib/scientific-paper-contract";

const sourceText = [
  "يدرس تلميذ حركة عربة على مسار مستقيم. تنطلق العربة بسرعة ابتدائية 4 m/s،",
  "وتؤثر فيها قوة ثابتة مقدارها 12 N خلال مدة 3 s. كتلة العربة 2 kg،",
  "ونعتبر الاحتكاك مهملًا. نريد تحديد التسارع والسرعة النهائية ثم تفسير النتيجة.",
].join(" ");

const sources = [
  {
    id: "physics-node-1",
    document: sourceText,
    metadata: {
      subject: "العلوم الفيزيائية",
      lesson: "الحركة والقوى",
      content_type: "exercise",
    },
  },
];

const scenario = selectGroundedScientificScenario(
  sources,
  "الحركة والقوى",
  "العلوم الفيزيائية",
);

assert.ok(scenario, "A grounded scientific scenario should be selected");
assert.match(scenario.text, /4\s*m\/s/);
assert.match(scenario.text, /12\s*N/);

const sections = [
  ["data", 3, "عيّن السرعة الابتدائية والقوة والكتلة، واكتب الوحدات المستعملة."],
  ["law", 4, "اكتب القانون المناسب وعوّض بالمعطيات."],
  ["calculation", 5, "احسب التسارع ثم استنتج السرعة النهائية."],
  ["interpretation", 4, "تحقق من التجانس البعدي وقارن النتيجة بالمعطيات."],
  ["synthesis", 4, "استنتج النتيجة النهائية مع كتابة العلاقة والوحدة."],
] as const;

assert.deepEqual(
  sections.map(([id]) => id),
  SCIENCE_REVIEW_SECTION_IDS,
);

assert.doesNotThrow(() =>
  assertGroundedScienceReviewPaperContract(
    `تتحرك العربة بسرعة ابتدائية 4 m/s تحت تأثير قوة مقدارها 12 N وكتلتها 2 kg.`,
    sections.map(([id, points, prompt]) => ({
      id,
      points,
      prompt,
      sourceNodeIds: ["physics-node-1"],
      evidence: "تنطلق العربة بسرعة ابتدائية 4 m/s",
    })),
    20,
    sources,
  ),
);

assert.throws(
  () =>
    assertGroundedScienceReviewPaperContract(
      "تتحرك العربة بسرعة ابتدائية 4 m/s وتؤثر فيها قوة مقدارها 20 N.",
      sections.map(([id, points, prompt]) => ({
        id,
        points,
        prompt,
        sourceNodeIds: ["physics-node-1"],
        evidence: "تنطلق العربة بسرعة ابتدائية 4 m/s",
      })),
      20,
      sources,
    ),
  /Every numerical given in the science paper prompt must be supported/,
);

console.log("Scientific exercise generation contract passed");