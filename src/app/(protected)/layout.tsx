import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { ThemeProvider } from "next-themes";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // Eğer login değilse -> signin sayfasına yönlendir
  if (!session) {
    redirect("/signin");
  }

  return (
    <ThemeProvider attribute="class">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 hidden md:block border-r bg-white dark:bg-gray-900">
          <div className="p-4 font-semibold">Budget&amp;Invest</div>
          <nav className="flex flex-col gap-1 p-2">
            <a className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" href="/budget">Budget</a>
            <a className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" href="/invest">Invest</a>
            <a className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" href="/reports">Reports</a>
            <a className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" href="/settings">Settings</a>
          </nav>
        </aside>

        {/* İçerik */}
        <main className="flex-1 p-4 bg-gray-50 dark:bg-gray-800">{children}</main>
      </div>
    </ThemeProvider>
  );
}