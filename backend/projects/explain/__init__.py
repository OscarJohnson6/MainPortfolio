"""
e(x)plain — function analysis engine.

Python port of the frontend's TypeScript mock engine
(frontend/app/project/explain/lib/mock), with SymPy doing the simplifying.
It returns exactly the AnalyzeResponse shape from lib/types.ts.
"""

from .engine import analyze

__all__ = ["analyze"]
