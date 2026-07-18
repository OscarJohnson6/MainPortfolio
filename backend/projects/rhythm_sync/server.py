"""
Rhythm Sync — WebSocket game server (v6)
=========================================
"""

import asyncio
import json
import math
import os
import random
import time

import websockets

from projects.rhythm_sync import ai, campaign

# ---------------------------------------------------------------------------
# BALANCE
# ---------------------------------------------------------------------------
TICK_RATE          = 0.1
COUNTDOWN_SECONDS  = 3
ROUND_OVER_DELAY   = 3.0
ROLL_BUILDUP_TIME  = 2.2
RELOAD_TIME        = 2.5
RELOAD_NERVE_RECOVERY_PER_SEC = 18.0
ROUNDS_TO_WIN      = 2

# Beat / rhythm — windows slightly more forgiving as BPM climbs
BEAT_PERFECT       = 0.10
BEAT_GOOD          = 0.24
# Tighter windows in Wild West mode since the beat interval is smaller
BEAT_PERFECT_WW    = 0.06
BEAT_GOOD_WW       = 0.14

# Round-escalating tempos (seconds per beat)
ROUND_BEAT_INTERVALS = {
    1: 0.80,   # 75 BPM — teach the tempo
    2: 0.67,   # 90 BPM
    3: 0.57,   # 105 BPM — tight climax
}
# Wild West mode — 120/135/150 BPM. Anything faster than 150 makes the tap
# window math break: with a 400ms interval, there's no room for a meaningful
# "off beat" zone between beats.
ROUND_BEAT_INTERVALS_WW = {
    1: 0.50,   # 120 BPM
    2: 0.44,   # ~135 BPM
    3: 0.40,   # 150 BPM
}

# Anti-spam: taps faster than this interval are silently ignored. Cleaner
# than a cliff penalty — fast mashing simply doesn't register.
MIN_TAP_INTERVAL   = 0.25

# Tap reward curve
TAP_BASE           = 1.8
TAP_PEAK           = 6.0
TAP_RAMP           = 5.0
GOOD_MULTIPLIER    = 0.6

QUALITY_ALPHA      = 0.35

# Nerves model
NERVE_BASELINE     = 15.0
NERVE_ENGAGED_TAU  = 16.0
NERVE_REST_TAU     = 7.0
NERVE_CAP          = 100.0
ENGAGED_WINDOW     = 3.0

TAP_PERFECT_CALM   = 4.0
TAP_GOOD_CALM      = 1.6
TAP_MISS_NERVE_MAX = 6.0

# Missed-beat penalty (beat passed without an on-window tap from the player)
MISSED_BEAT_NERVE  = 0.8

MISS_NERVE_PENALTY   = 18.0
MISS_ACCURACY_RESET  = 20.0

# Taunt mechanic — dump accuracy to rattle the opponent
TAUNT_SELF_ACC_COST  = 20.0
TAUNT_OPP_NERVE_COST = 12.0
TAUNT_COOLDOWN       = 6.0   # seconds between taunts per player
TAUNT_DURATION       = 1.1   # how long the opponent's "sand in eyes" lasts

STREAK_BONUS_THRESH  = 4
HISTORY_FILE         = "match_history.json"

# ---------------------------------------------------------------------------
# STATE
# ---------------------------------------------------------------------------
PLAYERS = {}
# Extra browser connections are kept as queued spectators instead of being
# rejected. This avoids the "Saloon's full" screen during dev reloads and lets
# the app remain viewable while a duel/campaign is already active.
QUEUED = {}
AI_PLAYER = None
CAMPAIGN_STAGE_INDEX = 0

game_state = {
    "phase": "LOBBY",
    "timer": 0,
    "match_time": 0.0,
    "connected": 0,      # active human browser players only; AI is not counted here
    "ready": 0,          # active human ready count only
    "ai_connected": 0,
    "combatants": 0,
    "round_number": 1,
    "rounds_to_win": ROUNDS_TO_WIN,
    "round_winner": None,
    "match_winner": None,
    "last_roll": None,
    "beat_interval_ms": int(0.80 * 1000),
    "beat_index": 0,
    "last_beat_at": 0.0,
    "wild_west": False,        # set during ready-up via host vote
    "wild_west_votes": 0,      # how many players voted for WW mode
    "mode": "MULTIPLAYER",
    "campaign": None,
    "campaign_complete": False,
    "match_recorded": False,
    "tempo_pressure_until": 0.0,
    "tempo_pressure_name": None,
    "tempo_pressure_base_ms": None,
}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def random_name():
    return f"Gunslinger_{random.randint(1000, 9999)}"


def make_player(player_id):
    return {
        "id": player_id,
        "name": random_name(),
        "accuracy": 0.0,
        "nerves": 0.0,
        "ready": False,
        "is_reloading": False,
        "round_wins": 0,
        "rhythm_streak": 0,
        "rhythm_quality": 0.0,
        "last_tap_quality": "none",
        "last_tap_at": 0.0,
        "tap_counter": 0,
        "calibrated": False,
        "last_scored_beat": 0,
        "taunt_until": 0.0,        # wall-clock timestamp; while > now, "sand in eyes"
        "taunt_ready_at": 0.0,     # cooldown — can't taunt until now >= this
        "vote_wild_west": False,   # per-player WW mode vote
        "is_ai": False,
        "ai_personality": None,
        "ai_personality_label": None,
        "boss": False,
        "boss_ability": None,
    }


def all_players():
    players = list(PLAYERS.values())
    if AI_PLAYER is not None:
        players.append(AI_PLAYER)
    return players


def human_players():
    return list(PLAYERS.values())


def get_ai_player():
    return AI_PLAYER


def client_connections():
    """All browser sockets that should receive state broadcasts."""
    return list(PLAYERS.keys()) + list(QUEUED.keys())


def sync_counts():
    """Sync display counts.

    connected/ready intentionally count active human browser players only.
    The AI is a combatant, not a socket connection. This keeps campaign from
    looking like a phantom second user is connected.
    """
    humans = human_players()
    game_state["connected"] = len(humans)
    game_state["ready"] = sum(1 for p in humans if p.get("ready"))
    game_state["ai_connected"] = 1 if AI_PLAYER is not None else 0
    game_state["combatants"] = len(all_players())


def cleanup_dead_socket(ws):
    """Remove a dead socket from active/queued collections.

    Returns the removed active player, if any. If a dead active player was part
    of a running duel/campaign, reset the global match so stale sockets cannot
    leave the app stuck in a fake occupied state.
    """
    departing = PLAYERS.pop(ws, None)
    queued_departing = QUEUED.pop(ws, None)

    if departing and (is_campaign() or game_state["phase"] not in ("LOBBY", "READY_UP")):
        reset_match()
    elif queued_departing:
        sync_counts()

    return departing


async def safe_send(ws, msg: str) -> bool:
    try:
        await ws.send(msg)
        return True
    except Exception as exc:
        print(f"[WARN] broadcast failed: {exc}")
        cleanup_dead_socket(ws)
        sync_counts()
        return False


async def send_direct(ws, msg_dict) -> bool:
    return await safe_send(ws, json.dumps(msg_dict))


async def broadcast(msg_dict):
    clients = client_connections()
    if not clients:
        return

    msg = json.dumps(msg_dict)
    for ws in list(clients):
        await safe_send(ws, msg)


async def send_state(event_type="STATE_UPDATE"):
    await broadcast({
        "type": event_type,
        "server_time": time.time(),
        "state": game_state,
        "players": all_players(),
    })


# ---------------------------------------------------------------------------
# DUEL MATH
# ---------------------------------------------------------------------------
def compute_shot(accuracy, nerves, streak):
    a = max(0.0, accuracy) / 10.0
    n = max(0.0, nerves) / 10.0

    accuracy_component = (a ** 1.5) * 3.0
    nerves_component   = (n ** 1.1) * 2.5
    streak_bonus = (min(streak - STREAK_BONUS_THRESH, 10) * 1.5
                    if streak > STREAK_BONUS_THRESH else 0.0)

    # hit_chance is the probability (in %) that the d100 roll lands at or
    # below your threshold. Higher accuracy + lower nerves = higher hit_chance.
    raw_threshold = accuracy_component - nerves_component + streak_bonus
    hit_chance = clamp(raw_threshold, 5.0, 95.0)
    was_clamped = (raw_threshold != hit_chance)

    raw_roll = random.randint(1, 100)

    # Display-facing numbers. The player sees a d100 "performance" and a
    # "target to beat" — both concrete numbers instead of a number vs a
    # probability. This is equivalent to the old roll<=hit_chance math:
    #   display_roll = 101 - raw_roll
    #   target = 101 - hit_chance
    #   display_roll >= target  iff  raw_roll <= hit_chance
    display_roll = 101 - raw_roll
    target_to_beat = max(1, round(101 - hit_chance))

    return {
        # Primary display fields — what the UI reads
        "roll": display_roll,
        "target_to_beat": target_to_beat,
        "hit": raw_roll <= hit_chance,

        # Supporting fields
        "hit_chance": round(hit_chance, 1),
        "raw_roll": raw_roll,               # original d100, for anyone who wants it
        "needed": round(hit_chance, 1),     # legacy alias
        "raw_threshold": round(raw_threshold, 1),
        "was_clamped": was_clamped,
        "accuracy_component": round(accuracy_component, 1),
        "nerves_component": round(nerves_component, 1),
        "streak_bonus": round(streak_bonus, 1),
        "raw_accuracy": round(accuracy, 1),
        "raw_nerves": round(nerves, 1),
        "streak": streak,
    }


# ---------------------------------------------------------------------------
# RHYTHM
# ---------------------------------------------------------------------------
def beat_interval_seconds():
    return game_state["beat_interval_ms"] / 1000.0


def distance_to_beat(now):
    last_beat = game_state["last_beat_at"]
    if last_beat <= 0:
        return float("inf")
    bi = beat_interval_seconds()
    elapsed = now - last_beat
    return min(abs(elapsed), abs(bi - elapsed))


def classify_tap(distance):
    perfect = BEAT_PERFECT_WW if game_state["wild_west"] else BEAT_PERFECT
    good    = BEAT_GOOD_WW    if game_state["wild_west"] else BEAT_GOOD
    if distance <= perfect:
        return "perfect"
    if distance <= good:
        return "good"
    return "miss"


def tap_accuracy_reward(streak, quality):
    base = TAP_BASE + (TAP_PEAK - TAP_BASE) * (1 - math.exp(-streak / TAP_RAMP))
    if quality == "perfect":
        return base
    if quality == "good":
        return base * GOOD_MULTIPLIER
    return 0.0


def tap_nerve_delta(distance, quality):
    if quality == "perfect":
        return -TAP_PERFECT_CALM
    if quality == "good":
        frac = (distance - BEAT_PERFECT) / max(0.001, (BEAT_GOOD - BEAT_PERFECT))
        return -TAP_GOOD_CALM + (TAP_GOOD_CALM * frac)
    bi = beat_interval_seconds()
    excess = distance - BEAT_GOOD
    max_excess = max(0.001, (bi / 2.0) - BEAT_GOOD)
    return clamp(TAP_MISS_NERVE_MAX * (excess / max_excess), 0.0, TAP_MISS_NERVE_MAX)


def tap_quality_score(distance):
    bi = beat_interval_seconds()
    norm = min(distance / (bi / 2.0), 1.0)
    return 1.0 - (norm ** 0.7)


def apply_tap(player, now):
    # Anti-spam: silently drop taps faster than MIN_TAP_INTERVAL apart.
    # Cleaner than penalty — you literally cannot mash your way through.
    if player["last_tap_at"] > 0 and (now - player["last_tap_at"]) < MIN_TAP_INTERVAL:
        return

    player["tap_counter"] += 1

    # Calibration fires ONCE per round, on the very first tap.
    if not player["calibrated"]:
        player["calibrated"] = True
        player["last_tap_at"] = now
        player["last_tap_quality"] = "calibrate"
        player["last_scored_beat"] = game_state["beat_index"]
        return

    distance = distance_to_beat(now)
    if distance == float("inf"):
        return

    quality = classify_tap(distance)
    player["last_tap_quality"] = quality
    player["last_tap_at"] = now
    player["last_scored_beat"] = game_state["beat_index"]

    if quality in ("perfect", "good"):
        player["rhythm_streak"] += 1
        reward = tap_accuracy_reward(player["rhythm_streak"], quality)
        player["accuracy"] = clamp(player["accuracy"] + reward, 0.0, 100.0)
    else:
        player["rhythm_streak"] = 0

    player["nerves"] = clamp(
        player["nerves"] + tap_nerve_delta(distance, quality),
        0.0, 100.0,
    )

    sample = tap_quality_score(distance)
    player["rhythm_quality"] = (
        QUALITY_ALPHA * sample + (1 - QUALITY_ALPHA) * player["rhythm_quality"]
    )


# ---------------------------------------------------------------------------
# PERSISTENCE
# ---------------------------------------------------------------------------
def write_match_to_disk(final_state, players_list):
    entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "match_winner_id": final_state["match_winner"],
        "match_winner_name": next(
            (p["name"] for p in players_list if p["id"] == final_state["match_winner"]),
            "Unknown",
        ),
        "total_rounds_played": final_state["round_number"],
        "beat_interval_ms": final_state["beat_interval_ms"],
        "players": [
            {"id": p["id"], "name": p.get("name", "Unknown"), "wins": p["round_wins"]}
            for p in players_list
        ],
    }
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        except json.JSONDecodeError:
            history = []
    history.append(entry)
    history = history[-200:]
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)
    print(f"[DB] match appended (winner={entry['match_winner_name']})")


def read_history_from_disk():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return []



# ---------------------------------------------------------------------------
# CAMPAIGN HELPERS
# ---------------------------------------------------------------------------
def is_campaign():
    return game_state.get("mode") == "CAMPAIGN"


def get_human_player():
    players = human_players()
    return players[0] if players else None


def clear_campaign():
    global AI_PLAYER
    AI_PLAYER = None
    game_state["campaign"] = None
    game_state["campaign_complete"] = False


def start_campaign(stage_index=0, human=None):
    global AI_PLAYER, CAMPAIGN_STAGE_INDEX

    human = human or get_human_player()
    if not human:
        return False

    CAMPAIGN_STAGE_INDEX = max(0, min(stage_index, campaign.stage_count() - 1))
    stage = campaign.get_stage(CAMPAIGN_STAGE_INDEX)
    AI_PLAYER = campaign.make_ai_player("ai-opponent", stage)
    ai.init_ai_runtime(AI_PLAYER, time.time())

    game_state.update({
        "phase": "COUNTDOWN",
        "timer": 0,
        "match_time": 0.0,
        "round_number": 1,
        "round_winner": None,
        "match_winner": None,
        "last_roll": None,
        "beat_index": 0,
        "last_beat_at": 0.0,
        "mode": "CAMPAIGN",
        "campaign": campaign.campaign_summary(CAMPAIGN_STAGE_INDEX),
        "campaign_complete": False,
        "match_recorded": False,
        "wild_west": bool(stage.get("wild_west")),
        "wild_west_votes": 1 if stage.get("wild_west") else 0,
        "tempo_pressure_until": 0.0,
        "tempo_pressure_name": None,
        "tempo_pressure_base_ms": None,
    })

    for p in all_players():
        p.update({
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
            "calibrated": bool(p.get("is_ai")),
            "last_scored_beat": 0,
            "taunt_until": 0.0,
            "taunt_ready_at": 0.0,
            "next_ai_decision_at": time.time() + random.uniform(1.0, 2.0) if p.get("is_ai") else 0.0,
            "last_ai_action": "waiting" if p.get("is_ai") else p.get("last_ai_action"),
        })

    sync_counts()
    return True


def start_next_campaign_stage():
    next_index = CAMPAIGN_STAGE_INDEX + 1
    if next_index >= campaign.stage_count():
        game_state["campaign_complete"] = True
        return False
    return start_campaign(next_index)


async def apply_taunt_from_player(
    player,
    target=None,
    *,
    cooldown: float | None = None,
    nerve_cost: float | None = None,
    duration: float | None = None,
    accuracy_cost: float | None = None,
):
    now = time.time()
    cooldown = TAUNT_COOLDOWN if cooldown is None else cooldown
    nerve_cost = TAUNT_OPP_NERVE_COST if nerve_cost is None else nerve_cost
    duration = TAUNT_DURATION if duration is None else duration
    accuracy_cost = TAUNT_SELF_ACC_COST if accuracy_cost is None else accuracy_cost

    if now < player["taunt_ready_at"]:
        return False

    if player["accuracy"] < accuracy_cost:
        return False

    player["accuracy"] = clamp(player["accuracy"] - accuracy_cost, 0.0, 100.0)
    player["taunt_ready_at"] = now + cooldown

    targets = [target] if target else [
        other for other in all_players() if other["id"] != player["id"]
    ]

    for other in targets:
        if not other:
            continue
        other["nerves"] = clamp(other["nerves"] + nerve_cost, 0.0, NERVE_CAP)
        other["taunt_until"] = now + duration

    await broadcast({
        "type": "NOTIFY",
        "msg": f"{player['name']} kicked sand!",
    })
    await send_state("ACTION_RESOLVED")
    return True


def maybe_restore_tempo(now: float | None = None) -> bool:
    """Restore round tempo after a temporary boss tempo-pressure effect."""
    now = time.time() if now is None else now
    until = game_state.get("tempo_pressure_until", 0.0) or 0.0
    if until and now >= until:
        game_state["tempo_pressure_until"] = 0.0
        game_state["tempo_pressure_name"] = None
        game_state["tempo_pressure_base_ms"] = None
        set_tempo_for_round(game_state.get("round_number", 1))
        return True
    return False


async def start_gameplay_loops():
    """Start fresh PLAYING loops after countdown or after a missed shot.

    Entering ROLLING intentionally stops the beat/timer loops. If a shot misses,
    the phase returns to PLAYING, so the loops must be started again or the beat
    ring will freeze/disappear.
    """
    asyncio.create_task(match_timer())
    asyncio.create_task(beat_task())
    if is_campaign():
        asyncio.create_task(ai_driver())


async def ai_driver():
    """Single-player AI loop. Uses campaign.py for personality decisions."""
    last_beat_seen = 0

    while game_state["phase"] == "PLAYING" and is_campaign():
        await asyncio.sleep(0.08)

        ai_player = get_ai_player()
        human = get_human_player()
        if not ai_player or not human:
            return

        changed = False
        now = time.time()

        changed = maybe_restore_tempo(now) or changed

        if game_state["beat_index"] != last_beat_seen:
            last_beat_seen = game_state["beat_index"]
            changed = ai.apply_ai_rhythm(ai_player, game_state, clamp) or changed

        if ai.should_make_decision(ai_player, now):
            ai.schedule_next_decision(ai_player, game_state, now)

            boss_msg = ai.maybe_use_boss_ability(ai_player, human, game_state, now, clamp)
            if boss_msg:
                await broadcast({"type": "NOTIFY", "msg": boss_msg})
                changed = True

            elif ai.should_ai_taunt(ai_player, human, now, game_state):
                did_taunt = await apply_taunt_from_player(
                    ai_player,
                    target=human,
                    cooldown=ai.campaign_taunt_cooldown(ai_player, game_state),
                    nerve_cost=TAUNT_OPP_NERVE_COST,
                    duration=TAUNT_DURATION,
                )
                changed = changed or did_taunt

            elif game_state["phase"] == "PLAYING" and ai.should_ai_shoot(ai_player, game_state):
                shot = compute_shot(ai_player["accuracy"], ai_player["nerves"], ai_player["rhythm_streak"])
                asyncio.create_task(play_roll_buildup(ai_player, shot))
                return

        if changed:
            await send_state("ACTION_RESOLVED")


# ---------------------------------------------------------------------------
# FLOW
# ---------------------------------------------------------------------------
def set_tempo_for_round(round_number):
    """Round-escalating BPM — pulls from the Wild West table if mode is on."""
    table = ROUND_BEAT_INTERVALS_WW if game_state["wild_west"] else ROUND_BEAT_INTERVALS
    interval = table.get(round_number, list(table.values())[-1])
    game_state["beat_interval_ms"] = int(interval * 1000)


def reset_match():
    clear_campaign()
    game_state.update({
        "phase": "LOBBY" if len(PLAYERS) < 2 else "READY_UP",
        "timer": 0,
        "match_time": 0.0,
        "round_number": 1,
        "round_winner": None,
        "match_winner": None,
        "last_roll": None,
        "beat_index": 0,
        "wild_west": False,
        "wild_west_votes": 0,
        "mode": "MULTIPLAYER",
        "campaign": None,
        "campaign_complete": False,
        "match_recorded": False,
        "tempo_pressure_until": 0.0,
        "tempo_pressure_name": None,
        "tempo_pressure_base_ms": None,
    })
    for p in all_players():
        p.update({
            "accuracy": 0.0,
            "nerves": 0.0,
            "ready": False,
            "is_reloading": False,
            "round_wins": 0,
            "rhythm_streak": 0,
            "rhythm_quality": 0.0,
            "last_tap_quality": "none",
            "last_tap_at": 0.0,
            "tap_counter": 0,
            "calibrated": False,
            "last_scored_beat": 0,
            "taunt_until": 0.0,
            "taunt_ready_at": 0.0,
            "vote_wild_west": False,
        })
    sync_counts()


def reset_round_stats():
    for p in all_players():
        p.update({
            "accuracy": 0.0,
            "nerves": 0.0,
            "is_reloading": False,
            "rhythm_streak": 0,
            "rhythm_quality": 0.0,
            "last_tap_quality": "none",
            "last_tap_at": 0.0,
            "tap_counter": 0,
            "calibrated": bool(p.get("is_ai")),
            "last_scored_beat": 0,
            "taunt_until": 0.0,
            "taunt_ready_at": 0.0,
            "next_ai_decision_at": time.time() + random.uniform(1.0, 2.0) if p.get("is_ai") else 0.0,
            "last_ai_action": "waiting" if p.get("is_ai") else p.get("last_ai_action"),
        })


async def resolve_round_winner(winner_id):
    # Guard against two pending roll tasks resolving the same round/match.
    if game_state.get("phase") == "MATCH_OVER" or game_state.get("match_winner"):
        return

    winner = next((p for p in all_players() if p["id"] == winner_id), None)
    if not winner:
        return

    winner["round_wins"] += 1
    game_state["phase"] = "ROUND_OVER"
    game_state["round_winner"] = winner_id
    await send_state()

    if winner["round_wins"] >= ROUNDS_TO_WIN:
        game_state["match_winner"] = winner_id
        game_state["phase"] = "MATCH_OVER"

        if not game_state.get("match_recorded"):
            game_state["match_recorded"] = True
            asyncio.create_task(
                asyncio.to_thread(write_match_to_disk, dict(game_state), all_players())
            )

        await send_state()
    else:
        await asyncio.sleep(ROUND_OVER_DELAY)
        if len(all_players()) < 2:
            return
        if game_state.get("phase") != "ROUND_OVER":
            return

        game_state["round_number"] += 1
        game_state["phase"] = "COUNTDOWN"
        game_state["round_winner"] = None
        game_state["last_roll"] = None
        reset_round_stats()
        await send_state()
        asyncio.create_task(countdown_task())


async def reset_reload_for_player(player_id):
    await asyncio.sleep(RELOAD_TIME)
    for p in all_players():
        if p["id"] == player_id:
            p["is_reloading"] = False
            p["last_tap_at"] = 0.0
            p["rhythm_streak"] = 0
            p["rhythm_quality"] = 0.0
            p["last_tap_quality"] = "none"
            p["calibrated"] = bool(p.get("is_ai"))
            p["last_scored_beat"] = game_state["beat_index"]
            await send_state()
            return


async def countdown_task():
    # At the start of round 1 ONLY, finalize Wild West mode based on votes.
    # Requires BOTH players to vote yes.
    if game_state["round_number"] == 1 and not is_campaign():
        yes_votes = sum(1 for p in human_players() if p.get("vote_wild_west"))
        game_state["wild_west"] = (yes_votes == len(human_players()) == 2)

    set_tempo_for_round(game_state["round_number"])
    bpm = 60000 // game_state["beat_interval_ms"]
    mode_tag = "WILD WEST" if game_state["wild_west"] else ""
    msg = f"Round {game_state['round_number']} — {bpm} BPM"
    if mode_tag:
        msg += f" · {mode_tag}"
    await broadcast({"type": "NOTIFY", "msg": msg})

    for i in range(COUNTDOWN_SECONDS, 0, -1):
        if game_state["phase"] != "COUNTDOWN":
            return
        game_state["timer"] = i
        await send_state()
        await asyncio.sleep(1)

    if game_state["phase"] == "COUNTDOWN":
        game_state["phase"] = "PLAYING"
        game_state["timer"] = 0
        game_state["match_time"] = 0.0
        game_state["beat_index"] = 0
        await send_state()
        await start_gameplay_loops()


async def match_timer():
    """Nerves dynamics + missed-beat detection."""
    while game_state["phase"] == "PLAYING":
        await asyncio.sleep(TICK_RATE)
        game_state["match_time"] += TICK_RATE

        now = time.time()
        for p in all_players():
            if p["is_reloading"]:
                # Reloading acts as a forced breathing/reset window after a bad shot.
                p["nerves"] = clamp(
                    p["nerves"] - RELOAD_NERVE_RECOVERY_PER_SEC * TICK_RATE,
                    0.0,
                    NERVE_CAP,
                )
                continue

            # Nerves dynamics
            if p["last_tap_at"] == 0:
                delta = (NERVE_CAP - p["nerves"]) / (NERVE_ENGAGED_TAU * 2.0) * TICK_RATE
                p["nerves"] = clamp(p["nerves"] + delta, 0.0, NERVE_CAP)
            else:
                time_since_tap = now - p["last_tap_at"]
                if time_since_tap < ENGAGED_WINDOW:
                    delta = (NERVE_CAP - p["nerves"]) / NERVE_ENGAGED_TAU * TICK_RATE
                else:
                    delta = -(p["nerves"] - NERVE_BASELINE) / NERVE_REST_TAU * TICK_RATE
                p["nerves"] = clamp(p["nerves"] + delta, 0.0, NERVE_CAP)


async def beat_task():
    """Emit beats + detect missed beats per player."""
    while game_state["phase"] == "PLAYING":
        restored_tempo = maybe_restore_tempo()
        game_state["beat_index"] += 1
        game_state["last_beat_at"] = time.time()

        # Missed-beat check: if a calibrated player hasn't scored on the last
        # 2+ beats, they've been ignoring the rhythm. Small nerve tick + label.
        # (Skipping the first two beats of a round gives a grace period.)
        if game_state["beat_index"] > 2:
            for p in all_players():
                if not p["calibrated"] or p["is_reloading"]:
                    continue
                missed = game_state["beat_index"] - p["last_scored_beat"]
                if missed >= 2:
                    p["nerves"] = clamp(p["nerves"] + MISSED_BEAT_NERVE, 0.0, NERVE_CAP)
                    p["last_tap_quality"] = "fail"
                    p["tap_counter"] += 1  # trigger client flash
                    # Don't reset last_scored_beat — keep penalizing each missed beat

        await broadcast({
            "type": "BEAT",
            "beat_index": game_state["beat_index"],
            "interval_ms": game_state["beat_interval_ms"],
            "server_time": game_state["last_beat_at"],
        })
        if restored_tempo:
            await send_state("ACTION_RESOLVED")
        # After broadcasting BEAT, also re-send state if any nerves changed
        # from missed-beat penalties. We piggyback on the next TICK_RATE loop
        # to avoid spamming the socket.
        await asyncio.sleep(beat_interval_seconds())


async def play_roll_buildup(player, shot):
    # Multiple inputs/AI decisions can schedule a shot at nearly the same time.
    # Only the first one should own the roll animation and round resolution.
    if game_state.get("phase") != "PLAYING":
        return

    game_state["phase"] = "ROLLING"
    game_state["last_roll"] = {"player_id": player["id"], **shot}
    await send_state("ROLL_START")
    await asyncio.sleep(ROLL_BUILDUP_TIME)

    if game_state["phase"] != "ROLLING":
        return

    if shot["hit"]:
        await resolve_round_winner(player["id"])
    else:
        player["is_reloading"] = True
        player["accuracy"] = MISS_ACCURACY_RESET
        player["nerves"] = clamp(player["nerves"] + MISS_NERVE_PENALTY, 0.0, NERVE_CAP)
        player["rhythm_streak"] = 0
        player["rhythm_quality"] = 0.0
        game_state["phase"] = "PLAYING"
        game_state["last_beat_at"] = 0.0
        game_state["beat_index"] += 1
        await broadcast({
            "type": "NOTIFY",
            "msg": f"{player['name']} missed — rolled {shot['roll']}, needed {shot['target_to_beat']}+",
        })
        await send_state("ACTION_RESOLVED")
        asyncio.create_task(reset_reload_for_player(player["id"]))
        await start_gameplay_loops()



async def move_other_players_to_queue(active_websocket):
    """Make the requesting socket the only active human for campaign.

    This preserves the small-scope design: one campaign or one multiplayer duel
    at a time. Extra tabs/users stay connected as spectators instead of blocking
    campaign start or forcing a server restart.
    """
    for other_ws, other_player in list(PLAYERS.items()):
        if other_ws is active_websocket:
            continue

        PLAYERS.pop(other_ws, None)
        other_player["queued"] = True
        other_player["is_spectator"] = True
        other_player["ready"] = False
        QUEUED[other_ws] = other_player

        ok = await send_direct(other_ws, {
            "type": "INIT",
            "id": other_player["id"],
            "queued": True,
            "spectator": True,
        })
        if ok:
            await send_direct(other_ws, {
                "type": "NOTIFY",
                "msg": "Campaign started. You are watching until a slot opens.",
            })

    sync_counts()


async def promote_queued_players():
    """Promote queued spectators into active player slots when room opens."""
    promoted = []

    while len(PLAYERS) < 2 and QUEUED and not is_campaign():
        websocket, player = next(iter(QUEUED.items()))
        QUEUED.pop(websocket, None)

        player["queued"] = False
        player["is_spectator"] = False
        player["ready"] = False
        PLAYERS[websocket] = player
        promoted.append(player)

        ok = await send_direct(websocket, {
            "type": "INIT",
            "id": player["id"],
            "queued": False,
            "spectator": False,
        })
        if ok:
            await send_direct(websocket, {
                "type": "NOTIFY",
                "msg": "A duel slot opened. You are now a player.",
            })
        else:
            PLAYERS.pop(websocket, None)

    if promoted and len(PLAYERS) == 2 and game_state["phase"] == "LOBBY":
        game_state["phase"] = "READY_UP"

    sync_counts()
    return promoted


# ---------------------------------------------------------------------------
# HANDLER
# ---------------------------------------------------------------------------
async def handler(websocket, path=None):
    player_id = str(id(websocket))
    player = make_player(player_id)

    # Do not reject extra connections. Put them into a passive queue/spectator
    # bucket so dev reloads, second tabs, and demos do not get stuck on a
    # "server full" screen. Active gameplay still only uses PLAYERS.
    can_join_as_player = len(PLAYERS) < 2 and not is_campaign()

    if can_join_as_player:
        PLAYERS[websocket] = player
        role_payload = {"queued": False, "spectator": False}
    else:
        player["queued"] = True
        player["is_spectator"] = True
        player["ready"] = False
        QUEUED[websocket] = player
        role_payload = {"queued": True, "spectator": True}

    sync_counts()

    await send_direct(websocket, {"type": "INIT", "id": player_id, **role_payload})

    if len(PLAYERS) == 2 and game_state["phase"] == "LOBBY":
        game_state["phase"] = "READY_UP"

    if role_payload["queued"]:
        await send_direct(websocket, {
            "type": "NOTIFY",
            "msg": "Duel is active. You are watching until a slot opens.",
        })

    await send_state()

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")
            player = PLAYERS.get(websocket)
            queued_player = QUEUED.get(websocket)

            if not player:
                if msg_type == "GET_HISTORY":
                    hist = await asyncio.to_thread(read_history_from_disk)
                    await send_direct(websocket, {"type": "HISTORY", "history": hist})
                elif msg_type == "SET_NAME" and queued_player:
                    name = str(data.get("name", "")).strip()[:20]
                    if name:
                        queued_player["name"] = name
                        await send_state()
                continue

            if msg_type == "SET_NAME":
                name = str(data.get("name", "")).strip()[:20]
                if name:
                    old_name = player["name"]
                    player["name"] = name
                    if old_name != name:
                        await broadcast({"type": "NOTIFY", "msg": f"{name} stepped onto the street."})
                    await send_state()

            elif msg_type == "START_CAMPAIGN" and game_state["phase"] in ("LOBBY", "READY_UP", "MATCH_OVER"):
                # Campaign is single-player. The requesting browser becomes the
                # active human player; any other active browsers become queued
                # spectators instead of blocking campaign start.
                await move_other_players_to_queue(websocket)

                stage_index = int(data.get("stage_index", 0) or 0)
                if start_campaign(stage_index, human=player):
                    await send_state()
                    asyncio.create_task(countdown_task())

            elif msg_type == "NEXT_CAMPAIGN" and game_state["phase"] == "MATCH_OVER" and is_campaign():
                human = get_human_player()
                if human and game_state.get("match_winner") == human["id"]:
                    if start_next_campaign_stage():
                        await send_state()
                        asyncio.create_task(countdown_task())
                    else:
                        game_state["campaign_complete"] = True
                        await send_state()

            elif msg_type == "READY" and game_state["phase"] == "READY_UP" and not is_campaign():
                player["ready"] = True
                sync_counts()
                await send_state()
                if game_state["ready"] == 2 and len(human_players()) == 2:
                    game_state["phase"] = "COUNTDOWN"
                    await send_state()
                    asyncio.create_task(countdown_task())

            elif msg_type == "VOTE_WILD_WEST" and game_state["phase"] in ("LOBBY", "READY_UP"):
                # Toggle this player's vote. Mode activates at countdown if BOTH voted.
                player["vote_wild_west"] = bool(data.get("value", False))
                game_state["wild_west_votes"] = sum(
                    1 for p in human_players() if p.get("vote_wild_west")
                )
                await send_state()

            elif msg_type == "TAP" and game_state["phase"] == "PLAYING" and not player["is_reloading"]:
                apply_tap(player, time.time())
                await send_state()

            elif msg_type == "TAUNT" and game_state["phase"] == "PLAYING" and not player["is_reloading"]:
                did_taunt = await apply_taunt_from_player(player)
                if not did_taunt and player["accuracy"] < TAUNT_SELF_ACC_COST:
                    await send_direct(websocket, {
                        "type": "NOTIFY",
                        "msg": f"Need {TAUNT_SELF_ACC_COST:.0f} accuracy to taunt.",
                    })


            elif msg_type == "SHOOT" and game_state["phase"] == "PLAYING" and not player["is_reloading"]:
                shot = compute_shot(player["accuracy"], player["nerves"], player["rhythm_streak"])
                asyncio.create_task(play_roll_buildup(player, shot))

            elif msg_type == "RESTART_MATCH":
                reset_match()
                await send_state()

            elif msg_type == "EXIT_CAMPAIGN":
                reset_match()
                await send_state()

            elif msg_type == "RESTART_CAMPAIGN":
                await move_other_players_to_queue(websocket)
                if start_campaign(CAMPAIGN_STAGE_INDEX, human=player):
                    await send_state()
                    asyncio.create_task(countdown_task())

            elif msg_type == "GET_HISTORY":
                hist = await asyncio.to_thread(read_history_from_disk)
                await send_direct(websocket, {"type": "HISTORY", "history": hist})

    except websockets.ConnectionClosed:
        pass
    finally:
        was_active = websocket in PLAYERS
        departing = cleanup_dead_socket(websocket)

        if departing:
            if len(PLAYERS) >= 1:
                await broadcast({"type": "NOTIFY", "msg": f"{departing['name']} left the duel."})

            await promote_queued_players()

            if len(PLAYERS) < 2 and not is_campaign():
                game_state["phase"] = "LOBBY"
        elif not was_active:
            sync_counts()

        sync_counts()
        await send_state()


async def main():
    port = 8765
    print(f"Rhythm Sync server on ws://0.0.0.0:{port}")
    async with websockets.serve(handler, "0.0.0.0", port):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())