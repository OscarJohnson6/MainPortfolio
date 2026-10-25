# Main API (TexVoice, e(x)plain, Terminal FX, Rhythm Sync, admin).
# Build from the repo root:  docker compose build api

FROM python:3.12-slim

# TexVoice compiles uploaded .tex files to PDF when latexmk is available.
# TeX adds several hundred MB, so it can be skipped:  --build-arg INSTALL_LATEX=false
# latex-extra (multirow, titlesec, tcolorbox, enumitem…), pictures (tikz,
# pgfplots) and tipa cover every package the notes in imports/latex use.
ARG INSTALL_LATEX=true
RUN if [ "$INSTALL_LATEX" = "true" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends \
            latexmk texlive-latex-base texlive-latex-recommended texlive-fonts-recommended \
            texlive-latex-extra texlive-pictures tipa \
        && rm -rf /var/lib/apt/lists/*; \
    fi

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Same layout as the repo: routers resolve /app/imports and /app/exports from
# their own location (backend/routers → two levels up).
WORKDIR /app/backend

# Dependencies first, so code edits don't reinstall them on every build.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
