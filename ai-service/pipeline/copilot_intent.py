import json
import os
import re

from openai import OpenAI, OpenAIError

ALLOWED_ACTIONS = ("move_wall", "add_opening", "resize_room", "unknown")
UNKNOWN = {"action": "unknown", "params": {}}

SYSTEM_PROMPT = """You are a floor-plan editing assistant. Given a user instruction and
the current geometry (metres, y axis pointing up), respond with ONLY a JSON object:
{"action": "move_wall"|"add_opening"|"resize_room"|"unknown", "params": {...}}

params by action (ids MUST be copied from the geometry):
- move_wall:   {"wall_id": "<wall id>", "dx": <metres>, "dy": <metres>}
- add_opening: {"wall_id": "<wall id>", "type": "door"|"window", "offset_m": <distance from the wall's first point>, "width_m": <metres>}
- resize_room: {"room_id": "<room id>", "scale": <factor, e.g. 1.2 = 20% bigger>}
- unknown:     {} (use when the instruction is unclear or not one of the above)
No prose, no markdown fences — raw JSON only."""

# ~15k tokens. A hand-sized plan compacts to a few thousand characters; beyond this the plan is noise
# (usually an unfiltered image import) and the answer would be unreliable anyway.
MAX_GEOMETRY_CHARS = 60_000


def _point(p) -> list[float]:
    x, y = (p["x"], p["y"]) if isinstance(p, dict) else (p[0], p[1])
    return [round(float(x), 2), round(float(y), 2)]


def compact_geometry(geometry: dict) -> dict:
    """Only what the prompt refers to: ids, labels, types and centimetre coordinates."""
    return {
        "walls": [{"id": w.get("id"), "points": [_point(p) for p in w.get("points", [])]}
                  for w in geometry.get("walls", [])],
        "rooms": [{"id": r.get("id"), "label": r.get("label"), "points": [_point(p) for p in r.get("points", [])]}
                  for r in geometry.get("rooms", [])],
        "openings": [{"id": o.get("id"), "wallId": o.get("wallId"), "type": o.get("type"),
                      "position": _point(o["position"])}
                     for o in geometry.get("openings", []) if o.get("position") is not None],
    }


def _api_key() -> str | None:
    return os.environ.get("COPILOT_API_KEY") or os.environ.get("OPENAI_API_KEY")


def _call_llm(message: str, current_geometry: dict) -> str:
    # OpenAI-compatible endpoint: GPT-4o mini by default; COPILOT_BASE_URL/COPILOT_MODEL select e.g. Gemini Flash.
    client = OpenAI(api_key=_api_key(), base_url=os.environ.get("COPILOT_BASE_URL") or None)
    response = client.chat.completions.create(
        model=os.environ.get("COPILOT_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Geometry: {json.dumps(current_geometry, separators=(',', ':'))}\nInstruction: {message}"},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    return response.choices[0].message.content or ""


def _strip_fences(raw: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.DOTALL)
    return match.group(1) if match else raw.strip()


def parse_intent(message: str, current_geometry: dict) -> dict:
    """LLM output is untrusted: anything off-contract becomes {"action": "unknown"}.
    Ids and values are validated again by the API before any geometry is saved."""
    if not _api_key():
        return {**UNKNOWN, "reason": "Co-pilot is not configured (no COPILOT_API_KEY / OPENAI_API_KEY)."}
    compact = compact_geometry(current_geometry)
    if len(json.dumps(compact, separators=(",", ":"))) > MAX_GEOMETRY_CHARS:
        return {**UNKNOWN, "reason": f"This plan is too large for the co-pilot ({len(compact['walls'])} walls). "
                                     "Remove stray walls or edit it by hand."}
    try:
        raw = _call_llm(message, compact)
    except OpenAIError as exc:   # quota, auth, network, provider outage
        return {**UNKNOWN, "reason": f"The co-pilot's language model is unavailable right now ({type(exc).__name__}). Try again later."}
    try:
        parsed = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return dict(UNKNOWN)
    if not isinstance(parsed, dict) or parsed.get("action") not in ALLOWED_ACTIONS:
        return dict(UNKNOWN)
    params = parsed.get("params", {})
    if not isinstance(params, dict):
        return dict(UNKNOWN)
    return {"action": parsed["action"], "params": params}
