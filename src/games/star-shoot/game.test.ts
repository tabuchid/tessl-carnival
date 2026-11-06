import { describe, expect, it } from 'vitest';
import {
  BONUS_TIME,
  CLOWN_POINTS,
  GUNS,
  GUN_BUTTONS,
  MAX_ESCAPES,
  STAR,
  chooseGun,
  claimFinalScore,
  clownOnScreen,
  createState,
  fire,
  gunAt,
  isInStar,
  pullTrigger,
  punch,
  releaseTrigger,
  shootClown,
  starScore,
  step,
  type StarShootState,
} from './game';

const centre = () => 0;

function shooting(gunId = 'plinker'): StarShootState {
  const state = createState();
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
  it('starts on the gun choice with a fully red star and no score', () => {
    const state = createState();
    expect(state.phase).toBe('choosing');
    expect(state.redTotal).toBeGreaterThan(0);
    expect(state.redLeft).toBe(state.redTotal);
    expect(state.score).toBe(0);
  });

  it('cannot fire before a gun is chosen', () => {
    const state = createState();
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

  it('ignores a gun that does not exist', () => {
    const state = createState();
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
    const state = createState();
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
      const state = createState();
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
