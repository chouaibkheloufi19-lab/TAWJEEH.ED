const TEX_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  approx: "≈",
  pm: "±",
  mp: "∓",
  cdot: "·",
  times: "×",
  div: "÷",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  cup: "∪",
  cap: "∩",
  forall: "∀",
  exists: "∃",
  partial: "∂",
  sum: "∑",
  prod: "∏",
  int: "∫",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  ln: "ln",
  log: "log",
  exp: "exp",
  lim: "lim",
};

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "−": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "−": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  n: "ₙ",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

function formatScript(
  value: string,
  symbols: Record<string, string>,
  fallback: "^" | "_",
): string {
  const characters = Array.from(value);
  const converted = characters.map((character) => symbols[character]);
  return converted.every(Boolean)
    ? converted.join("")
    : `${fallback}(${value})`;
}

function formatScriptGroup(
  text: string,
  marker: "^" | "_",
  symbols: Record<string, string>,
): string {
  const expression = marker === "^" ? "\\^" : "_";
  const pattern = new RegExp(`${expression}\\{([^{}]+)\\}`, "g");
  return text.replace(pattern, (_match, script: string) =>
    formatScript(script, symbols, marker),
  );
}

/**
 * Converts common generated TeX into ordinary school notation before it
 * reaches the learner-facing exam or correction.
 */
export function normalizeStudentMathText(value: string): string {
  let text = value
    // A bare LaTeX fraction in JSON can be parsed as the JSON form-feed escape.
    .replace(/\u000c(?=rac\b)/g, "\\frac")
    .replace(/\u0000/g, "")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .replace(/\$\$?/g, "")
    .replace(/\\\\/g, "\n")
    .replace(/\\(?:quad|qquad|enspace|thinspace|,|;|:|!)/g, " ")
    .replace(/\\(?:left|right|displaystyle|textstyle|scriptstyle|limits|nolimits)\b/g, "")
    .replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:\{|})/g, (match) => (match.endsWith("{") ? "{" : "}"))
    .replace(/\\([_$%#&])/g, "$1");

  for (let pass = 0; pass < 10; pass += 1) {
    const next = text.replace(
      /\\(?:text|mathrm|mathbf|mathit|mathnormal|operatorname|mathcal)\s*\{([^{}]*)\}/g,
      "$1",
    );
    if (next === text) break;
    text = next;
  }

  text = text.replace(/\\mathbb\s*\{([RNCZQ])\}/g, (_match, symbol: string) => {
    const numberSets: Record<string, string> = {
      R: "ℝ",
      N: "ℕ",
      C: "ℂ",
      Z: "ℤ",
      Q: "ℚ",
    };
    return numberSets[symbol] ?? symbol;
  });

  for (let pass = 0; pass < 10; pass += 1) {
    const next = text.replace(
      /\\(?:dfrac|tfrac|cfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      "($1) / ($2)",
    );
    if (next === text) break;
    text = next;
  }

  text = text
    .replace(
      /\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]*)\}/g,
      (_match, index: string, radicand: string) =>
        `${formatScript(index, SUPERSCRIPT, "^")}√(${radicand})`,
    )
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");

  for (const [command, symbol] of Object.entries(TEX_SYMBOLS)) {
    text = text.replace(
      new RegExp(`\\\\${command}(?![A-Za-z])`, "g"),
      symbol,
    );
  }

  text = formatScriptGroup(text, "^", SUPERSCRIPT);
  text = formatScriptGroup(text, "_", SUBSCRIPT);
  text = text
    .replace(/\^([0-9]+)/g, (_match, script: string) =>
      formatScript(script, SUPERSCRIPT, "^"),
    )
    .replace(/_([0-9]+)/g, (_match, script: string) =>
      formatScript(script, SUBSCRIPT, "_"),
    )
    .replace(
      /([A-Za-z0-9₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹)\]])\s*=\s*/g,
      "$1 = ",
    )
    .replace(
      /([A-Za-z0-9₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹)])([+-])(?=[A-Za-z0-9₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹(])/g,
      "$1 $2 ",
    )
    .replace(/\s*&\s*/g, "")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

export function containsRawMathMarkup(value: string): boolean {
  return (
    value.includes("$") ||
    /\\[A-Za-z]+|\\[()[\]{}]/u.test(value) ||
    /\b(?:dfrac|tfrac|cfrac|frac|sqrt|begin|end)\s*\{/i.test(value) ||
    /`{1,3}/.test(value)
  );
}