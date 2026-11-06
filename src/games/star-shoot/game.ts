import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export interface Gun {
  id: string;
  name: string;
  /** What the card says after the ammo count. */
  blurb: string;
  /** BBs (or shells) in the gun for the whole round on Hard. */
  rounds: number;
  /** BBs fired per pull of the trigger. */
  pellets: number;
  /** Radius of the hole one BB tears in the paper on Hard, in pixels. */
  holeRadius: number;
  /** How far a BB can land from the aim point, in pixels. */
  spread: number;
  /** Seconds between shots while the trigger is held, or 0 for one shot per click. */
  autoInterval: number;
}

export const GUNS: readonly Gun[] = [
  {
    id: 'plinker',
    name: 'Plinker',
    blurb: 'BBs, dead accurate',
    rounds: 100,
    pellets: 1,
    holeRadius: 7,
    spread: 0,
    autoInterval: 0,
  },
  {
    id: 'repeater',
    name: 'Repeater',
    blurb: 'BBs, hold to fire, wobbly',
    rounds: 250,
    pellets: 1,
    holeRadius: 6,
    spread: 10,
    autoInterval: 0.08,
  },
  {
    id: 'scattergun',
    name: 'Scattergun',
    blurb: 'shells of 6 BBs each',
    rounds: 30,
    pellets: 6,
    holeRadius: 6,
    spread: 22,
    autoInterval: 0,
  },
];

export interface Difficulty {
  id: string;
  name: string;
  blurb: string;
  /** Each gun's ammo is multiplied by this. */
  ammoScale: number;
  /** Each gun's hole radius is multiplied by this. */
  holeScale: number;
  /** Share of the red that counts as the star shot out, so stray specks don't block the bonus. */
  shotOutAt: number;
  /** Every point scored is multiplied by this, so the shared high score stays fair. */
  multiplier: number;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  {
    id: 'easy',
    name: 'Easy',
    blurb: 'Double ammo, huge holes',
    ammoScale: 2,
    holeScale: 3,
    shotOutAt: 0.9,
    multiplier: 0.5,
  },
  {
    id: 'normal',
    name: 'Normal',
    blurb: 'Big holes',
    ammoScale: 1,
    holeScale: 2,
    shotOutAt: 0.97,
    multiplier: 1,
  },
  {
    id: 'hard',
    name: 'Hard',
    blurb: 'Tiny holes, every bit of red',
    ammoScale: 1,
    holeScale: 1,
    shotOutAt: 1,
    multiplier: 2,
  },
];

const cards = <T>(items: readonly T[]) =>
  items.map((item, i) => ({ item, x: 70 + i * 230, y: 200, width: 200, height: 140 }));

/** The difficulty buttons on the first screen. */
export const DIFFICULTY_BUTTONS = cards(DIFFICULTIES).map(({ item, ...box }) => ({
  difficulty: item,
  ...box,
}));

/** The gun buttons on the choosing screen. */
export const GUN_BUTTONS = cards(GUNS).map(({ item, ...box }) => ({ gun: item, ...box }));

/** The button on the gun screen that goes back to the difficulty choice. */
export const CHANGE_DIFFICULTY_BUTTON = { x: 300, y: 380, width: 200, height: 44 };

export const STAR = { x: WIDTH / 2, y: 260, outer: 150, inner: 150 * 0.382 } as const;
export const CELL = 4;
const GRID_X = STAR.x - STAR.outer;
const GRID_Y = STAR.y - STAR.outer;
const GRID_SIZE = Math.ceil((STAR.outer * 2) / CELL);

export const BONUS_TIME = 30;
export const CLOWN_POINTS = 50;
export const MAX_ESCAPES = 3;
/** Fraction of the distance to the player a clown walks each second. */
export const CLOWN_SPEED = 0.25;
const SPAWN_INTERVAL = 1.1;

export interface Hole {
  x: number;
  y: number;
  radius: number;
}

export interface Clown {
  /** Across the field, from -1 (left) to 1 (right). */
  lane: number;
  /** Distance from the player, from 1 (far away) to 0 (in your face). */
  z: number;
}

export interface Boom {
  x: number;
  y: number;
  size: number;
  age: number;
}

export interface StarShootState {
  phase: 'difficulty' | 'choosing' | 'shooting' | 'bonus' | 'over';
  difficulty: Difficulty | undefined;
  gun: Gun | undefined;
  rounds: number;
  /** One flag per grid cell: true while that bit of the star is still red. */
  red: boolean[];
  redTotal: number;
  redLeft: number;
  holes: Hole[];
  /** Where the trigger is held for an automatic gun, if it is. */
  trigger: { x: number; y: number } | undefined;
  cooldown: number;
  score: number;
  clowns: Clown[];
  booms: Boom[];
  bonusLeft: number;
  spawnIn: number;
  escaped: number;
  clownsBlown: number;
  /** True once the final score has been handed to the score board. */
  scoreClaimed: boolean;
}

function starPoints(): { x: number; y: number }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? STAR.outer : STAR.inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return { x: STAR.x + Math.cos(angle) * radius, y: STAR.y + Math.sin(angle) * radius };
  });
}

export function isInStar(x: number, y: number): boolean {
  const points = starPoints();
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function cellCentre(index: number) {
  return {
    x: GRID_X + (index % GRID_SIZE) * CELL + CELL / 2,
    y: GRID_Y + Math.floor(index / GRID_SIZE) * CELL + CELL / 2,
  };
}

/**
 * A fresh round. With a difficulty, such as the last one played, it starts on
 * the gun choice; without one, it starts on the difficulty choice.
 */
export function createState(difficulty?: Difficulty): StarShootState {
  const red = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
    const { x, y } = cellCentre(i);
    return isInStar(x, y);
  });
  const redTotal = red.filter(Boolean).length;
  return {
    phase: difficulty ? 'choosing' : 'difficulty',
    difficulty,
    gun: undefined,
    rounds: 0,
    red,
    redTotal,
    redLeft: redTotal,
    holes: [],
    trigger: undefined,
    cooldown: 0,
    score: 0,
    clowns: [],
    booms: [],
    bonusLeft: BONUS_TIME,
    spawnIn: 0,
    escaped: 0,
    clownsBlown: 0,
    scoreClaimed: false,
  };
}

export function chooseDifficulty(state: StarShootState, difficultyId: string): boolean {
  const difficulty = DIFFICULTIES.find((d) => d.id === difficultyId);
  if (state.phase !== 'difficulty' || !difficulty) return false;
  state.difficulty = difficulty;
  state.phase = 'choosing';
  return true;
}

/** Goes back from the gun choice to the difficulty choice. */
export function changeDifficulty(state: StarShootState): boolean {
  if (state.phase !== 'choosing') return false;
  state.phase = 'difficulty';
  return true;
}

/** The ammo a gun holds on a difficulty. */
export function gunRounds(gun: Gun, difficulty: Difficulty | undefined): number {
  return gun.rounds * (difficulty?.ammoScale ?? 1);
}

/** The radius of the hole a gun's BB tears on a difficulty. */
export function holeRadius(gun: Gun, difficulty: Difficulty | undefined): number {
  return gun.holeRadius * (difficulty?.holeScale ?? 1);
}

/** What a gun's card says on a difficulty, such as "200 BBs, dead accurate". */
export function gunBlurb(gun: Gun, difficulty: Difficulty | undefined): string {
  return `${gunRounds(gun, difficulty)} ${gun.blurb}`;
}

/** The subtitle on the gun choice: what it takes to shoot out the star. */
export function finishHint(difficulty: Difficulty | undefined): string {
  const at = difficulty?.shotOutAt ?? 1;
  return at >= 1
    ? 'Shoot out every bit of red in the star'
    : `Shoot out ${Math.round(at * 100)}% of the red in the star`;
}

export function chooseGun(state: StarShootState, gunId: string): boolean {
  const gun = GUNS.find((g) => g.id === gunId);
  if (state.phase !== 'choosing' || !gun) return false;
  state.gun = gun;
  state.rounds = gunRounds(gun, state.difficulty);
  state.phase = 'shooting';
  return true;
}

/** Space kept clear between a card's edge and its text, in pixels. */
export const CARD_PADDING = 12;

/**
 * Breaks text into lines no wider than maxWidth, as measured by measure, so a
 * card's text stays inside the card. A single word wider than maxWidth gets a
 * line of its own.
 */
export function fitLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && measure(`${last} ${word}`) <= maxWidth) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

/** The hint on a card: touch screens have no keys to press. */
export function gunHint(index: number, touch: boolean): string {
  return touch ? 'Tap' : `Click or press ${index + 1}`;
}

/** The difficulty whose button is at (x, y) on the difficulty screen, if any. */
export function difficultyAt(x: number, y: number): Difficulty | undefined {
  return DIFFICULTY_BUTTONS.find(
    (b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height,
  )?.difficulty;
}

/** True if (x, y) is on the gun screen's "Change difficulty" button. */
export function isOnChangeDifficulty(x: number, y: number): boolean {
  const b = CHANGE_DIFFICULTY_BUTTON;
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

/** The gun whose button is at (x, y) on the choosing screen, if any. */
export function gunAt(x: number, y: number): Gun | undefined {
  return GUN_BUTTONS.find((b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height)
    ?.gun;
}

/** Share of the star's red that has been shot out, from 0 to 1. */
export function clearedFraction(state: StarShootState): number {
  return state.redTotal === 0 ? 1 : 1 - state.redLeft / state.redTotal;
}

/** True once enough red is gone for the star to count as shot out. */
export function isShotOut(state: StarShootState): boolean {
  return clearedFraction(state) >= (state.difficulty?.shotOutAt ?? 1) - 1e-9;
}

/** Points scaled by the difficulty's multiplier. */
export function scaled(state: StarShootState, points: number): number {
  return Math.round(points * (state.difficulty?.multiplier ?? 1));
}

/** 10 points for every whole 1% of red shot out, before the difficulty's multiplier. */
export function starScore(state: StarShootState): number {
  return 10 * Math.floor(clearedFraction(state) * 100 + 1e-9);
}

/** Tears a hole in the paper and clears every bit of red inside it. */
export function punch(state: StarShootState, x: number, y: number, radius: number): number {
  state.holes.push({ x, y, radius });
  const reach = radius + CELL;
  const minCol = Math.max(0, Math.floor((x - reach - GRID_X) / CELL));
  const maxCol = Math.min(GRID_SIZE - 1, Math.floor((x + reach - GRID_X) / CELL));
  const minRow = Math.max(0, Math.floor((y - reach - GRID_Y) / CELL));
  const maxRow = Math.min(GRID_SIZE - 1, Math.floor((y + reach - GRID_Y) / CELL));
  let cleared = 0;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const index = row * GRID_SIZE + col;
      if (!state.red[index]) continue;
      const centre = cellCentre(index);
      if (Math.hypot(centre.x - x, centre.y - y) <= radius) {
        state.red[index] = false;
        cleared += 1;
      }
    }
  }
  state.redLeft -= cleared;
  return cleared;
}

/**
 * Fires one pull of the trigger at the aim point. `random` returns numbers in
 * [0, 1) and decides where each BB lands within the gun's spread. Returns
 * false if nothing fired.
 */
export function fire(
  state: StarShootState,
  aimX: number,
  aimY: number,
  random: () => number = Math.random,
): boolean {
  const { gun } = state;
  if (state.phase !== 'shooting' || !gun || state.rounds === 0) return false;
  for (let i = 0; i < gun.pellets; i++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * gun.spread;
    punch(
      state,
      aimX + Math.cos(angle) * distance,
      aimY + Math.sin(angle) * distance,
      holeRadius(gun, state.difficulty),
    );
  }
  state.rounds -= 1;
  endShootingIfDone(state);
  return true;
}

/**
 * Presses the trigger at the aim point. Every press fires at once; an
 * automatic gun then keeps firing from `step` until `releaseTrigger`.
 */
export function pullTrigger(
  state: StarShootState,
  aimX: number,
  aimY: number,
  random: () => number = Math.random,
): boolean {
  if (!fire(state, aimX, aimY, random)) return false;
  if (state.phase === 'shooting' && state.gun?.autoInterval) {
    state.trigger = { x: aimX, y: aimY };
    state.cooldown = state.gun.autoInterval;
  }
  return true;
}

export function releaseTrigger(state: StarShootState): void {
  state.trigger = undefined;
}

/** The final score, once, when the round is over; undefined otherwise. */
export function claimFinalScore(state: StarShootState): number | undefined {
  if (state.phase !== 'over' || state.scoreClaimed) return undefined;
  state.scoreClaimed = true;
  return state.score;
}

function endShootingIfDone(state: StarShootState) {
  if (isShotOut(state)) {
    // Star shot out: every round left over is worth 10, then the clowns come.
    state.score = scaled(state, starScore(state) + 10 * state.rounds);
    state.phase = 'bonus';
    state.trigger = undefined;
  } else if (state.rounds === 0) {
    state.score = scaled(state, starScore(state));
    state.phase = 'over';
    state.trigger = undefined;
  }
}

/** Where a clown is on screen, and how big it looks from where you stand. */
export function clownOnScreen(clown: Clown) {
  const scale = 0.25 + 0.75 * (1 - clown.z);
  return {
    x: WIDTH / 2 + clown.lane * (WIDTH * 0.4) * scale,
    y: 170 + 230 * (1 - clown.z),
    radius: 70 * scale,
  };
}

/** Shoots at (x, y) in the bonus round. The nearest clown under the shot blows up. */
export function shootClown(state: StarShootState, x: number, y: number): boolean {
  if (state.phase !== 'bonus') return false;
  const hit = state.clowns
    .filter((clown) => {
      const at = clownOnScreen(clown);
      return Math.hypot(at.x - x, at.y - y) <= at.radius;
    })
    .sort((a, b) => a.z - b.z)[0];
  if (!hit) return false;
  const at = clownOnScreen(hit);
  state.booms.push({ x: at.x, y: at.y, size: at.radius, age: 0 });
  state.clowns = state.clowns.filter((c) => c !== hit);
  state.score += scaled(state, CLOWN_POINTS);
  state.clownsBlown += 1;
  return true;
}

/** Advances the game by `dt` seconds. */
export function step(state: StarShootState, dt: number, random: () => number = Math.random): void {
  for (const boom of state.booms) boom.age += dt;
  state.booms = state.booms.filter((b) => b.age < 0.5);

  if (state.phase === 'shooting' && state.trigger && state.gun?.autoInterval) {
    state.cooldown -= dt;
    while (state.cooldown <= 0 && state.phase === 'shooting') {
      fire(state, state.trigger.x, state.trigger.y, random);
      state.cooldown += state.gun.autoInterval;
    }
  }

  if (state.phase !== 'bonus') return;
  state.bonusLeft = Math.max(0, state.bonusLeft - dt);
  state.spawnIn -= dt;
  if (state.spawnIn <= 0) {
    state.clowns.push({ lane: random() * 2 - 1, z: 1 });
    state.spawnIn += SPAWN_INTERVAL;
  }
  for (const clown of state.clowns) clown.z -= CLOWN_SPEED * dt;
  const arrived = state.clowns.filter((c) => c.z <= 0).length;
  state.escaped += arrived;
  state.clowns = state.clowns.filter((c) => c.z > 0);
  if (state.bonusLeft === 0 || state.escaped >= MAX_ESCAPES) {
    state.phase = 'over';
    state.clowns = [];
  }
}

function drawCards(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  buttons: { x: number; y: number; width: number; height: number; name: string; blurb: string }[],
  touch: boolean,
) {
  const { colors } = theme;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText(title, WIDTH / 2, 130);
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('body');
  ctx.fillText(subtitle, WIDTH / 2, 165);
  buttons.forEach((button, i) => {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(button.x, button.y, button.width, button.height);
    const cx = button.x + button.width / 2;
    const inner = button.width - CARD_PADDING * 2;
    const measure = (text: string) => ctx.measureText(text).width;
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('title', 'bold');
    if (measure(button.name) > inner) ctx.font = canvasFont('body', 'bold');
    ctx.fillText(button.name, cx, button.y + 55);
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small');
    const lines = fitLines(button.blurb, inner, measure);
    const lineHeight = theme.font.small + 4;
    const top = button.y + 90 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, n) => ctx.fillText(line, cx, top + n * lineHeight));
    ctx.fillText(gunHint(i, touch), cx, button.y + 126);
  });
}

function drawDifficulty(ctx: CanvasRenderingContext2D, touch: boolean) {
  const buttons = DIFFICULTY_BUTTONS.map((b) => ({
    ...b,
    name: b.difficulty.name,
    blurb: `${b.difficulty.blurb}, scores x${b.difficulty.multiplier}`,
  }));
  drawCards(ctx, 'Choose a difficulty', 'Easy is kind to phones', buttons, touch);
}

function drawChoosing(ctx: CanvasRenderingContext2D, state: StarShootState, touch: boolean) {
  const { colors } = theme;
  const buttons = GUN_BUTTONS.map((b) => ({
    ...b,
    name: b.gun.name,
    blurb: gunBlurb(b.gun, state.difficulty),
  }));
  drawCards(ctx, 'Choose your gun', finishHint(state.difficulty), buttons, touch);
  const b = CHANGE_DIFFICULTY_BUTTON;
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x, b.y, b.width, b.height);
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.fillText(
    `${state.difficulty?.name ?? ''}: ${touch ? 'tap' : 'click or press D'} to change`,
    b.x + b.width / 2,
    b.y + 27,
  );
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  state: StarShootState,
  aim: { x: number; y: number },
) {
  const { colors } = theme;
  ctx.fillStyle = colors.wood;
  ctx.fillRect(STAR.x - 4, STAR.y + STAR.outer + 40, 8, HEIGHT);
  const paper = STAR.outer + 40;
  ctx.fillStyle = colors.stripeB;
  ctx.fillRect(STAR.x - paper, STAR.y - paper, paper * 2, paper * 2);

  ctx.fillStyle = colors.stripeA;
  state.red.forEach((isRed, i) => {
    if (!isRed) return;
    const { x, y } = cellCentre(i);
    ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  });

  // Torn paper shows the booth behind it.
  ctx.fillStyle = colors.background;
  for (const hole of state.holes) {
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sight.
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(aim.x, aim.y, 12, 0, Math.PI * 2);
  ctx.moveTo(aim.x - 18, aim.y);
  ctx.lineTo(aim.x + 18, aim.y);
  ctx.moveTo(aim.x, aim.y - 18);
  ctx.lineTo(aim.x, aim.y + 18);
  ctx.stroke();

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Red shot out ${Math.floor(clearedFraction(state) * 100)}%`, 16, HEIGHT - 20);
  ctx.textAlign = 'right';
  ctx.fillText(`${state.gun?.name ?? ''} ${state.rounds} left`, WIDTH - 16, HEIGHT - 20);
}

function drawClown(ctx: CanvasRenderingContext2D, clown: Clown) {
  const { colors } = theme;
  const { x, y, radius } = clownOnScreen(clown);
  // Hair.
  ctx.fillStyle = colors.water;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + side * radius * 0.85, y - radius * 0.3, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rotten face.
  ctx.fillStyle = colors.muted;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  // Hollow eyes.
  ctx.fillStyle = colors.background;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + side * radius * 0.35, y - radius * 0.2, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nose and grin.
  ctx.fillStyle = colors.danger;
  ctx.beginPath();
  ctx.arc(x, y + radius * 0.1, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.stripeA;
  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.beginPath();
  ctx.arc(x, y + radius * 0.2, radius * 0.5, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

function drawBonus(
  ctx: CanvasRenderingContext2D,
  state: StarShootState,
  aim: { x: number; y: number },
) {
  const { colors } = theme;
  // A dark midway stretching away to the horizon.
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 160, WIDTH, HEIGHT - 160);
  ctx.strokeStyle = colors.wood;
  ctx.lineWidth = 2;
  for (const lane of [-1.4, -0.7, 0, 0.7, 1.4]) {
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 + lane * 40, 160);
    ctx.lineTo(WIDTH / 2 + lane * 400, HEIGHT);
    ctx.stroke();
  }

  [...state.clowns].sort((a, b) => b.z - a.z).forEach((clown) => drawClown(ctx, clown));

  ctx.lineWidth = 4;
  for (const boom of state.booms) {
    ctx.globalAlpha = 1 - boom.age / 0.5;
    ctx.strokeStyle = boom.age < 0.2 ? colors.accent : colors.danger;
    ctx.beginPath();
    ctx.arc(boom.x, boom.y, boom.size * (1 + boom.age * 3), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Gun barrel from the bottom of the screen.
  ctx.fillStyle = colors.wood;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 30, HEIGHT);
  ctx.lineTo(aim.x * 0.2 + WIDTH * 0.4 - 8, HEIGHT - 90);
  ctx.lineTo(aim.x * 0.2 + WIDTH * 0.4 + 8, HEIGHT - 90);
  ctx.lineTo(WIDTH / 2 + 30, HEIGHT);
  ctx.fill();

  ctx.strokeStyle = colors.danger;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(aim.x, aim.y, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, 30);
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.accent;
  ctx.fillText('BONUS: blow up the zombie clowns!', WIDTH / 2, 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = colors.text;
  ctx.fillText(
    `${Math.ceil(state.bonusLeft)}s  Got through ${state.escaped}/${MAX_ESCAPES}`,
    WIDTH - 16,
    30,
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  state: StarShootState,
  aim: { x: number; y: number },
  touch: boolean,
) {
  const { colors } = theme;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (state.phase !== 'bonus') {
    const stripe = WIDTH / 16;
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
      ctx.fillRect(i * stripe, 0, stripe, 40);
    }
  }

  if (state.phase === 'difficulty') drawDifficulty(ctx, touch);
  else if (state.phase === 'choosing') drawChoosing(ctx, state, touch);
  else if (state.phase === 'bonus') drawBonus(ctx, state, aim);
  else drawStar(ctx, state, aim);

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    const headline = isShotOut(state)
      ? `Star shot out! ${state.clownsBlown} clowns down. You scored ${state.score}`
      : `Out of BBs! You scored ${state.score}`;
    ctx.fillText(headline, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText(
      `${state.difficulty?.name ?? ''} difficulty, scores x${state.difficulty?.multiplier ?? 1}`,
      WIDTH / 2,
      HEIGHT / 2 + 40,
    );
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 75);
  }
}

export const starShoot: CarnivalGame = {
  id: 'star-shoot',
  name: 'Star Shoot',
  description: 'Pick a BB gun and shoot every bit of red out of the paper star.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    const aim = { x: WIDTH / 2, y: HEIGHT / 2 };
    let touch = window.matchMedia('(pointer: coarse)').matches;
    const recordIfOver = () => {
      const score = claimFinalScore(state);
      if (score !== undefined) recordScore(starShoot.id, score);
    };

    const toCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    };
    const onMove = (event: PointerEvent) => {
      Object.assign(aim, toCanvas(event));
      if (state.trigger) Object.assign(state.trigger, aim);
    };
    const onDown = (event: PointerEvent) => {
      touch = event.pointerType !== 'mouse';
      Object.assign(aim, toCanvas(event));
      if (state.phase === 'over') {
        recordIfOver();
        state = createState(state.difficulty);
      } else if (state.phase === 'difficulty') {
        const difficulty = difficultyAt(aim.x, aim.y);
        if (difficulty) chooseDifficulty(state, difficulty.id);
      } else if (state.phase === 'choosing') {
        const gun = gunAt(aim.x, aim.y);
        if (gun) chooseGun(state, gun.id);
        else if (isOnChangeDifficulty(aim.x, aim.y)) changeDifficulty(state);
      } else if (state.phase === 'bonus') {
        shootClown(state, aim.x, aim.y);
      } else {
        pullTrigger(state, aim.x, aim.y);
      }
    };
    const onUp = () => {
      releaseTrigger(state);
    };
    const onKey = (event: KeyboardEvent) => {
      if (state.phase === 'difficulty') {
        const difficulty = DIFFICULTIES[Number(event.key) - 1];
        if (difficulty) chooseDifficulty(state, difficulty.id);
      } else if (event.key.toLowerCase() === 'd') {
        changeDifficulty(state);
      } else {
        const gun = GUNS[Number(event.key) - 1];
        if (gun) chooseGun(state, gun.id);
      }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
    window.addEventListener('keydown', onKey);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      recordIfOver();
      draw(ctx, state, aim, touch);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      recordIfOver();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      window.removeEventListener('keydown', onKey);
    };
  },
};

export default starShoot;
