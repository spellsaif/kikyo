"""Kernel process lifecycle management with working directory awareness."""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from jupyter_client.manager import AsyncKernelManager

log = logging.getLogger(__name__)


@dataclass
class Kernel:
    """A live ipykernel process."""
    id: str
    manager: AsyncKernelManager
    client: object = field(default=None)

    async def start(self) -> None:
        await self.manager.start_kernel()
        self.client = self.manager.client()
        self.client.start_channels()
        await self.client.wait_for_ready(timeout=30)
        pid = getattr(getattr(self.manager, "provisioner", None), "pid", "?")
        log.info("Kernel %s ready (pid=%s, cwd=%s)", self.id, pid, getattr(self.manager, "cwd", "."))

    async def shutdown(self) -> None:
        if self.client:
            try:
                self.client.stop_channels()
            except Exception as e:
                log.warning("Error stopping kernel channels: %s", e)
        try:
            await self.manager.shutdown_kernel(now=True)
        except Exception as e:
            log.warning("Error shutting down kernel: %s", e)
        log.info("Kernel %s shut down", self.id)

    async def interrupt(self) -> None:
        await self.manager.interrupt_kernel()

    async def restart(self) -> None:
        await self.manager.restart_kernel(now=True)
        await self.client.wait_for_ready(timeout=30)


class KernelPool:
    """Pool of warm, pre-spawned kernels to make notebook startup instantaneous."""

    def __init__(self, warm_size: int = 1, default_cwd: Path | None = None) -> None:
        self.warm_size = warm_size
        self.default_cwd = default_cwd or Path.cwd()
        self._warm: asyncio.Queue[Kernel] = asyncio.Queue()
        self._active: dict[str, Kernel] = {}
        self._keeper_task: asyncio.Task | None = None

    async def start(self) -> None:
        self._keeper_task = asyncio.create_task(self._maintain_pool())

    async def stop(self) -> None:
        if self._keeper_task:
            self._keeper_task.cancel()
        while not self._warm.empty():
            k = self._warm.get_nowait()
            await k.shutdown()
        await asyncio.gather(
            *(k.shutdown() for k in self._active.values()),
            return_exceptions=True,
        )
        self._active.clear()

    async def _maintain_pool(self) -> None:
        while True:
            try:
                if self._warm.qsize() < self.warm_size:
                    k = await self._spawn()
                    await self._warm.put(k)
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error("Failed to maintain warm kernel pool: %s", e)
                await asyncio.sleep(2.0)

    async def _spawn(self) -> Kernel:
        km = AsyncKernelManager()
        km.cwd = str(self.default_cwd)
        k = Kernel(id=str(uuid.uuid4()), manager=km)
        await k.start()
        return k

    async def acquire(self, cwd: Path | None = None) -> Kernel:
        """Acquire a warm kernel or spawn one matching the directory."""
        target_cwd = str(cwd or self.default_cwd)
        k: Kernel | None = None

        try:
            candidate = self._warm.get_nowait()
            if getattr(candidate.manager, "cwd", "") == target_cwd:
                k = candidate
            else:
                # Different directory requested, spawn matching
                await candidate.shutdown()
                k = await self._spawn_for_cwd(target_cwd)
        except asyncio.QueueEmpty:
            k = await self._spawn_for_cwd(target_cwd)

        self._active[k.id] = k
        return k

    async def _spawn_for_cwd(self, cwd_path: str) -> Kernel:
        km = AsyncKernelManager()
        km.cwd = cwd_path
        k = Kernel(id=str(uuid.uuid4()), manager=km)
        await k.start()
        return k

    async def release(self, kernel_id: str) -> None:
        k = self._active.pop(kernel_id, None)
        if k:
            await k.shutdown()
