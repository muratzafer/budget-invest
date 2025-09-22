import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // Eğer login değilse -> signin sayfasına yönlendir
  if (!session) {
    redirect("/signin");
  }

  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="w-56 hidden md:block border-r bg-white">
        <div className="p-4 font-semibold">Budget&amp;Invest</div>
        <nav className="flex flex-col gap-1 p-2">
          <a className="px-3 py-2 hover:bg-gray-100 rounded" href="/budget">Budget</a>
          <a className="px-3 py-2 hover:bg-gray-100 rounded" href="/invest">Invest</a>
          <a className="px-3 py-2 hover:bg-gray-100 rounded" href="/reports">Reports</a>
          <a className="px-3 py-2 hover:bg-gray-100 rounded" href="/settings">Settings</a>
        </nav>
      </aside>

      {/* İçerik */}
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}