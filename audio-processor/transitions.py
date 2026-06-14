from dataclasses import dataclass, asdict


def _camelot_score(c1: str, c2: str) -> int:
    if not c1 or not c2:
        return 50
    if c1 == c2:
        return 100
    try:
        n1, l1 = int(c1[:-1]), c1[-1]
        n2, l2 = int(c2[:-1]), c2[-1]
    except (ValueError, IndexError):
        return 50

    diff = min(abs(n1 - n2), 12 - abs(n1 - n2))

    if diff == 0:
        return 85  # same number, relative major/minor
    if diff == 1 and l1 == l2:
        return 80  # adjacent, same mode
    if diff == 1 and l1 != l2:
        return 65  # adjacent, different mode
    if diff == 2:
        return 45
    return 20


def _bpm_score(bpm_a: float, bpm_b: float) -> tuple[int, float]:
    diff = abs(bpm_a - bpm_b)
    score = max(0, 100 - int(diff * 7))
    return score, round(diff, 1)


def _transition_type(bpm_score: int, key_score: int, energy_diff: int) -> str:
    combined = bpm_score * 0.45 + key_score * 0.55
    if combined >= 85 and abs(energy_diff) <= 8:
        return "cut"
    elif combined >= 72:
        return "crossfade"
    elif combined >= 55:
        return "filter_sweep"
    else:
        return "echo_out"


def _bars(trans_type: str, bpm_score: int) -> int:
    if trans_type == "cut":
        return 4
    elif trans_type == "crossfade" and bpm_score >= 85:
        return 16
    elif trans_type == "crossfade":
        return 32
    else:
        return 32


@dataclass
class TransitionPlan:
    from_track_id: str
    to_track_id: str
    score: int
    bpm_diff: float
    bpm_compat: int
    key_compat: int
    energy_flow: str
    energy_diff: int
    transition_type: str
    transition_bars: int
    description: str
    from_camelot: str
    to_camelot: str


_DESCRIPTIONS = {
    "cut": "Hard cut — instant swap at phrase boundary",
    "crossfade": "Smooth crossfade — blend over {bars} bars",
    "filter_sweep": "Filter sweep — high-pass out, low-pass in over {bars} bars",
    "echo_out": "Echo out — reverb tail into low-energy intro",
}


def compute_transitions(tracks: list[dict]) -> list[TransitionPlan]:
    plans: list[TransitionPlan] = []

    for i in range(len(tracks) - 1):
        a = tracks[i]
        b = tracks[i + 1]

        bpm_a = float(a.get("bpm") or 128)
        bpm_b = float(b.get("bpm") or 128)
        bpm_c, bpm_diff = _bpm_score(bpm_a, bpm_b)

        c_a = a.get("camelot", "") or ""
        c_b = b.get("camelot", "") or ""
        key_c = _camelot_score(c_a, c_b)

        e_a = int(a.get("energy") or 70)
        e_b = int(b.get("energy") or 70)
        e_diff = e_b - e_a
        e_flow = "up" if e_diff > 5 else "down" if e_diff < -5 else "stable"

        score = round(bpm_c * 0.40 + key_c * 0.45 + (100 - min(100, abs(e_diff))) * 0.15)

        t_type = _transition_type(bpm_c, key_c, e_diff)
        t_bars = _bars(t_type, bpm_c)
        desc = _DESCRIPTIONS[t_type].format(bars=t_bars)

        plans.append(TransitionPlan(
            from_track_id=a.get("id", str(i)),
            to_track_id=b.get("id", str(i + 1)),
            score=score,
            bpm_diff=bpm_diff,
            bpm_compat=bpm_c,
            key_compat=key_c,
            energy_flow=e_flow,
            energy_diff=abs(e_diff),
            transition_type=t_type,
            transition_bars=t_bars,
            description=desc,
            from_camelot=c_a,
            to_camelot=c_b,
        ))

    return plans
