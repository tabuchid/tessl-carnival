import { describe, expect, it } from 'vitest';
import {
  BONUS_TIME,
  CLOWN_POINTS,
  DIFFICULTIES,
  DIFFICULTY_BUTTONS,
  GUNS,
  GUN_BUTTONS,
  MAX_ESCAPES,
  STAR,
  changeDifficulty,
  chooseDifficulty,
  chooseGun,
  claimFinalScore,
  clownOnScreen,
  createState,
  difficultyAt,
  finishHint,
  fire,
  gunAt,
  gunBlurb,
  gunHint,
  holeRadius,
  isInStar,
  isShotOut,
  pullTrigger,
  punch,
  releaseTrigger,
  shootClown,
  starScore,
  step,
  type StarShootState,
} from './game';

const centre = () => 0;
const [EASY, NORMAL, HARD] = DIFFICULTIES;

function shooting(gunId = 'plinker', difficulty = NORMAL): StarShootState {
  const state = createState(difficulty);
  chooseGun(state, gunId);
  return state;
}

/** Clears every bit of red but the cell at the star's tip. */
function clearAllButTip(state: StarShootState) {
  for (let y = STAR.y - STAR.outer; y <= STAR.y + STAR.outer; y += 4) {
    for (let x = STAR.x - STAR.outer; x <= STAR.x + STAR.outer; x += 4) {
      if (y > STAR.y - STAR.outer + 12) punch(state, x, y, 3);
    }
  }
  state.holes = [];
}

describe('star shoot', () => {
  it('starts on the difficulty choice with a fully red star and no score', () => {
    const state = createState();
    expect(state.phase).toBe('difficulty');
    expect(state.redTotal).toBeGreaterThan(0);
    expect(state.redLeft).toBe(state.redTotal);
    expect(state.score).toBe(0);
  });

  it('cannot choose a gun before a difficulty', () => {
    const state = createState();
    expect(chooseGun(state, 'plinker')).toBe(false);
    expect(chooseDifficulty(state, 'easy')).toBe(true);
    expect(state.phase).toBe('choosing');
    expect(state.difficulty).toBe(EASY);
    expect(chooseGun(state, 'plinker')).toBe(true);
  });

  it('ignores a difficulty that does not exist', () => {
    const state = createState();
    expect(chooseDifficulty(state, 'nightmare')).toBe(false);
    expect(state.phase).toBe('difficulty');
  });

  it('starts a restarted round on the gun choice with the last difficulty', () => {
    const state = createState(HARD);
    expect(state.phase).toBe('choosing');
    expect(state.difficulty).toBe(HARD);
  });

  it('can go back from the gun choice to change the difficulty', () => {
    const state = createState(HARD);
    expect(changeDifficulty(state)).toBe(true);
    expect(state.phase).toBe('difficulty');
    expect(chooseDifficulty(state, 'easy')).toBe(true);
    expect(state.difficulty).toBe(EASY);
    chooseGun(state, 'plinker');
    expect(changeDifficulty(state)).toBe(false);
  });

  it('finds the difficulty under a tap on the difficulty screen', () => {
    const button = DIFFICULTY_BUTTONS[2];
    expect(difficultyAt(button.x + 5, button.y + 5)).toBe(HARD);
    expect(difficultyAt(0, 0)).toBeUndefined();
  });

  it('cannot fire before a gun is chosen', () => {
    const state = createState(NORMAL);
    expect(fire(state, STAR.x, STAR.y)).toBe(false);
    expect(state.redLeft).toBe(state.redTotal);
  });

  it('loads the chosen gun', () => {
    for (const gun of GUNS) {
      const state = shooting(gun.id);
      expect(state.phase).toBe('shooting');
      expect(state.rounds).toBe(gun.rounds);
    }
  });

  it('doubles the ammo on Easy and keeps the original ammo on Normal and Hard', () => {
    for (const gun of GUNS) {
      expect(shooting(gun.id, EASY).rounds).toBe(gun.rounds * 2);
      expect(shooting(gun.id, NORMAL).rounds).toBe(gun.rounds);
      expect(shooting(gun.id, HARD).rounds).toBe(gun.rounds);
    }
    expect(gunBlurb(GUNS[0], EASY)).toBe('200 BBs, dead accurate');
    expect(gunBlurb(GUNS[2], HARD)).toBe('30 shells of 6 BBs each');
  });

  it('tears the original holes on Hard, double on Normal and bigger again on Easy', () => {
    expect(GUNS.map((gun) => holeRadius(gun, HARD))).toEqual([7, 6, 6]);
    expect(GUNS.map((gun) => holeRadius(gun, NORMAL))).toEqual([14, 12, 12]);
    for (const gun of GUNS) {
      expect(holeRadius(gun, EASY)).toBeGreaterThan(holeRadius(gun, NORMAL));
    }
    const state = shooting('plinker', EASY);
    fire(state, STAR.x, STAR.y, centre);
    expect(state.holes[0].radius).toBe(holeRadius(GUNS[0], EASY));
  });

  it('ignores a gun that does not exist', () => {
    const state = createState(NORMAL);
    expect(chooseGun(state, 'cannon')).toBe(false);
    expect(state.phase).toBe('choosing');
  });

  it('finds the gun under a click on the choosing screen', () => {
    const button = GUN_BUTTONS[1];
    expect(gunAt(button.x + 5, button.y + 5)).toBe(button.gun);
    expect(gunAt(0, 0)).toBeUndefined();
  });

  it('knows the inside of the star from the outside', () => {
    expect(isInStar(STAR.x, STAR.y)).toBe(true);
    expect(isInStar(STAR.x, STAR.y - STAR.outer + 5)).toBe(true);
    expect(isInStar(STAR.x - STAR.outer + 2, STAR.y + STAR.outer - 2)).toBe(false);
  });

  it('shoots red out of the star and uses a round', () => {
    const state = shooting();
    expect(fire(state, STAR.x, STAR.y, centre)).toBe(true);
    expect(state.rounds).toBe(GUNS[0].rounds - 1);
    expect(state.redLeft).toBeLessThan(state.redTotal);
    expect(state.holes).toHaveLength(1);
  });

  it('clears nothing with a shot that misses the star', () => {
    const state = shooting();
    fire(state, 20, 450, centre);
    expect(state.redLeft).toBe(state.redTotal);
  });

  it('fires every pellet of a scattergun shell for one round', () => {
    const state = shooting('scattergun');
    fire(state, STAR.x, STAR.y, centre);
    expect(state.holes).toHaveLength(GUNS[2].pellets);
    expect(state.rounds).toBe(GUNS[2].rounds - 1);
  });

  it('scores 10 points for every whole percent of red shot out', () => {
    const state = createState(NORMAL);
    state.redLeft = Math.round(state.redTotal * 0.5);
    expect(starScore(state)).toBe(500);
    state.redLeft = 0;
    expect(starScore(state)).toBe(1000);
  });

  it('ends the round with the star score when the gun is empty', () => {
    const state = shooting();
    state.rounds = 1;
    fire(state, STAR.x, STAR.y, centre);
    expect(state.phase).toBe('over');
    expect(state.score).toBe(starScore(state));
  });

  it('pays 10 per round left and starts the bonus when the star is shot out', () => {
    const state = shooting();
    clearAllButTip(state);
    expect(state.redLeft).toBeGreaterThan(0);
    state.rounds = 40;
    fire(state, STAR.x, STAR.y - STAR.outer + 6, centre);
    expect(state.redLeft).toBe(0);
    expect(state.phase).toBe('bonus');
    expect(state.score).toBe(1000 + 10 * 39);
  });

  it('finishes at 90% on Easy, 97% on Normal and every bit of red on Hard', () => {
    expect(DIFFICULTIES.map((d) => d.shotOutAt)).toEqual([0.9, 0.97, 1]);
    for (const difficulty of DIFFICULTIES) {
      const short = shooting('plinker', difficulty);
      short.redLeft = Math.ceil(short.redTotal * (1 - difficulty.shotOutAt)) + 1;
      short.rounds = 1;
      fire(short, 20, 450, centre);
      expect(isShotOut(short)).toBe(false);
      expect(short.phase).toBe('over');
    }

    for (const difficulty of [EASY, NORMAL]) {
      const specks = shooting('plinker', difficulty);
      specks.redLeft = Math.floor(specks.redTotal * (1 - difficulty.shotOutAt)) + 1;
      specks.rounds = 20;
      fire(specks, STAR.x, STAR.y, centre);
      expect(specks.redLeft).toBeGreaterThan(0);
      expect(isShotOut(specks)).toBe(true);
      expect(specks.phase).toBe('bonus');
    }

    const hard = shooting('plinker', HARD);
    hard.redLeft = 1;
    expect(isShotOut(hard)).toBe(false);
  });

  it('multiplies every score by the difficulty: x0.5 on Easy, x1 on Normal, x2 on Hard', () => {
    expect(DIFFICULTIES.map((d) => d.multiplier)).toEqual([0.5, 1, 2]);
    for (const difficulty of DIFFICULTIES) {
      const state = shooting('plinker', difficulty);
      clearAllButTip(state);
      state.rounds = 40;
      fire(state, STAR.x, STAR.y - STAR.outer + 6, centre);
      expect(state.phase).toBe('bonus');
      expect(state.score).toBe((1000 + 10 * 39) * difficulty.multiplier);
      state.clowns = [{ lane: 0, z: 0.5 }];
      const at = clownOnScreen(state.clowns[0]);
      shootClown(state, at.x, at.y);
      expect(state.score).toBe((1000 + 10 * 39 + CLOWN_POINTS) * difficulty.multiplier);
    }
  });

  it("matches the gun choice's subtitle to the difficulty's finish", () => {
    expect(finishHint(EASY)).toBe('Shoot out 90% of the red in the star');
    expect(finishHint(NORMAL)).toBe('Shoot out 97% of the red in the star');
    expect(finishHint(HARD)).toBe('Shoot out every bit of red in the star');
  });

  it('says Tap on a touch screen and names the key otherwise', () => {
    expect(gunHint(0, true)).toBe('Tap');
    expect(gunHint(2, false)).toBe('Click or press 3');
  });

  it('keeps firing an automatic gun while the trigger is held', () => {
    const state = shooting('repeater');
    state.trigger = { x: STAR.x, y: STAR.y };
    step(state, 0.25, centre);
    expect(state.rounds).toBeLessThan(GUNS[1].rounds - 1);
    state.trigger = undefined;
    const rounds = state.rounds;
    step(state, 0.25, centre);
    expect(state.rounds).toBe(rounds);
  });

  it('fires an automatic gun on the press, even if it is released before the next step', () => {
    const state = shooting('repeater');
    expect(pullTrigger(state, STAR.x, STAR.y, centre)).toBe(true);
    expect(state.rounds).toBe(GUNS[1].rounds - 1);
    releaseTrigger(state);
    step(state, 0.25, centre);
    expect(state.rounds).toBe(GUNS[1].rounds - 1);
  });

  it('waits the firing interval after the press before the next automatic shot', () => {
    const state = shooting('repeater');
    pullTrigger(state, STAR.x, STAR.y, centre);
    step(state, GUNS[1].autoInterval / 2, centre);
    expect(state.rounds).toBe(GUNS[1].rounds - 1);
    step(state, GUNS[1].autoInterval / 2, centre);
    expect(state.rounds).toBe(GUNS[1].rounds - 2);
  });

  it('fires once per press with a gun that is not automatic', () => {
    const state = shooting('plinker');
    pullTrigger(state, STAR.x, STAR.y, centre);
    expect(state.trigger).toBeUndefined();
    step(state, 0.25, centre);
    expect(state.rounds).toBe(GUNS[0].rounds - 1);
  });

  it('hands over the final score exactly once, and only when the round is over', () => {
    const state = shooting('plinker');
    expect(claimFinalScore(state)).toBeUndefined();
    state.rounds = 1;
    fire(state, STAR.x, STAR.y, centre);
    expect(state.phase).toBe('over');
    expect(claimFinalScore(state)).toBe(state.score);
    expect(claimFinalScore(state)).toBeUndefined();
  });

  describe('bonus round', () => {
    function bonus(): StarShootState {
      const state = createState(NORMAL);
      state.phase = 'bonus';
      state.spawnIn = 100;
      return state;
    }

    it('blows up a clown that is shot and scores for it', () => {
      const state = bonus();
      state.clowns = [{ lane: 0, z: 0.5 }];
      const at = clownOnScreen(state.clowns[0]);
      expect(shootClown(state, at.x, at.y)).toBe(true);
      expect(state.clowns).toHaveLength(0);
      expect(state.score).toBe(CLOWN_POINTS);
    });

    it('misses when no clown is under the shot', () => {
      const state = bonus();
      state.clowns = [{ lane: -1, z: 0.5 }];
      expect(shootClown(state, 790, 10)).toBe(false);
      expect(state.score).toBe(0);
    });

    it('walks clowns towards the player and spawns new ones', () => {
      const state = bonus();
      state.spawnIn = 0;
      step(state, 0.1, centre);
      expect(state.clowns).toHaveLength(1);
      expect(state.clowns[0].z).toBeLessThan(1);
    });

    it('ends when too many clowns get through', () => {
      const state = bonus();
      state.clowns = Array.from({ length: MAX_ESCAPES }, () => ({ lane: 0, z: 0.01 }));
      step(state, 0.1, centre);
      expect(state.phase).toBe('over');
    });

    it('ends when the time runs out', () => {
      const state = bonus();
      step(state, BONUS_TIME, centre);
      expect(state.phase).toBe('over');
    });
  });
});
