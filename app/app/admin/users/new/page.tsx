import CreateUserClient from "./CreateUserClient";
import { generatePassword } from "@/lib/actions/admin/users";

export default async function NewUserPage() {
  const initialPassword = await generatePassword();
  return (
    <div>
      <h1 className="h-display" style={{ marginBottom: 20 }}>Create test user</h1>
      <CreateUserClient initialPassword={initialPassword} />
    </div>
  );
}
