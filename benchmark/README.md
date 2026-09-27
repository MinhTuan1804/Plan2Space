# Recognition benchmark

Scores DXF recognition against known answers. Run with the ai-service Python (Node needed for stage 2):

```bash
python benchmark/run.py                    # score; exit 1 if a case drops > 2 points below baseline.json
python benchmark/run.py --update-baseline  # make this run the baseline (commit it with the change that earned it)
python benchmark/run.py --private          # also score the real drawings in benchmark/private/ (never committed)
python benchmark/run.py --overlay CASE     # report/CASE.png: answer walls green, found walls red
```

Cases are generated from `houses.py` by `generate.py`: each house clean and with one real-world defect per variant.
