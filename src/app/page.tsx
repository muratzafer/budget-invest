import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/budget"); // logged in → go to Budget
  } else {
    redirect("/signin"); // not logged in → go to Sign In
  }

  return null;
}
