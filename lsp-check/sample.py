from dataclasses import dataclass


@dataclass
class User:
    id: int
    name: str


def format_user(user: User) -> str:
    return f"{user.id}: {user.name}"


def greet_all(users: list[User]) -> list[int]:
    return [format_user(u) for u in users]


admin = User(id="1", name="root")
banner: int = format_user(admin)
