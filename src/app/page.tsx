import InstallPrompt from "@/components/install-prompt";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
        Amigo
      </h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
        Your friendly expense tracker
      </p>
      <div className="mt-8">
        <a
          href="/auth/signin"
          className="rounded-lg bg-[#0070f3] px-6 py-3 text-white font-medium hover:bg-[#0060df] transition-colors"
        >
          Get Started
        </a>
      </div>
      <InstallPrompt />
    </main>
  );
}
