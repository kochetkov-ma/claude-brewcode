"""Authentication service used by the semble coverage fixtures."""


class AuthService:
    """Resolves a bearer token into a user record."""

    def __init__(self, store, clock):
        self.store = store
        self.clock = clock

    def authenticate(self, token):
        record = self.store.find_by_token(token)
        if record is None:
            raise PermissionError("unknown token")
        if record.expires_at < self.clock.now():
            raise PermissionError("expired token")
        return record.user


def main():
    print("entry point main function")


if __name__ == "__main__":
    main()
