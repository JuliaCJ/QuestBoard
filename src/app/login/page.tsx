import ActionForm from "@/components/ActionForm";
import { login } from "@/app/actions";

export default function Login() {
  return (
    <div className="login">
      <h1>QuestBoard</h1>
      <ActionForm action={login} className="stack">
        <label>Username<input name="username" autoCapitalize="none" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button>Enter the Hallway</button>
      </ActionForm>
    </div>
  );
}
