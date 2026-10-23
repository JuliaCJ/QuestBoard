import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function AdminDashboard() {
  // Server-side authorization check for admin role should be performed here (NFR: server-side auth on every admin route)

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Admin Portal</h1>
          <p className="text-neutral-400 mt-1">
            Central management hub for accounts, quests, the renown store, and achievements.
          </p>
        </header>

        {/* Admin Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Edit Players */}
          <Link
            href="/admin/players"
            className="p-6 bg-neutral-800 border border-neutral-700 rounded-lg hover:border-amber-500 transition-colors group"
          >
            <h2 className="text-xl font-semibold group-hover:text-amber-400 transition-colors">
              Edit Players
            </h2>
            <p className="text-neutral-400 text-sm mt-2">
              Create player accounts, generate credentials, deactivate accounts, reset passwords, and toggle permanent priority status.
            </p>
          </Link>

          {/* Edit Quests */}
          <Link
            href="/admin/quests"
            className="p-6 bg-neutral-800 border border-neutral-700 rounded-lg hover:border-amber-500 transition-colors group"
          >
            <h2 className="text-xl font-semibold group-hover:text-amber-400 transition-colors">
              Edit Quests
            </h2>
            <p className="text-neutral-400 text-sm mt-2">
              Create, edit, cancel, lock, or unlock quests, schedule dates, override player limits, and manage manual sign-ups/rosters[cite: 5].
            </p>
          </Link>

          {/* Edit Store */}
          <Link
            href="/admin/store"
            className="p-6 bg-neutral-800 border border-neutral-700 rounded-lg hover:border-amber-500 transition-colors group"
          >
            <h2 className="text-xl font-semibold group-hover:text-amber-400 transition-colors">
              Edit Store
            </h2>
            <p className="text-neutral-400 text-sm mt-2">
              Add, edit, or remove items in the Renown Store (consumables and equipables), configure prices, and update stat sheets[cite: 5].
            </p>
          </Link>

          {/* Edit Achievements */}
          <Link
            href="/admin/achievements"
            className="p-6 bg-neutral-800 border border-neutral-700 rounded-lg hover:border-amber-500 transition-colors group"
          >
            <h2 className="text-xl font-semibold group-hover:text-amber-400 transition-colors">
              Edit Achievements
            </h2>
            <p className="text-neutral-400 text-sm mt-2">
              Create achievements, set public or secret visibility, assign reward renown, and award them manually to players[cite: 5].
            </p>
          </Link>
        </div>

        {/* Navigation Footer */}
        <div className="mt-8 pt-6 border-t border-neutral-800 flex justify-between items-center">
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            &larr; Back to Quest Board
          </Link>
        </div>
      </div>
    </main>
  );
}