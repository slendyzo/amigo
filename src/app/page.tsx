import Link from "next/link";
import InstallPrompt from "@/components/install-prompt";
import { getTranslations } from "next-intl/server";
import LanguageSwitcherServer from "@/components/language-switcher-server";

export default async function Home() {
  const t = await getTranslations("landing");

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-6 text-center">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcherServer />
      </div>

      {/* Spacer */}
      <div />

      {/* Main content */}
      <div className="flex flex-col items-center">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Amigo
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 whitespace-nowrap">
          {t("tagline")}
        </p>
        <div className="mt-8">
          <a
            href="/auth/signin"
            className="rounded-lg bg-[#0070f3] px-6 py-3 text-white font-medium hover:bg-[#0060df] transition-colors"
          >
            {t("getStarted")}
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-sm text-slate-400 safe-bottom">
        <p>
          {t("openSourceOn")}{" "}
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
            {t("terms")}
          </Link>
        </p>
      </footer>
      <InstallPrompt />
    </main>
  );
}
