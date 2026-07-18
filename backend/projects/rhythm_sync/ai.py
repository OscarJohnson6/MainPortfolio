"""
Campaign AI support for Rhythm Sync.

This module owns opponent personalities, AI decision pacing, shot discipline,
campaign taunt rules, and boss ability balance. The server still owns sockets,
phase transitions, shot resolution, and broadcasting.
"""

from __future__ import annotations

import math
import random


AI_PERSONALITIES = {
    "panic": {
        "label": "Panic",
        "tap_skill": 0.50,
        "perfect_bias": 0.10,
        "accuracy_gain": 0.82,
        "nerve_recovery": 0.80,
        "shot_target_max": 68,       # Panic may take rough shots, but not impossible ones.
        "shot_chance": 0.28,
        "decision_delay": (1.25, 2.15),
        "taunt_cooldown": 18.0,
        "taunt_chance": 0.01,
        "ability_cooldown": 18.0,
    },
    "coward": {
        "label": "Coward",
        "tap_skill": 0.58,
        "perfect_bias": 0.16,
        "accuracy_gain": 0.90,
        "nerve_recovery": 1.12,
        "shot_target_max": 38,       # Coward waits for safer shots.
        "shot_chance": 0.40,
        "decision_delay": (1.85, 2.95),
        "taunt_cooldown": 17.0,
        "taunt_chance": 0.07,
        "ability_cooldown": 19.0,
    },
    "brawler": {
        "label": "Brawler",
        "tap_skill": 0.64,
        "perfect_bias": 0.18,
        "accuracy_gain": 0.96,
        "nerve_recovery": 0.95,
        "shot_target_max": 58,       # Risky but still plausible.
        "shot_chance": 0.44,
        "decision_delay": (1.35, 2.35),
        "taunt_cooldown": 15.0,
        "taunt_chance": 0.10,
        "ability_cooldown": 21.0,
    },
    "deadeye": {
        "label": "Deadeye",
        "tap_skill": 0.78,
        "perfect_bias": 0.34,
        "accuracy_gain": 1.24,
        "nerve_recovery": 1.25,
        "shot_target_max": 48,       # Strong discipline.
        "shot_chance": 0.52,
        "decision_delay": (1.55, 2.45),
        "taunt_cooldown": 20.0,
        "taunt_chance": 0.015,
        "ability_cooldown": 20.0,
    },
    "legend": {
        "label": "Legend",
        "tap_skill": 0.82,
        "perfect_bias": 0.38,
        "accuracy_gain": 1.20,
        "nerve_recovery": 1.22,
        "shot_target_max": 52,
        "shot_chance": 0.50,
        "decision_delay": (1.35, 2.25),
        "taunt_cooldown": 16.0,
        "taunt_chance": 0.055,
        "ability_cooldown": 20.0,
    },
}


def personality_key(player: dict, game_state: dict | None = None) -> str:
    key = player.get("ai_personality", "panic")

    # Final boss changes style by round while still displaying as Legend.
    if key == "legend" and game_state:
        round_number = game_state.get("round_number", 1)
        if round_number <= 1:
            return "coward"
        if round_number == 2:
            return "brawler"
        return "deadeye"

    return key if key in AI_PERSONALITIES else "panic"


def personality_for(player: dict, game_state: dict | None = None) -> dict:
    return AI_PERSONALITIES[personality_key(player, game_state)]


def init_ai_runtime(ai: dict, now: float) -> None:
    """Add runtime-only AI pacing fields if missing."""
    ai.setdefault("next_ai_decision_at", now + random.uniform(1.0, 2.0))
    ai.setdefault("boss_ability_ready_at", now + random.uniform(6.0, 9.0))
    ai.setdefault("last_ai_action", "waiting")


def schedule_next_decision(ai: dict, game_state: dict, now: float) -> None:
    persona = personality_for(ai, game_state)
    low, high = persona["decision_delay"]
    ai["next_ai_decision_at"] = now + random.uniform(low, high)


def should_make_decision(ai: dict, now: float) -> bool:
    return now >= ai.get("next_ai_decision_at", 0.0)


def estimate_shot(accuracy: float, nerves: float, streak: int) -> dict:
    """Deterministic estimate matching the server's compute_shot formula.

    This avoids rolling random dice just so the AI can decide whether shooting is
    sane. Lower target_to_beat means better odds.
    """
    a = max(0.0, accuracy) / 10.0
    n = max(0.0, nerves) / 10.0

    accuracy_component = (a ** 1.5) * 3.0
    nerves_component = (n ** 1.1) * 2.5
    streak_bonus = min(max(streak - 4, 0), 10) * 1.5

    raw_threshold = accuracy_component - nerves_component + streak_bonus
    hit_chance = max(5.0, min(95.0, raw_threshold))
    target_to_beat = max(1, round(101 - hit_chance))

    return {
        "hit_chance": round(hit_chance, 1),
        "target_to_beat": target_to_beat,
        "raw_threshold": round(raw_threshold, 1),
    }


def apply_ai_rhythm(ai: dict, game_state: dict, clamp) -> bool:
    """Simulate one AI tap decision on a beat. Returns true if state changed."""
    if ai.get("is_reloading"):
        return False

    persona = personality_for(ai, game_state)
    skill = persona["tap_skill"]

    # Later stages get a small skill bump without making early bosses impossible.
    stage_bonus = min(0.12, (ai.get("campaign_stage", 1) - 1) * 0.025)
    skill = min(0.92, skill + stage_bonus)

    ai["tap_counter"] += 1
    ai["calibrated"] = True
    ai["last_scored_beat"] = game_state.get("beat_index", 0)

    roll = random.random()
    if roll < skill:
        perfect_cutoff = skill * persona["perfect_bias"]
        quality = "perfect" if roll < perfect_cutoff else "good"
        ai["rhythm_streak"] += 1

        reward = 2.0 + min(5.5, ai["rhythm_streak"] * 0.55)
        if quality == "good":
            reward *= 0.62
        reward *= persona["accuracy_gain"]

        ai["accuracy"] = clamp(ai["accuracy"] + reward, 0.0, 100.0)

        calm = 2.8 if quality == "perfect" else 1.25
        ai["nerves"] = clamp(ai["nerves"] - calm * persona["nerve_recovery"], 0.0, 100.0)
    else:
        quality = "miss"
        ai["rhythm_streak"] = 0
        ai["nerves"] = clamp(ai["nerves"] + random.uniform(1.4, 4.2), 0.0, 100.0)

    ai["last_tap_quality"] = quality
    ai["rhythm_quality"] = clamp(
        ai.get("rhythm_quality", 0.0) * 0.72 + (1.0 if quality != "miss" else 0.0) * 0.28,
        0.0,
        1.0,
    )
    return True


def should_ai_taunt(ai: dict, human: dict, now: float, game_state: dict) -> bool:
    if ai.get("is_reloading"):
        return False
    if now < ai.get("taunt_ready_at", 0.0):
        return False
    if human.get("taunt_until", 0.0) > now:
        return False
    if ai.get("accuracy", 0.0) < 35.0:
        return False
    if ai.get("nerves", 0.0) > 75.0:
        return False

    persona = personality_for(ai, game_state)
    key = personality_key(ai, game_state)

    # Only taunt when it serves the personality, not as a constant cooldown dump.
    human_accuracy = human.get("accuracy", 0.0)
    human_streak = human.get("rhythm_streak", 0)

    if key == "panic":
        return False
    if key == "deadeye":
        return random.random() < persona["taunt_chance"] and human_accuracy > 75
    if key == "coward" and human_accuracy < 55:
        return False
    if key == "brawler" and human_accuracy < 42 and human_streak < 4:
        return False

    chance = persona["taunt_chance"] * (1.25 if ai.get("boss") else 1.0)
    return random.random() < chance


def campaign_taunt_cooldown(ai: dict, game_state: dict) -> float:
    return personality_for(ai, game_state)["taunt_cooldown"]


def should_ai_shoot(ai: dict, game_state: dict) -> bool:
    if ai.get("is_reloading"):
        return False

    persona = personality_for(ai, game_state)
    key = personality_key(ai, game_state)
    estimate = estimate_shot(ai.get("accuracy", 0.0), ai.get("nerves", 0.0), ai.get("rhythm_streak", 0))
    target = estimate["target_to_beat"]

    max_target = persona["shot_target_max"]

    # If a duel drags, the AI can loosen slightly, but never into pointless 95+ shots.
    match_time = game_state.get("match_time", 0.0)
    if match_time > 24:
        max_target += 8
    elif match_time > 16:
        max_target += 4

    if ai.get("boss"):
        max_target += 3

    if target > min(max_target, 76):
        ai["last_ai_action"] = f"waiting for shot ({target}+)"
        return False

    # Brawler takes the shot faster. Coward hesitates even when safe.
    chance = persona["shot_chance"]
    if key == "coward" and target > 28:
        chance *= 0.65
    if key == "brawler" and target <= 58:
        chance *= 1.15
    if key == "deadeye" and target <= 38:
        chance *= 1.15

    decision = random.random() < min(0.80, chance)
    ai["last_ai_action"] = "drawing" if decision else f"holding shot ({target}+)"
    return decision


def maybe_use_boss_ability(ai: dict, human: dict, game_state: dict, now: float, clamp) -> str | None:
    if not ai.get("boss") or ai.get("is_reloading"):
        return None

    if now < ai.get("boss_ability_ready_at", 0.0):
        return None

    ability = ai.get("boss_ability")
    persona = personality_for(ai, game_state)
    cooldown = persona["ability_cooldown"] + random.uniform(2.0, 5.0)

    # Most boss moves should be pressure events, not constant punishment.
    if ability == "steal_focus":
        if game_state.get("match_time", 0.0) < 8.0 or human.get("accuracy", 0.0) < 50.0:
            return None
        stolen = min(16.0, human.get("accuracy", 0.0) * 0.30)
        if stolen < 8.0:
            return None
        human["accuracy"] = clamp(human["accuracy"] - stolen, 0.0, 100.0)
        ai["accuracy"] = clamp(ai["accuracy"] + stolen * 0.55, 0.0, 100.0)
        ai["boss_ability_ready_at"] = now + cooldown
        ai["last_ai_action"] = "stealing focus"
        return f"{ai['name']} stole your focus."

    if ability == "heat_spike":
        if game_state.get("tempo_pressure_until", 0.0) > now:
            return None
        if human.get("nerves", 0.0) > 72.0:
            return None

        # Less raw heat than before. The main danger is the temporary tempo spike.
        human["nerves"] = clamp(human["nerves"] + 14.0, 0.0, 100.0)
        human["taunt_until"] = now + 0.85
        game_state["tempo_pressure_until"] = now + 3.6
        game_state["tempo_pressure_name"] = "Quickdraw Fever"
        game_state["tempo_pressure_base_ms"] = game_state.get("beat_interval_ms", 800)
        game_state["beat_interval_ms"] = max(360, int(game_state.get("beat_interval_ms", 800) * 0.76))
        ai["boss_ability_ready_at"] = now + cooldown
        ai["last_ai_action"] = "forcing tempo"
        return f"{ai['name']} forced the tempo."

    if ability == "deadeye_focus":
        if ai.get("accuracy", 0.0) > 68.0:
            return None
        ai["accuracy"] = clamp(ai["accuracy"] + 24.0, 0.0, 100.0)
        ai["rhythm_streak"] += 2
        ai["boss_ability_ready_at"] = now + cooldown
        ai["last_ai_action"] = "finding aim"
        return f"{ai['name']} found perfect form."

    if ability == "spiral":
        if human.get("nerves", 0.0) > 78.0:
            return None
        human["nerves"] = clamp(human["nerves"] + 10.0, 0.0, 100.0)
        ai["nerves"] = clamp(ai["nerves"] + 5.0, 0.0, 100.0)
        ai["accuracy"] = clamp(ai["accuracy"] + 10.0, 0.0, 100.0)
        ai["boss_ability_ready_at"] = now + cooldown
        ai["last_ai_action"] = "spiraling"
        return f"{ai['name']} dragged the duel into a panic spiral."

    if ability == "legend_shift":
        round_number = game_state.get("round_number", 1)
        if round_number == 1:
            if human.get("accuracy", 0.0) < 45.0:
                return None
            human["accuracy"] = clamp(human["accuracy"] - 12.0, 0.0, 100.0)
            msg = f"{ai['name']} read your timing."
        elif round_number == 2:
            if game_state.get("tempo_pressure_until", 0.0) > now:
                return None
            human["nerves"] = clamp(human["nerves"] + 12.0, 0.0, 100.0)
            human["taunt_until"] = now + 0.8
            game_state["tempo_pressure_until"] = now + 3.4
            game_state["tempo_pressure_name"] = "Bell Rush"
            game_state["tempo_pressure_base_ms"] = game_state.get("beat_interval_ms", 800)
            game_state["beat_interval_ms"] = max(350, int(game_state.get("beat_interval_ms", 800) * 0.74))
            msg = f"{ai['name']} rang the street faster."
        else:
            if ai.get("accuracy", 0.0) > 72.0:
                return None
            ai["accuracy"] = clamp(ai["accuracy"] + 24.0, 0.0, 100.0)
            ai["rhythm_streak"] += 2
            msg = f"{ai['name']} locked onto the final beat."
        ai["boss_ability_ready_at"] = now + cooldown
        ai["last_ai_action"] = "legend shift"
        return msg

    return None
