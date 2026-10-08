"""Bridge ZeroMQ kernel messaging to structured async events."""
from __future__ import annotations

import asyncio
import logging
import queue
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Callable, Coroutine

from .manager import Kernel

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class KernelEvent:
    """Normalized execution event emitted by the kernel."""
    msg_type: str  # 'stream', 'execute_result', 'display_data', 'error', 'status'
    content: dict[str, Any]
    parent_id: str | None


class KernelBridge:
    """Consumes ZeroMQ IOPub messages and provides sequential gated execution."""

    def __init__(self, kernel: Kernel) -> None:
        self.kernel = kernel
        self._subscribers: set[asyncio.Queue[KernelEvent]] = set()
        self._reader_task: asyncio.Task | None = None
        self._active_executions: dict[str, asyncio.Event] = {}
        self._execution_errors: dict[str, bool] = {}

    async def start(self) -> None:
        self._reader_task = asyncio.create_task(self._read_iopub())

    async def stop(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

    async def _read_iopub(self) -> None:
        client = self.kernel.client
        while True:
            try:
                msg = await client.get_iopub_msg(timeout=1.0)
            except asyncio.CancelledError:
                break
            except (asyncio.TimeoutError, TimeoutError, queue.Empty):
                continue
            except Exception as e:
                log.warning("iopub stream error: %s", e)
                await asyncio.sleep(0.1)
                continue

            msg_type = msg.get("msg_type", "")
            content = msg.get("content", {})
            parent_id = msg.get("parent_header", {}).get("msg_id")

            evt = KernelEvent(msg_type=msg_type, content=content, parent_id=parent_id)

            # Check if this completes an active execution
            if parent_id and parent_id in self._active_executions:
                if msg_type == "error":
                    self._execution_errors[parent_id] = True
                if msg_type == "status" and content.get("execution_state") == "idle":
                    done_event = self._active_executions.get(parent_id)
                    if done_event:
                        done_event.set()

            # Fan out to all active listener queues
            for q in list(self._subscribers):
                try:
                    q.put_nowait(evt)
                except asyncio.QueueFull:
                    pass

    async def execute(self, code: str) -> str:
        """Submits code to kernel shell socket and returns msg_id."""
        client = getattr(self.kernel, "client", None)
        if not client:
            raise RuntimeError("Kernel client is not ready or disconnected")
        msg_id = client.execute(code, store_history=False, allow_stdin=False)
        return msg_id

    async def execute_and_wait(
        self,
        code: str,
        on_event: Callable[[KernelEvent], Coroutine[Any, Any, None]] | None = None,
        timeout: float = 300.0,
    ) -> bool:
        """Executes code sequentially, awaits idle completion, and returns True if successful."""
        done_event = asyncio.Event()
        event_queue: asyncio.Queue[KernelEvent] = asyncio.Queue(maxsize=1000)
        self._subscribers.add(event_queue)

        msg_id: str | None = None
        try:
            msg_id = await self.execute(code)
            self._active_executions[msg_id] = done_event
            self._execution_errors[msg_id] = False

            while not done_event.is_set():
                try:
                    evt = await asyncio.wait_for(event_queue.get(), timeout=timeout)
                    if evt.parent_id == msg_id and on_event:
                        await on_event(evt)
                except asyncio.TimeoutError:
                    log.error("Execution timed out for msg_id=%s", msg_id)
                    return False

            # Drain any remaining events for this execution
            while not event_queue.empty():
                evt = event_queue.get_nowait()
                if evt.parent_id == msg_id and on_event:
                    await on_event(evt)

            has_error = self._execution_errors.get(msg_id, False)
            return not has_error

        except Exception as e:
            log.error("Execution failure for cell: %s", e, exc_info=True)
            return False
        finally:
            self._subscribers.discard(event_queue)
            if msg_id is not None:
                self._active_executions.pop(msg_id, None)
                self._execution_errors.pop(msg_id, None)

    async def complete(self, code: str, cursor_pos: int, timeout: float = 3.0) -> dict[str, Any]:
        """Queries kernel shell socket for live runtime autocompletion candidates."""
        client = self.kernel.client
        if not client:
            return {"matches": [], "cursor_start": cursor_pos, "cursor_end": cursor_pos}

        comp_id = client.complete(code, cursor_pos)
        start_time = asyncio.get_event_loop().time()

        while asyncio.get_event_loop().time() - start_time < timeout:
            try:
                msg = await client.get_shell_msg(timeout=0.5)
                if msg.get("parent_header", {}).get("msg_id") == comp_id:
                    content = msg.get("content", {})
                    return {
                        "matches": content.get("matches", []),
                        "cursor_start": content.get("cursor_start", cursor_pos),
                        "cursor_end": content.get("cursor_end", cursor_pos),
                    }
            except (asyncio.TimeoutError, TimeoutError, queue.Empty):
                continue
            except Exception as e:
                log.warning("Complete error: %s", e)
                break

        return {"matches": [], "cursor_start": cursor_pos, "cursor_end": cursor_pos}

    async def subscribe(self) -> AsyncIterator[KernelEvent]:
        """Provides an async iterator of all kernel events."""
        q: asyncio.Queue[KernelEvent] = asyncio.Queue(maxsize=1000)
        self._subscribers.add(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subscribers.discard(q)
