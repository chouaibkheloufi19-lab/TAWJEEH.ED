import katex from 'katex';
import { Fragment, type ReactNode } from 'react';
import 'katex/dist/katex.min.css';

type MathTextProps = {
  children?: ReactNode;
  className?: string;
  block?: boolean;
};

type MathToken = {
  expression: string;
  displayMode: boolean;
};

const EXPLICIT_MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\$)[^$\n]+(?<!\$)\$(?!\$))/g;
const TEX_COMMAND_PATTERN = /\\(?:frac|sqrt|sum|prod|int|lim|cdot|times|div|leq|geq|neq|approx|alpha|beta|gamma|delta|theta|pi|in|mathbb|mathrm|text)\b/;
const PLAIN_FORMULA_PATTERN = /(?:[A-Za-z]\s*\([^()\n]{1,24}\)|[A-Za-z](?:\s*[_^]\s*[A-Za-z0-9{}]+)?)\s*(?:=|≤|≥|≠|≈)\s*[A-Za-z0-9À-ÿ₀-₉\s+\-*/^().{},\\×÷]+/;
const BIDI_TOKEN_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’\-][A-Za-zÀ-ÖØ-öø-ÿ]+)*|\d+(?:[.,]\d+)?/g;

function consumeBalancedGroup(value: string, start: number) {
  if (value[start] !== '{') return start;
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === '{') depth += 1;
    if (value[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return start;
}

function findUnwrappedTex(value: string, from: number) {
  const match = value.slice(from).match(TEX_COMMAND_PATTERN);
  if (!match || match.index === undefined) return null;
  const start = from + match.index;
  let end = start + match[0].length;
  while (/\s/.test(value[end] ?? '')) end += 1;
  while (value[end] === '{') {
    const next = consumeBalancedGroup(value, end);
    if (next === end) break;
    end = next;
    while (/\s/.test(value[end] ?? '')) end += 1;
  }
  while (/[A-Za-z0-9()[\]{}_^=+\-*/.,\s×÷]/.test(value[end] ?? '')) end += 1;
  return { start, end };
}

function unescapeDelimitedMath(value: string): MathToken {
  if (value.startsWith('$$') && value.endsWith('$$')) {
    return { expression: value.slice(2, -2).trim(), displayMode: true };
  }
  if (value.startsWith('\\[') && value.endsWith('\\]')) {
    return { expression: value.slice(2, -2).trim(), displayMode: true };
  }
  if (value.startsWith('\\(') && value.endsWith('\\)')) {
    return { expression: value.slice(2, -2).trim(), displayMode: false };
  }
  if (value.startsWith('$') && value.endsWith('$')) {
    return { expression: value.slice(1, -1).trim(), displayMode: false };
  }
  return { expression: value.trim(), displayMode: false };
}

function renderMath(token: MathToken, key: string) {
  if (!token.expression) return null;
  const html = katex.renderToString(token.expression, {
    displayMode: token.displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  });
  return (
    <span
      key={key}
      className={token.displayMode ? 'math-text-display' : 'math-text-inline'}
      dir="ltr"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderBidiText(value: string, keyPrefix: string): ReactNode[] {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(BIDI_TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (!token || start < cursor) continue;
    if (start > cursor) pieces.push(value.slice(cursor, start));
    pieces.push(
      <bdi key={`${keyPrefix}-bidi-${start}`} className="math-text-bidi" dir="ltr">
        {token}
      </bdi>,
    );
    cursor = start + token.length;
  }
  if (cursor < value.length) pieces.push(value.slice(cursor));
  return pieces.length ? pieces : [value];
}

function isLikelyFormula(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 260) return false;
  return TEX_COMMAND_PATTERN.test(trimmed)
    || (/[=^_×÷]/.test(trimmed) && PLAIN_FORMULA_PATTERN.test(trimmed));
}

function renderUnwrappedText(value: string, keyPrefix: string): ReactNode[] {
  const pieces: ReactNode[] = [];
  let cursor = 0;

  const rawFormula = findUnwrappedTex(value, cursor);
  const plainFormula = value.match(PLAIN_FORMULA_PATTERN);
  const candidates = [
    rawFormula,
    plainFormula?.index === undefined || !plainFormula[0]
      ? null
      : { start: plainFormula.index, end: plainFormula.index + plainFormula[0].length },
  ].filter((candidate): candidate is { start: number; end: number } => Boolean(candidate));
  const formula = candidates.sort((a, b) => a.start - b.start)[0];

  if (formula && formula.start >= cursor) {
    const before = value.slice(cursor, formula.start);
    if (before) pieces.push(...renderBidiText(before, `${keyPrefix}-before`));
    pieces.push(renderMath(
      { expression: value.slice(formula.start, formula.end).trim(), displayMode: false },
      `${keyPrefix}-formula-${formula.start}`,
    ));
    cursor = formula.end;
  }

  if (cursor === 0 && isLikelyFormula(value)) {
    pieces.push(renderMath({ expression: value.trim(), displayMode: true }, `${keyPrefix}-line`));
    return pieces;
  }
  if (cursor < value.length) pieces.push(...renderBidiText(value.slice(cursor), `${keyPrefix}-after`));
  return pieces.length ? pieces : [value];
}

function renderText(value: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(EXPLICIT_MATH_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    if (!raw || start < cursor) continue;

    const before = value.slice(cursor, start);
    if (before) {
      before.split(/(\n)/g).forEach((line, index) => {
        if (line === '\n') result.push(<br key={`${keyPrefix}-break-${start}-${index}`} />);
        else if (line) result.push(...renderUnwrappedText(line, `${keyPrefix}-text-${start}-${index}`));
      });
    }
    result.push(renderMath(unescapeDelimitedMath(raw), `${keyPrefix}-math-${start}`));
    cursor = start + raw.length;
  }

  const remainder = value.slice(cursor);
  if (remainder) {
    remainder.split(/(\n)/g).forEach((line, index) => {
      if (line === '\n') result.push(<br key={`${keyPrefix}-end-break-${index}`} />);
      else if (line) result.push(...renderUnwrappedText(line, `${keyPrefix}-end-${index}`));
    });
  }
  return result;
}

export function MathText({ children, className = '', block = false }: MathTextProps) {
  const value = children == null ? '' : String(children);
  if (!value) return null;
  const Tag = block ? 'div' : 'span';
  return (
    <Tag className={`math-text ${block ? 'math-text-block' : ''} ${className}`.trim()}>
      {renderText(value, 'math-text')}
    </Tag>
  );
}

export function MathTextList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={`${item}-${index}`}>
          <MathText className={className}>{item}</MathText>
        </Fragment>
      ))}
    </>
  );
}