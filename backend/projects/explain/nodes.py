"""
Expression tree helpers. Nodes are plain dicts in the exact JSON shape of the
frontend's `Node` type, so they can be returned to the browser as-is.
"""

from __future__ import annotations

from fractions import Fraction
from typing import Any

Node = dict[str, Any]


def num(value: float) -> Node:
    return {"type": "num", "value": value}


def const(name: str) -> Node:
    return {"type": "const", "name": name}


def var(name: str) -> Node:
    return {"type": "var", "name": name}


def neg(arg: Node) -> Node:
    return {"type": "neg", "arg": arg}


def bin_(op: str, left: Node, right: Node) -> Node:
    return {"type": "bin", "op": op, "left": left, "right": right}


def call(fn: str, arg: Node) -> Node:
    return {"type": "call", "fn": fn, "arg": arg}


def is_num(n: Node, value: float | None = None) -> bool:
    return n["type"] == "num" and (value is None or n["value"] == value)


def contains_var(n: Node, v: str) -> bool:
    t = n["type"]
    if t == "var":
        return n["name"] == v
    if t in ("neg", "call"):
        return contains_var(n["arg"], v)
    if t == "bin":
        return contains_var(n["left"], v) or contains_var(n["right"], v)
    return False


def collect_vars(n: Node, out: set[str] | None = None) -> set[str]:
    out = set() if out is None else out
    t = n["type"]
    if t == "var":
        out.add(n["name"])
    elif t in ("neg", "call"):
        collect_vars(n["arg"], out)
    elif t == "bin":
        collect_vars(n["left"], out)
        collect_vars(n["right"], out)
    return out


def size(n: Node) -> int:
    """Number of nodes — used to decide whether a rewrite is actually simpler."""
    t = n["type"]
    if t in ("neg", "call"):
        return 1 + size(n["arg"])
    if t == "bin":
        return 1 + size(n["left"]) + size(n["right"])
    return 1


def _is_int(v: float) -> bool:
    return float(v).is_integer()


def rat_of(n: Node) -> Fraction | None:
    """Rational constant (integer or integer/integer), else None."""
    t = n["type"]
    if t == "num":
        return Fraction(int(n["value"])) if _is_int(n["value"]) else None
    if t == "neg":
        r = rat_of(n["arg"])
        return -r if r is not None else None
    if (
        t == "bin"
        and n["op"] == "/"
        and n["left"]["type"] == "num"
        and n["right"]["type"] == "num"
        and _is_int(n["left"]["value"])
        and _is_int(n["right"]["value"])
        and n["right"]["value"] != 0
    ):
        return Fraction(int(n["left"]["value"]), int(n["right"]["value"]))
    return None
