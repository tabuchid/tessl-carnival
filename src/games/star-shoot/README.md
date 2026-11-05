# Star Shoot

Pick a BB gun and shoot every bit of red out of the paper star. Clear it all and
the booth turns into a first person shooter full of zombie clowns.

## How to play

- Choose your gun: click its card, or press `1`, `2` or `3`.

  | Gun        | Ammo           | How it shoots                               |
  | ---------- | -------------- | ------------------------------------------- |
  | Plinker    | 100 BBs        | One BB per click, right where you aim       |
  | Repeater   | 250 BBs        | Hold the button to keep firing; BBs wander  |
  | Scattergun | 30 shells of 6 | One shell per click spreads 6 BBs around it |

- Move the mouse to aim at the star and click to fire. Each BB tears a small
  hole and clears the red under it.
- The round ends when you run out of ammo, or when no red is left in the star.
- Shoot out all the red and the bonus round starts: zombie clowns walk towards
  you down the midway. Click a clown to blow it up. The bonus ends after 30
  seconds, or when 3 clowns reach you.
- Click again on the game over screen to play another round.

## Scoring

- 10 points for every whole 1% of the star's red you shoot out, so 1000 for the
  whole star.
- Shoot out the whole star and every round of ammo you have left is worth 10
  more.
- In the bonus round, each zombie clown you blow up is worth 50.

Your final score is saved to the carnival's score board when the game ends.

## Files

- `game.ts`: the game logic (`createState`, `chooseGun`, `fire`, `punch`,
  `shootClown`, `step`, `starScore`) and the `starShoot` entry, the default
  export the midway finds.
- `game.test.ts`: tests for the game logic.
