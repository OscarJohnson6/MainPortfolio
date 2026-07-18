from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from projects.rhythm_sync import server as rhythm_server

logger = logging.getLogger(__name__)
router = APIRouter()


class FastAPIWebSocketAdapter:
    """
    Adapts FastAPI/Starlette WebSocket to the tiny interface expected by the
    original standalone Rhythm Sync server.

    Original server expects:
      - await websocket.send(text)
      - await websocket.close(code=..., reason=...)
      - async for raw in websocket: ...

    The adapter also guards against send-after-close errors, which can happen
    during browser refreshes, Fast Refresh, and dev-server reconnects.
    """

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.closed = False

    async def send(self, message: str) -> None:
        if self.closed or self.websocket.application_state == WebSocketState.DISCONNECTED:
            return

        try:
            await self.websocket.send_text(message)
        except RuntimeError as exc:
            if "close message has been sent" in str(exc):
                self.closed = True
                return
            raise
        except WebSocketDisconnect:
            self.closed = True

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        if self.closed or self.websocket.application_state == WebSocketState.DISCONNECTED:
            return

        self.closed = True
        await self.websocket.close(code=code, reason=reason or "")

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        if self.closed:
            raise StopAsyncIteration

        try:
            return await self.websocket.receive_text()
        except WebSocketDisconnect:
            self.closed = True
            raise StopAsyncIteration


@router.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "rhythm-sync",
    }


@router.websocket("/ws")
async def rhythm_sync_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    adapter = FastAPIWebSocketAdapter(websocket)

    try:
        await rhythm_server.handler(adapter)
    except WebSocketDisconnect:
        adapter.closed = True
    except Exception:
        logger.exception("Rhythm Sync WebSocket crashed")
        await adapter.close(code=1011, reason="Internal Rhythm Sync error")
