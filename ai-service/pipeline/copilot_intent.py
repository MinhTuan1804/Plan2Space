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


def _api_key() -> str | None:
    return os.environ.get("COPILOT_API_KEY") or os.environ.get("OPENAI_API_KEY")


def _call_llm(message: str, current_geometry: dict) -> str:
    # OpenAI-compatible endpoint: GPT-4o mini by default; COPILOT_BASE_URL/COPILOT_MODEL select e.g. Gemini Flash.
    client = OpenAI(api_key=_api_key(), base_url=os.environ.get("COPILOT_BASE_URL") or None)
    response = client.chat.completions.create(
        model=os.environ.get("COPILOT_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Geometry: {json.dumps(current_geometry)}\nInstruction: {message}"},
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
    try:
        raw = _call_llm(message, current_geometry)
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
