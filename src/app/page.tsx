import Link from "next/link";
import InstallPrompt from "@/components/install-prompt";

export default function Home() {
  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center p-6 text-center overflow-hidden">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
        Amigo
      </h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 whitespace-nowrap">
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
      <footer className="absolute bottom-6 left-0 right-0 text-center text-sm text-slate-400 safe-bottom px-4">
        <p>
          Open source on{" "}
          <a
            href="https://github.com/slendyzo/amigo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0070f3] hover:underline"
          >
            GitHub
          </a>
          {" · "}
          <Link href="/terms" className="text-[#0070f3] hover:underline">
            Terms
          </Link>
        </p>
      </footer>
      <InstallPrompt />
    </main>
  );
}
