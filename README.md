# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lyretain/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lyretain/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ashlar reads the sealed DefiLlama snapshot and ranks protocols that record no token by a comparable implied value. That number is this entry's model. It is not a market price, not a yield, and not a claim that a token or an airdrop will exist. `node tests/gate.mjs` checks file shape on this machine only. It is not make.fun's judge score and it does not place the entry.

## Run it

```sh
node main.ts --input /input/snapshot.json --output /output
```

Node.js 22.18 or later, standard library only. With no arguments the program reads `/input/snapshot.json` and writes `/output`. `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` override those directories. Outside the grader:

```sh
mkdir -p out && node main.ts --input /path/to/snapshot.json --output out
```

Open `out/dashboard/index.html` from a local static server so `../data.js` loads. The page does not call the network. Search, category, chain, watchlist-only, and above-floor off-list filters are on the page. A row opens the comparable and the farm steps.

The model is in `lib/model.ts`. Peers are protocols in the snapshot that already record a market cap. Each market-cap / TVL ratio is clipped to this file's 10th–90th percentile, the category median is shrunk toward the file-wide median with 8 pseudo-peers, then chain count, seven-day TVL change clamped at ±30%, and tracking age move the result by only a few percent. Whole dollars. Ties break on slug. The board includes every watchlist slug plus other protocols that record no token and pass the wrapped-product screen documented with the snapshot. A protocol above the floor that the watchlist omits stays on the board and is marked off-list, because `parentProtocol` is not in the file.

```sh
node tests/gate.mjs /path/to/snapshot.json
```

That runs the program twice, requires byte-identical output, and checks row shape, watchlist coverage, screenshot size, and that `dossier.json` matches `buildDossier`. A pass means those local checks passed.

`vendor/makefun-board.ts` is the kit file, copied unchanged. The license is MIT (`SPDX-License-Identifier: MIT`). No referral code is filled in here: none was issued for this snapshot.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
