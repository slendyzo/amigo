import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--line)] p-8">
          <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">Terms of Service</h1>
          <p className="text-sm text-[var(--ink-subtle)] mb-8">Last updated: May 2026</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">1. Acceptance of Terms</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                By accessing or using Amigo (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">2. Description of Service</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                Amigo is an open-source personal finance tracking application. The Service allows users to
                track expenses, categorize spending, and view financial summaries. The Service is provided
                for informational purposes only.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">3. No Financial Advice</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                <strong>The Service does not provide financial, tax, legal, or investment advice.</strong> All
                information displayed is for informational purposes only. You should consult qualified
                professionals before making any financial decisions. The developers and maintainers of this
                Service are not financial advisors.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">4. Use at Your Own Risk</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                You acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 text-[var(--ink-muted)] space-y-2 mb-4">
                <li>You use this Service entirely at your own risk</li>
                <li>You are solely responsible for the accuracy and completeness of data you enter</li>
                <li>The Service may contain bugs, errors, or inaccuracies</li>
                <li>The Service may be unavailable at times due to maintenance or technical issues</li>
                <li>Your data may be lost, corrupted, or compromised</li>
                <li>The calculations and summaries provided may not be accurate</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">5. Data and Privacy</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                You are responsible for maintaining the confidentiality of your account credentials.
                While we take reasonable measures to protect your data, we cannot guarantee absolute
                security. You should regularly backup your data and not rely solely on this Service
                for financial record-keeping.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">5.A AI Advisor (Optional Feature)</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                The AI Advisor is an optional feature that you can enable or disable at any time in Settings. When enabled, the application sends pre-aggregated statistics from your workspace to Z.ai (operated by Zhipu AI, based in China) for the purpose of generating monthly retrospectives and bookkeeping suggestions. The data sent includes: monthly totals, category names and totals, top merchant names and totals, expense counts, and month-over-month percentage differences. Raw expense rows, transaction descriptions, account numbers, and other personally identifiable information are not transmitted. You may withdraw consent at any time, after which no further data will be sent and the AI Advisor surfaces will be hidden. Insights generated before withdrawal remain stored locally in your account and can be deleted on request.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">6. Open Source</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                Amigo is open-source software released under the MIT License. The source code is available
                at{" "}
                <a
                  href="https://github.com/slendyzo/amigo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  github.com/slendyzo/amigo
                </a>
                . You are free to review, modify, and distribute the code under the terms of the MIT License.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">7. Disclaimer of Warranties</h2>
              <p className="text-[var(--ink-muted)] mb-4 uppercase font-medium">
                The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
                either express or implied, including but not limited to implied warranties of
                merchantability, fitness for a particular purpose, and non-infringement.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">8. Limitation of Liability</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                In no event shall the developers, maintainers, or contributors be liable for any direct,
                indirect, incidental, special, consequential, or punitive damages, including but not
                limited to loss of profits, data, or other intangible losses, resulting from:
              </p>
              <ul className="list-disc pl-6 text-[var(--ink-muted)] space-y-2 mb-4">
                <li>Your use or inability to use the Service</li>
                <li>Any unauthorized access to or alteration of your data</li>
                <li>Any errors, bugs, or inaccuracies in the Service</li>
                <li>Any financial decisions made based on information from the Service</li>
                <li>Any other matter relating to the Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">9. Changes to Terms</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                We reserve the right to modify these terms at any time. Continued use of the Service
                after changes constitutes acceptance of the modified terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-[var(--ink)] mb-4">10. Contact</h2>
              <p className="text-[var(--ink-muted)] mb-4">
                For questions about these Terms of Service, please open an issue on our{" "}
                <a
                  href="https://github.com/slendyzo/amigo/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  GitHub repository
                </a>
                .
              </p>
            </section>
          </div>

          <div className="mt-8 pt-6 border-t border-[var(--line)]">
            <Link
              href="/"
              className="text-[var(--accent)] hover:underline text-sm"
            >
              &larr; Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
