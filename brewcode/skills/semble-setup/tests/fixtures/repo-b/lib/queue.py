"""A tiny bounded queue - repo-b exists only to prove two repos hash apart."""

from collections import deque


class BoundedQueue:
    def __init__(self, capacity):
        self.capacity = capacity
        self._items = deque()

    def push(self, item):
        if len(self._items) >= self.capacity:
            raise OverflowError("queue is full")
        self._items.append(item)

    def pop(self):
        return self._items.popleft()

    def __len__(self):
        return len(self._items)
