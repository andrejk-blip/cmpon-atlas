# Audit 2.17.7

This folder preserves baseline, unsuccessful candidate and final results. No post-fix human engagement improvement is claimed.

## Repeat the release checks

Run from the repository root with Node.js:

```sh
node tests/audit2177-contracts.cjs
node tests/audit2177-campaign.cjs training convoy 0 repeat
node tests/audit2177-campaign.cjs combat pursuit 0 repeat
node tests/audit2177-campaign.cjs pro convoy 0 repeat
node tests/audit2177-balance.cjs repeat
node tests/living2176-regression.cjs
```

The campaign pilot uses ordinary inputs/actions after start. It knows exact positions and quiz keys, closes narrative windows and does not model reading time. Simulation duration is not human play time. Direct balance fixtures explicitly supply encounter prerequisites before launch; they are not full-campaign claims. `audit2177-statechecks.cjs` separately checks pause and restoration on 14 direct-entry fixtures and writes `statechecks-current.json`.

## Evidence

| Files | Meaning |
| --- | --- |
| `contracts.json` | 15 final targeted blocks; synthetic boundary fixtures explicitly named |
| `before-*.json` | Published 2.17.6, same campaign pilot |
| `after-combat-pursuit.json`, `final-combat-pursuit.json` | Unsuccessful intermediate candidates, retained |
| `release-*.json` | Final successful training, combat and pro campaigns |
| `balance-before.json`, `balance-after.json` | 4 active swarm, 3 active convoy and 2 idle trials |
| `orbit4-paired-review.json` | Same earned checkpoint replayed against baseline/current |
| `orbit4-earned-checkpoint.json.gz` | Exact pre-orbit checkpoint from the first unsuccessful candidate |
| `statechecks.json` | Initial 14/14 pause and exact restoration; MRG continuation differed only in lazy text cache |
| `gameplay-baseline.txt`, `resonator-lowhp-baseline.txt` | Initial unavoidable resonator damage and identical monster/quiz patterns |
| `editorial-scores.json`, `expert-curves.png` | Explicit editorial assessment of the baseline, not player data |
| `chapter-metrics.csv`, `campaign-measured.png`, `swarm-measured.png` | Graph source and measured comparisons |

To repeat the paired orbital review, prepare a complete checkout of baseline commit `25e2fdaf7c4ecdea8a85857a260901793e89bc0b`, set `CITADEL_BASELINE_DIR` to that directory, then run `node tests/audit2177-orbit-review.cjs`. The checkpoint is loaded normally; subsequent controls are ordinary inputs. Both baseline and final candidate complete the chapter, with station health 31 / 28.5, duration 80.083 / 76.9 seconds and titan contacts 0 / 1.

The last change after final campaigns only moved the attack caption above the weapon drawing on a dark strip. All 15 contracts were repeated afterward. Six production modules, both entry points and their cache keys are included in the release; exact active hashes are in `version.json`.

The report can be regenerated with `python3 scripts/report-audit2177.py` (Matplotlib, ReportLab and Liberation Serif fonts). Browser QA used actual Chrome compatibility rendering. The native recording preview reported 960×540, readyState 4 and no media error; its frame contained the painted medusa, three attack rays and HUD. No physical-device or WebGL performance claim is made.
