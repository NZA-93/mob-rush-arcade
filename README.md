# Mob Rush

A portrait arcade crowd shooter. Drag the cannon, hold to fire, multiply through gates, and break the enemy base before the red crowd reaches you. Levels are endless and keep getting harder. There is no village, no shop, no currency, and no upgrades.

**Play:** https://nza-93.github.io/mob-rush-arcade/

## How to play

- **Drag** left and right (finger or mouse) to aim the cannon. On a keyboard, use **A / D** or the **arrow keys**.
- **Hold** to fire a stream of runners. Release to stop. **Space** fires from the keyboard.
- Runners that pass a gate change the size of your crowd:
  - **x2 / x3** multiply them
  - **+10** (and other additions) call in extras
  - **-5 / /2** show up on later levels and cut your crowd down. Avoid them.
- Your crowd fights the red crowd **one for one**. Whoever has more strength keeps going.
- Reach the **enemy base** at the top to damage it. Empty the bar to clear the level.
- If a red runner reaches **your cannon**, the run is over.
- Keep firing to charge a **giant**. The next shot is a big runner that trades with several enemies.
- Some gates **slide**, and later levels add **moving blocks**. Steer the stream around them.
- **Score**, **level**, and **best** are on screen. Best is saved in this browser (`localStorage`).
- **Restart** (or the **R** key) throws the run away instantly and starts again at level 1.
- **SFX** (or **M**) toggles the synthesized sound.

Clear a level and the next one starts on its own. Bases get tougher, enemy waves get faster and larger, and the gates get meaner.

## Run it locally

The game is a static site (vanilla ES modules, Canvas, and WebAudio). Modules need a local server:

```bash
python3 -m http.server 5173
```

Open http://localhost:5173

Balance checks (no browser):

```bash
node test/balance.mjs
```

## Deploy

`.github/workflows/pages.yml` publishes the `main` branch to GitHub Pages.
