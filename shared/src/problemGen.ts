import { randInt, type Rng } from './rng';
import type { GameSettings, Operation, Problem } from './types';

/** Display symbols, matching Zetamac's typography. */
export const OPERATION_SYMBOLS: Record<Operation, string> = {
  add: '+',
  sub: '−',
  mul: '×',
  div: '÷',
};

/**
 * Lists the operations turned on in the settings.
 * @param settings - Game settings.
 * @returns Enabled operations in a stable order.
 */
export function enabledOperations(settings: GameSettings): Operation[] {
  const ops: Operation[] = [];
  if (settings.addition.enabled) ops.push('add');
  if (settings.subtraction.enabled) ops.push('sub');
  if (settings.multiplication.enabled) ops.push('mul');
  if (settings.division.enabled) ops.push('div');
  return ops;
}

/**
 * Builds one problem for a specific operation.
 * @param op - Operation to use.
 * @param settings - Game settings with operand ranges.
 * @param id - Problem id.
 * @param rng - Random source.
 * @returns The generated problem.
 */
function buildProblem(op: Operation, settings: GameSettings, id: number, rng: Rng): Problem {
  const sym = OPERATION_SYMBOLS[op];
  if (op === 'add' || op === 'sub') {
    const r = settings.addition;
    const a = randInt(rng, r.aMin, r.aMax);
    const b = randInt(rng, r.bMin, r.bMax);
    return op === 'add'
      ? { id, op, text: `${a} ${sym} ${b}`, answer: a + b }
      : { id, op, text: `${a + b} ${sym} ${a}`, answer: b };
  }
  const r = settings.multiplication;
  const a = randInt(rng, r.aMin, r.aMax);
  const b = randInt(rng, r.bMin, r.bMax);
  return op === 'mul'
    ? { id, op, text: `${a} ${sym} ${b}`, answer: a * b }
    : { id, op, text: `${a * b} ${sym} ${a}`, answer: b };
}

/**
 * Generates a random problem from the enabled operations, avoiding an exact repeat of the previous one.
 * @param settings - Validated game settings.
 * @param id - Id to assign to the problem.
 * @param rng - Random source (defaults to Math.random).
 * @param previousText - Text of the previous problem, to avoid repeats.
 * @returns The generated problem.
 */
export function generateProblem(settings: GameSettings, id: number, rng: Rng = Math.random, previousText?: string): Problem {
  const ops = enabledOperations(settings);
  if (ops.length === 0) throw new Error('No operations enabled');
  let problem = buildProblem(ops[randInt(rng, 0, ops.length - 1)], settings, id, rng);
  for (let tries = 0; tries < 10 && problem.text === previousText; tries++) {
    problem = buildProblem(ops[randInt(rng, 0, ops.length - 1)], settings, id, rng);
  }
  return problem;
}
