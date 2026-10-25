"""
Tokenizer + Pratt parser. The input is gospel: nothing is silently rewritten.
Anything ambiguous is reported as a diagnostic, with a suggestion when there
is an obvious fix the user can click.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .nodes import Node, collect_vars

FN_ALIASES = {
    "sin": "sin", "cos": "cos", "tan": "tan", "sec": "sec", "csc": "csc", "cot": "cot",
    "asin": "asin", "acos": "acos", "atan": "atan",
    "arcsin": "asin", "arccos": "acos", "arctan": "atan",
    "sinh": "sinh", "cosh": "cosh", "tanh": "tanh",
    "asinh": "asinh", "acosh": "acosh", "atanh": "atanh",
    "sqrt": "sqrt", "cbrt": "cbrt", "abs": "abs", "exp": "exp", "ln": "ln", "log": "log",
}
# Longest first so "asin" wins over "a"+"sin" and "sinh" over "sin"+"h".
FN_NAMES = sorted(FN_ALIASES, key=len, reverse=True)

NUM_RE = re.compile(r"[0-9]+\.?[0-9]*|\.[0-9]+")
WORD_RE = re.compile(r"[a-zA-Z]+")

Diagnostic = dict[str, Any]


@dataclass
class Token:
    type: str  # num | var | const | func | op | lparen | rparen | eq
    text: str
    start: int
    end: int
    value: float | None = None
    name: str | None = None
    fn: str | None = None


class ParseError(Exception):
    def __init__(self, message: str, start: int, end: int, suggestion: dict | None = None, code: str = "parse-error"):
        super().__init__(message)
        self.message = message
        self.start = start
        self.end = end
        self.suggestion = suggestion
        self.code = code


def tokenize(src: str, settings: dict[str, Any]) -> tuple[list[Token], list[Diagnostic]]:
    tokens: list[Token] = []
    notes: list[Diagnostic] = []
    consts = bool(settings.get("recognizeConstants"))
    i = 0
    n = len(src)

    single = {
        "+": ("op", "+"), "-": ("op", "-"), "−": ("op", "-"),
        "×": ("op", "*"), "·": ("op", "*"), "⋅": ("op", "*"), "∙": ("op", "*"),
        "/": ("op", "/"), "÷": ("op", "/"), "^": ("op", "^"),
        "(": ("lparen", "("), "[": ("lparen", "("), "{": ("lparen", "("),
        ")": ("rparen", ")"), "]": ("rparen", ")"), "}": ("rparen", ")"),
        "=": ("eq", "="),
    }

    while i < n:
        ch = src[i]

        if ch.isspace():
            i += 1
            continue

        if ch in "0123456789.":
            m = NUM_RE.match(src, i)
            if not m:
                raise ParseError(f'Stray "." at position {i + 1}', i, i + 1, None, "stray-dot")
            tokens.append(Token("num", m.group(0), i, m.end(), value=float(m.group(0))))
            i = m.end()
            continue

        if ch.isascii() and ch.isalpha():
            run = WORD_RE.match(src, i).group(0)
            j = 0
            while j < len(run):
                rest = run[j:]
                start = i + j
                fn = next((name for name in FN_NAMES if rest.startswith(name)), None)
                if fn:
                    tokens.append(Token("func", fn, start, start + len(fn), fn=FN_ALIASES[fn]))
                    j += len(fn)
                elif rest.startswith("pi") and consts:
                    tokens.append(Token("const", "pi", start, start + 2, name="pi"))
                    j += 2
                elif rest[0] == "e" and consts:
                    tokens.append(Token("const", "e", start, start + 1, name="e"))
                    j += 1
                else:
                    if rest.startswith("pi") and not consts:
                        notes.append({
                            "level": "info",
                            "code": "constants-off",
                            "message": 'Constants are off, so "pi" was read as p·i. Turn on "Recognize π and e" to use π.',
                            "start": start,
                            "end": start + 2,
                        })
                    tokens.append(Token("var", rest[0], start, start + 1, name=rest[0]))
                    j += 1
            i += len(run)
            continue

        if ch == "*":
            if i + 1 < n and src[i + 1] == "*":
                tokens.append(Token("op", "^", i, i + 2))
                i += 2
            else:
                tokens.append(Token("op", "*", i, i + 1))
                i += 1
            continue
        if ch in single:
            typ, text = single[ch]
            tokens.append(Token(typ, text, i, i + 1))
            i += 1
            continue
        if ch == "π":
            tokens.append(Token("const", "pi", i, i + 1, name="pi"))
            i += 1
            continue
        if ch == "√":
            tokens.append(Token("func", "sqrt", i, i + 1, fn="sqrt"))
            i += 1
            continue
        if ch == "|":
            raise ParseError("Use abs(…) for absolute value — \"|\" isn't supported yet.", i, i + 1, None, "pipe-abs")
        if ch == ",":
            raise ParseError("Commas aren't supported — each function takes one argument.", i, i + 1, None, "comma")
        raise ParseError(
            f'Unknown character "{ch}"', i, i + 1,
            {"label": f'Remove "{ch}"', "expression": src[:i] + src[i + 1:]},
            "unknown-char",
        )
    return tokens, notes


BP = {"+": 10, "-": 10, "*": 20, "/": 20, "^": 30}
IMPLICIT_BP = 20
PREFIX_BP = 25
OPERAND_START = ("num", "var", "const", "func", "lparen")


class Parser:
    def __init__(self, toks: list[Token], src: str):
        self.toks = toks
        self.src = src
        self.i = 0
        self.notes: list[Diagnostic] = []
        self.implicit_at: list[int] = []
        self._grouped: set[int] = set()
        # Keep grouped nodes alive so their ids are never reused.
        self._keep: list[Node] = []

    def peek(self) -> Token | None:
        return self.toks[self.i] if self.i < len(self.toks) else None

    def advance(self) -> Token | None:
        t = self.peek()
        self.i += 1
        return t

    def parse_all(self) -> Node:
        if not self.toks:
            raise ParseError("Enter a function of x to get started.", 0, 0, None, "empty")
        node = self.expr(0)
        t = self.peek()
        if t:
            if t.type == "rparen":
                raise ParseError('Unmatched ")"', t.start, t.end, {
                    "label": 'Remove the extra ")"',
                    "expression": self.src[: t.start] + self.src[t.end:],
                }, "unmatched-close")
            raise ParseError(f'Unexpected "{t.text}"', t.start, t.end)
        return node

    def lbp(self, t: Token) -> int:
        if t.type == "op":
            return BP.get(t.text, 0)
        if t.type in OPERAND_START:
            return IMPLICIT_BP
        return 0

    def expr(self, rbp: int) -> Node:
        left = self.nud()
        while True:
            t = self.peek()
            if not t:
                break
            lbp = self.lbp(t)
            if lbp <= rbp:
                break
            if t.type == "op":
                self.advance()
                # ^ is right-associative: 2^3^2 = 2^(3^2)
                right = self.expr(lbp - 1 if t.text == "^" else lbp)
                left = {"type": "bin", "op": t.text, "left": left, "right": right}
            else:
                if left["type"] == "bin" and left["op"] == "/" and id(left) not in self._grouped:
                    self.notes.append({
                        "level": "info",
                        "code": "ambiguous-division",
                        "message": f'Read "…/{self.src[t.start:t.end]}" left to right: a/b·c = (a/b)·c. Add parentheses if you meant a/(b·c).',
                        "start": t.start,
                        "end": t.end,
                    })
                self.implicit_at.append(t.start)
                right = self.expr(IMPLICIT_BP)
                left = {"type": "bin", "op": "*", "left": left, "right": right, "implicit": True}
        return left

    def nud(self) -> Node:
        t = self.advance()
        if t is None:
            end = len(self.src)
            raise ParseError("The expression ends too early — something is missing at the end.", end, end, None, "unexpected-end")
        if t.type == "num":
            return {"type": "num", "value": t.value}
        if t.type == "var":
            return {"type": "var", "name": t.name}
        if t.type == "const":
            return {"type": "const", "name": t.name}
        if t.type == "func":
            nx = self.peek()
            if nx and nx.type == "lparen":
                self.advance()
                close = self.peek()
                if close and close.type == "rparen":
                    raise ParseError(f"{t.text}() needs something inside the parentheses", nx.start, close.end, None, "empty-call")
                arg = self.expr(0)
                self.expect_close(nx)
                return {"type": "call", "fn": t.fn, "arg": arg}
            if not nx:
                raise ParseError(f"{t.text} needs an argument, like {t.text}(x)", t.start, t.end, {
                    "label": f"Use {t.text}(x)",
                    "expression": self.src[: t.end] + "(x)" + self.src[t.end:],
                }, "missing-arg")
            before = self.i
            # "sin 2x" → sin(2x), but "sin x cos x" → sin(x)·cos(x):
            # a bare argument absorbs numbers/variables/constants, not functions or "(".
            arg = self.expr(PREFIX_BP)
            while True:
                nt = self.peek()
                if not nt or nt.type not in ("num", "var", "const"):
                    break
                self.implicit_at.append(nt.start)
                arg = {"type": "bin", "op": "*", "left": arg, "right": self.expr(PREFIX_BP), "implicit": True}
            last = self.toks[self.i - 1] if self.i - 1 < len(self.toks) else self.toks[before]
            first = self.toks[before]
            self.notes.append({
                "level": "info",
                "code": "bare-function",
                "message": f'Read "{self.src[t.start:last.end]}" as {t.text}({self.src[first.start:last.end]}) — add parentheses to be explicit.',
                "start": t.start,
                "end": last.end,
            })
            return {"type": "call", "fn": t.fn, "arg": arg}
        if t.type == "lparen":
            nx = self.peek()
            if nx and nx.type == "rparen":
                raise self.empty_parens(self.i - 1, nx)
            inner = self.expr(0)
            self.expect_close(t)
            self._grouped.add(id(inner))
            self._keep.append(inner)
            return inner
        if t.type == "op":
            if t.text == "-":
                return {"type": "neg", "arg": self.expr(PREFIX_BP)}
            if t.text == "+":
                return self.expr(PREFIX_BP)
            raise ParseError(f'"{t.text}" needs a value before it', t.start, t.end, None, "missing-operand")
        if t.type == "rparen":
            raise ParseError('")" with nothing before it', t.start, t.end, None, "unexpected-close")
        raise ParseError('Unexpected "="', t.start, t.end, None, "unexpected-eq")

    def expect_close(self, open_tok: Token) -> None:
        t = self.peek()
        if not t or t.type != "rparen":
            raise ParseError('Missing ")"', open_tok.start, open_tok.end, {
                "label": 'Add the missing ")" at the end',
                "expression": self.src.rstrip() + ")",
            }, "missing-close")
        self.advance()

    def empty_parens(self, open_idx: int, close: Token) -> ParseError:
        """`x^2()5` → suggest wrapping the term before the parens: `(x^2)5`."""
        open_tok = self.toks[open_idx]
        k = open_idx - 1
        while k >= 0:
            tk = self.toks[k]
            if tk.type in ("num", "var", "const") or (tk.type == "op" and tk.text == "^"):
                k -= 1
            else:
                break
        first = self.toks[k + 1] if k + 1 < len(self.toks) else None
        if k + 1 < open_idx and first and first.type != "op":
            expr = (
                self.src[: first.start]
                + "(" + self.src[first.start: open_tok.start].rstrip() + ")"
                + self.src[close.end:]
            )
            suggestion = {"label": f'Did you mean "{expr}"?', "expression": expr}
        else:
            expr = self.src[: open_tok.start] + self.src[close.end:]
            suggestion = {"label": 'Remove the empty "()"', "expression": expr}
        return ParseError('Empty parentheses "()"', open_tok.start, close.end, suggestion, "empty-parens")


@dataclass
class ParseResult:
    ok: bool
    diagnostics: list[Diagnostic]
    ast: Node | None = None
    main_var: str = "x"
    params: list[str] | None = None
    tokens: list[Token] | None = None
    implicit_at: list[int] | None = None


def _from_error(e: ParseError) -> Diagnostic:
    d: Diagnostic = {"level": "error", "code": e.code, "message": e.message, "start": e.start, "end": e.end}
    if e.suggestion:
        d["suggestion"] = e.suggestion
    return d


def parse_input(src: str, settings: dict[str, Any]) -> ParseResult:
    diagnostics: list[Diagnostic] = []
    try:
        tokens, notes = tokenize(src, settings)
        diagnostics.extend(notes)
    except ParseError as e:
        return ParseResult(False, [_from_error(e)])

    body = tokens
    declared_var: str | None = None
    eqs = [t for t in tokens if t.type == "eq"]

    if len(eqs) > 1:
        return ParseResult(False, [{
            "level": "error", "code": "multiple-eq", "message": 'Only one "=" is allowed.',
            "start": eqs[1].start, "end": eqs[1].end,
        }])

    if len(eqs) == 1:
        eq = eqs[0]
        eq_idx = tokens.index(eq)
        lhs = tokens[:eq_idx]
        body = tokens[eq_idx + 1:]
        lhs_text = src[: eq.start].strip()
        rhs_text = src[eq.end:].strip()

        if not body:
            return ParseResult(False, [{
                "level": "error", "code": "empty-rhs", "message": 'Nothing after "=".',
                "start": eq.start, "end": eq.end,
            }])

        is_call = (
            len(lhs) >= 4
            and lhs[0].type == "var"
            and lhs[1].type == "lparen"
            and lhs[-1].type == "rparen"
        )
        inner = lhs[2:-1] if is_call else []

        if len(lhs) == 1 and lhs[0].type == "var" and lhs[0].name == "y":
            diagnostics.append({"level": "info", "code": "y-definition", "message": 'Read "y = …" as the function to analyze.'})
        elif is_call and len(inner) == 1 and inner[0].type == "var":
            declared_var = inner[0].name
            diagnostics.append({
                "level": "info",
                "code": "function-definition",
                "message": f'Read "{lhs_text} = …" as a function of {declared_var}.',
            })
        elif is_call and (
            (len(inner) == 1 and inner[0].type == "num")
            or (len(inner) == 2 and inner[0].type == "op" and inner[0].text == "-" and inner[1].type == "num")
        ):
            value = inner[0].value if len(inner) == 1 else -inner[1].value
            var_tok = next((t for t in body if t.type == "var" and t.name == "x"), None) or next(
                (t for t in body if t.type == "var"), None
            )
            v = var_tok.name if var_tok else "x"
            fname = lhs[0].name
            arg_text = src[lhs[2].start: lhs[-2].end]
            return ParseResult(False, [{
                "level": "warning",
                "code": "evaluated-definition",
                "message": f'"{fname}({arg_text})" names a single value, but the right side still depends on {v}. Nothing was changed — your input is kept as typed.',
                "start": lhs[0].start,
                "end": lhs[-1].end,
                "suggestion": {
                    "label": f"Did you mean {fname}({v}) = {rhs_text}, evaluated at {v} = {arg_text}?",
                    "expression": f"{fname}({v}) = {rhs_text}",
                    "addPoint": value,
                },
            }])
        else:
            d: Diagnostic = {
                "level": "error",
                "code": "equation",
                "message": 'Equations aren\'t supported yet — enter a function, like "x^2 - 4".',
                "start": eq.start,
                "end": eq.end,
            }
            if lhs_text:
                d["suggestion"] = {
                    "label": f"Analyze {lhs_text} − ({rhs_text}) instead — its zeros solve the equation",
                    "expression": f"{lhs_text} - ({rhs_text})",
                }
            return ParseResult(False, [d])

    parser = Parser(body, src)
    try:
        ast = parser.parse_all()
    except ParseError as e:
        return ParseResult(False, [*diagnostics, _from_error(e)])
    diagnostics.extend(parser.notes)

    vars_ = collect_vars(ast)
    main_var = declared_var or ("x" if "x" in vars_ else next(iter(vars_)) if len(vars_) == 1 else "x")
    params = sorted(v for v in vars_ if v != main_var)

    if main_var not in vars_:
        diagnostics.append({
            "level": "info",
            "code": "constant-function",
            "message": f"This doesn't depend on {main_var}, so it's a constant function.",
        })

    return ParseResult(True, diagnostics, ast, main_var, params, body, parser.implicit_at)
