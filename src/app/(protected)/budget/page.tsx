import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";

export default async function Page() {
  const session = await getServerSession(authOptions);

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Budget</h1>
      <p>Merhaba {session?.user?.email}</p>
    </div>
  );
}