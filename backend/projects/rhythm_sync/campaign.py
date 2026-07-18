"""
Campaign support for Rhythm Sync.

This module keeps the single-player campaign rules separate from the WebSocket
server. The server still owns sockets, game phases, shot resolution, and timing.
This file owns AI personality tuning, campaign stage metadata, and boss ability
effects.
"""

from __future__ import annotations

from copy import deepcopy

from projects.rhythm_sync import ai


CAMPAIGN_STAGES = [
    {
        "act": 1,
        "stage": 1,
        "title": "Dusty Nerves",
        "opponent_name": "Nervous Ned",
        "personality": "panic",
        "is_boss": False,
        "wild_west": False,
        "description": "A shaky opener. The opponent shoots early and cracks under pressure.",
    },
    {
        "act": 1,
        "stage": 2,
        "title": "The Backstep Kid",
        "opponent_name": "Backstep Billy",
        "personality": "coward",
        "is_boss": True,
        "wild_west": False,
        "description": "A defensive boss who steals your focus if you wait too long.",
    },
    {
        "act": 2,
        "stage": 3,
        "title": "Red Dirt Bruiser",
        "opponent_name": "Mason Graves",
        "personality": "brawler",
        "is_boss": False,
        "wild_west": False,
        "description": "Aggressive, disruptive, and willing to shoot before the odds are clean.",
    },
    {
        "act": 2,
        "stage": 4,
        "title": "The Sandstorm",
        "opponent_name": "Clara Ironhand",
        "personality": "brawler",
        "is_boss": True,
        "wild_west": True,
        "description": "A brawler boss who can spike your nerves with a full-force pressure burst.",
    },
    {
        "act": 3,
        "stage": 5,
        "title": "Quiet Barrel",
        "opponent_name": "Elias Crow",
        "personality": "deadeye",
        "is_boss": False,
        "wild_west": False,
        "description": "A precise opponent who builds accuracy quickly and wastes little motion.",
    },
    {
        "act": 3,
        "stage": 6,
        "title": "The Last Bell",
        "opponent_name": "The Bellringer",
        "personality": "legend",
        "is_boss": True,
        "wild_west": True,
        "description": "Final boss. Changes pressure style as the duel escalates.",
    },
]



def stage_count() -> int:
    return len(CAMPAIGN_STAGES)


def campaign_map(current_index: int) -> list[dict]:
    """Small Slay-the-Spire-style map payload for the frontend.

    The first version is a mostly linear road with visual branches so the UI can
    feel like a campaign without needing a full path-selection system yet.
    """
    nodes = []
    count = stage_count()
    for index, stage in enumerate(CAMPAIGN_STAGES):
        personality = stage["personality"]
        nodes.append({
            "index": index,
            "act": stage["act"],
            "stage": stage["stage"],
            "title": stage["title"],
            "opponent_name": stage["opponent_name"],
            "personality": personality,
            "personality_label": ai.AI_PERSONALITIES.get(personality, ai.AI_PERSONALITIES["panic"])["label"],
            "is_boss": bool(stage["is_boss"]),
            "wild_west": bool(stage.get("wild_west")),
            "ability": ability_for(stage),
            "status": "cleared" if index < current_index else "current" if index == current_index else "locked",
            "x": 12 + index * (76 / max(1, count - 1)),
            "y": 55 + ((index % 3) - 1) * 16,
        })
    return nodes


def get_stage(index: int) -> dict:
    safe_index = max(0, min(index, len(CAMPAIGN_STAGES) - 1))
    return deepcopy(CAMPAIGN_STAGES[safe_index])



def make_ai_player(player_id: str, stage: dict) -> dict:
    personality = stage["personality"]
    return {
        "id": player_id,
        "name": stage["opponent_name"],
        "accuracy": 0.0,
        "nerves": 0.0,
        "ready": True,
        "is_reloading": False,
        "round_wins": 0,
        "rhythm_streak": 0,
        "rhythm_quality": 0.0,
        "last_tap_quality": "none",
        "last_tap_at": 0.0,
        "tap_counter": 0,
        "calibrated": True,
        "last_scored_beat": 0,
        "taunt_until": 0.0,
        "taunt_ready_at": 0.0,
        "vote_wild_west": bool(stage.get("wild_west")),
        "is_ai": True,
        "ai_personality": personality,
        "ai_personality_label": ai.AI_PERSONALITIES.get(personality, ai.AI_PERSONALITIES["panic"])["label"],
        "boss": bool(stage.get("is_boss")),
        "boss_ability": ability_for(stage),
        "boss_ability_ready_at": 0.0,
        "campaign_stage": stage["stage"],
        "next_ai_decision_at": 0.0,
        "last_ai_action": "waiting",
    }


def ability_for(stage: dict) -> str | None:
    if not stage.get("is_boss"):
        return None

    personality = stage.get("personality")
    if personality == "coward":
        return "steal_focus"
    if personality == "brawler":
        return "heat_spike"
    if personality == "deadeye":
        return "deadeye_focus"
    if personality == "panic":
        return "spiral"
    if personality == "legend":
        return "legend_shift"
    return None


def campaign_summary(stage_index: int) -> dict:
    stage = get_stage(stage_index)
    return {
        "stage_index": stage_index,
        "stage_count": stage_count(),
        "act": stage["act"],
        "stage": stage["stage"],
        "title": stage["title"],
        "opponent_name": stage["opponent_name"],
        "personality": stage["personality"],
        "personality_label": ai.AI_PERSONALITIES.get(stage["personality"], ai.AI_PERSONALITIES["panic"])["label"],
        "is_boss": bool(stage["is_boss"]),
        "description": stage["description"],
        "wild_west": bool(stage.get("wild_west")),
        "ability": ability_for(stage),
        "map": campaign_map(stage_index),
    }

