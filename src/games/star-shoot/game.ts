import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export interface Gun {
  id: string;
  name: string;
  blurb: string;
  /** BBs (or shells) in the gun for the whole round. */
  rounds: number;
  /** BBs fired per pull of the trigger. */
  pellets: number;
  /** Radius of the hole one BB tears in the paper, in pixels. */
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
    blurb: '100 BBs, dead accurate',
    rounds: 100,
    pellets: 1,
    holeRadius: 7,
    spread: 0,
    autoInterval: 0,
  },
  {
    id: 'repeater',
    name: 'Repeater',
    blurb: '250 BBs, hold to fire, wobbly',
    rounds: 250,
    pellets: 1,
    holeRadius: 6,
    spread: 10,
    autoInterval: 0.08,
  },
  {
    id: 'scattergun',
    name: 'Scattergun',
    blurb: '30 shells of 6 BBs each',
    rounds: 30,
    pellets: 6,
    holeRadius: 6,
    spread: 22,
    autoInterval: 0,
  },
];

/** The gun buttons on the choosing screen. */
export const GUN_BUTTONS = GUNS.map((gun, i) => ({
  gun,
  x: 70 + i * 230,
  y: 200,
  width: 200,
  height: 140,
}));

export const STAR = { x: WIDTH / 2, y: 250, outer: 80, inner: 80 * 0.382 } as const;
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
  phase: 'choosing' | 'shooting' | 'bonus' | 'over';
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

export function createState(): StarShootState {
  const red = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
    const { x, y } = cellCentre(i);
    return isInStar(x, y);
  });
  const redTotal = red.filter(Boolean).length;
  return {
    phase: 'choosing',
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

export function chooseGun(state: StarShootState, gunId: string): boolean {
  const gun = GUNS.find((g) => g.id === gunId);
  if (state.phase !== 'choosing' || !gun) return false;
  state.gun = gun;
  state.rounds = gun.rounds;
  state.phase = 'shooting';
  return true;
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

/** 10 points for every whole 1% of red shot out. */
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
      gun.holeRadius,
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
  if (state.redLeft === 0) {
    // Star shot out: every round left over is worth 10, then the clowns come.
    state.score = starScore(state) + 10 * state.rounds;
    state.phase = 'bonus';
    state.trigger = undefined;
  } else if (state.rounds === 0) {
    state.score = starScore(state);
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
  state.score += CLOWN_POINTS;
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

function drawChoosing(ctx: CanvasRenderingContext2D) {
  const { colors } = theme;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.accent;
  ctx.font = canvasFont('title', 'bold');
  ctx.fillText('Choose your gun', WIDTH / 2, 130);
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('body');
  ctx.fillText('Shoot out every bit of red in the star', WIDTH / 2, 165);
  GUN_BUTTONS.forEach((button, i) => {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(button.x, button.y, button.width, button.height);
    const cx = button.x + button.width / 2;
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(button.gun.name, cx, button.y + 55);
    ctx.fillStyle = colors.muted;
    ctx.font = canvasFont('small');
    ctx.fillText(button.gun.blurb, cx, button.y + 90);
    ctx.fillText(`Click or press ${i + 1}`, cx, button.y + 120);
  });
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  state: StarShootState,
  aim: { x: number; y: number },
) {
  const { colors } = theme;
  ctx.fillStyle = colors.wood;
  ctx.fillRect(STAR.x - 4, STAR.y + STAR.outer + 40, 8, HEIGHT);
  ctx.fillStyle = colors.stripeB;
  ctx.fillRect(STAR.x - 130, STAR.y - 130, 260, 260);

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

function draw(ctx: CanvasRenderingContext2D, state: StarShootState, aim: { x: number; y: number }) {
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

  if (state.phase === 'choosing') drawChoosing(ctx);
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
    const headline =
      state.redLeft === 0
        ? `Star shot out! ${state.clownsBlown} clowns down. You scored ${state.score}`
        : `Out of BBs! You scored ${state.score}`;
    ctx.fillText(headline, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Click to play again', WIDTH / 2, HEIGHT / 2 + 40);
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
      Object.assign(aim, toCanvas(event));
      if (state.phase === 'over') {
        recordIfOver();
        state = createState();
      } else if (state.phase === 'choosing') {
        const gun = gunAt(aim.x, aim.y);
        if (gun) chooseGun(state, gun.id);
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
      const gun = GUNS[Number(event.key) - 1];
      if (gun) chooseGun(state, gun.id);
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
      draw(ctx, state, aim);
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
