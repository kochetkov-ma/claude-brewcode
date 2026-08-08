interface User {
  id: number;
  name: string;
}

export function formatUser(user: User): string {
  return `${user.id}: ${user.name}`;
}

export function greetAll(users: User[]): string[] {
  return users.map((u) => formatUser(u));
}

const admin: User = { id: 1, name: "root" };
export const banner = formatUser(admin);
