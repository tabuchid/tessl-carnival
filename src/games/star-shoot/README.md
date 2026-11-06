# Star Shoot

Pick a difficulty and a BB gun, and shoot the red out of the paper star. Shoot
it out and the booth turns into a first person shooter full of zombie clowns.

## How to play

- Choose a difficulty: click or tap its card, or press `1`, `2` or `3`. On a
  touch screen the cards say "Tap".

  | Difficulty | Ammo   | Holes                  | Star shot out at | Score |
  | ---------- | ------ | ---------------------- | ---------------- | ----- |
  | Easy       | Double | Three times the size   | 90% of the red   | x0.5  |
  | Normal     | As is  | Twice the size         | 97% of the red   | x1    |
  | Hard       | As is  | The original, smallest | Every bit of red | x2    |

- Choose your gun the same way. The cards show the ammo for your difficulty.
  To change the difficulty, click or tap the button under the guns, or press
  `D`.

  | Gun        | Ammo (Easy is double) | How it shoots                               |
  | ---------- | --------------------- | ------------------------------------------- |
  | Plinker    | 100 BBs               | One BB per click, right where you aim       |
  | Repeater   | 250 BBs               | Hold the button to keep firing; BBs wander  |
  | Scattergun | 30 shells of 6        | One shell per click spreads 6 BBs around it |

- Move the mouse to aim at the star and click to fire, or tap the star on a
  touch screen. Each BB tears a hole and clears the red under it.
- The round ends when you run out of ammo, or when the star is shot out: as
  much of its red cleared as your difficulty asks, so on Easy and Normal a few
  stray specks in the tips don't count against you.
- Shoot out the star and the bonus round starts: zombie clowns walk towards you
  down the midway. Click a clown to blow it up. The bonus ends after 30
  seconds, or when 3 clowns reach you.
- Click again on the game over screen to play another round. It starts on the
  gun choice with the same difficulty.

## Scoring

- 10 points for every whole 1% of the star's red you shoot out, so 1000 for the
  whole star.
- Shoot out the star and every round of ammo you have left is worth 10 more.
- In the bonus round, each zombie clown you blow up is worth 50.
- Every point is multiplied by the difficulty: x0.5 on Easy, x1 on Normal and
  x2 on Hard. So a whole star with 40 rounds left is worth 700 on Easy, 1400 on
  Normal and 2800 on Hard. The game over screen shows the difficulty.

Your final score is saved to the carnival's score board when the game ends.

## Files

- `game.ts`: the game logic (`createState`, `chooseDifficulty`,
  `changeDifficulty`, `chooseGun`, `gunRounds`, `holeRadius`, `gunBlurb`,
  `finishHint`, `fitLines`, `gunHint`, `fire`, `pullTrigger`, `releaseTrigger`, `punch`,
  `shootClown`, `step`, `starScore`, `scaled`, `isShotOut`, `claimFinalScore`) and the `starShoot` entry, the default export
  the midway finds.
- `game.test.ts`: tests for the game logic.
