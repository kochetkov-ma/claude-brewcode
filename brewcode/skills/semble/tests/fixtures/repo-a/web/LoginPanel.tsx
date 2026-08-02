import { useState } from "react";

export interface LoginPanelProps {
  onSubmit: (user: string, password: string) => void;
}

export function LoginPanel({ onSubmit }: LoginPanelProps) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form onSubmit={() => onSubmit(user, password)}>
      <input value={user} onChange={(e) => setUser(e.target.value)} />
      <input value={password} type="password" onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Sign in</button>
    </form>
  );
}
