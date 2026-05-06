import { Fraunces, Instrument_Serif, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Forest & Bracket type system — wired into next/font for self-hosting.
 *
 * - Fraunces: display + numerals (variable axes opsz/wght/SOFT/WONK)
 * - General Sans: body + UI labels. Fontshare does not ship via next/font/google;
 *   we use Plus Jakarta Sans as a humanist-sans stand-in until General Sans
 *   .woff2 files are added to /public/fonts and we swap to next/font/local.
 *   TODO(forest-bracket): swap Plus Jakarta Sans → General Sans local files.
 * - Instrument Serif: scoped to the bracket-with-dot logo mark only.
 *   Not used for body, names, subtitles, hints, or microcopy.
 * - JetBrains Mono: eyebrows + ledger metadata + code.
 */

export const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  // Fraunces is a variable font; with `axes` defined we must omit `weight`
  // so Next/font treats it as fully variable across the wght axis too.
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

export const generalSans = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-general-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument-serif",
  weight: ["400"],
  style: ["italic"],
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const fontVariables = [
  fraunces.variable,
  generalSans.variable,
  instrumentSerif.variable,
  jetbrainsMono.variable,
].join(" ");
