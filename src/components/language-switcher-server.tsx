import { getLocale } from "next-intl/server";
import LanguageSwitcher from "./language-switcher";

export default async function LanguageSwitcherServer() {
  // Get the current locale on the server to ensure the client component
  // renders with the correct initial state
  await getLocale();

  return <LanguageSwitcher />;
}
