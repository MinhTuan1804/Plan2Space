import json

from generate import write_case
from houses import HOUSES
from score_pipeline import run_stage1


def test_stage1_scores_each_case_and_survives_a_broken_one(tmp_path):
    good = write_case(HOUSES[0], "clean", tmp_path / "cases")
    broken = tmp_path / "cases" / "broken__clean"
    broken.mkdir()
    (broken / "drawing.dxf").write_text("not a dxf", encoding="utf-8")
    (broken / "truth.json").write_text((good / "truth.json").read_text(encoding="utf-8"), encoding="utf-8")
    rows = run_stage1([good, broken], tmp_path / "out")
    assert [r["case"] for r in rows] == [good.name, "broken__clean"]
    ok, bad = rows
    assert ok["error"] is None and ok["walls"] > 50 and ok["rooms"] > 50
    assert bad["error"] and all(bad[k] == 0 for k in ("walls", "stubs", "rooms", "openings", "names"))
    saved = json.loads((tmp_path / "out" / f"{good.name}.json").read_text(encoding="utf-8"))
    assert set(saved) >= {"walls", "rooms", "openings"}
    assert not (tmp_path / "out" / "broken__clean.json").exists()
