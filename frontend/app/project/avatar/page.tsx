import { redirect } from "next/navigation";
import { isAuthed } from "./_lib/auth";
import { BASE } from "./_lib/config";
import AvatarApp from "./_components/AvatarApp";

export const dynamic = "force-dynamic";

export default async function AvatarPage() {
  // Checked on the server: the app is never sent to an unauthenticated browser.
  if (!(await isAuthed())) redirect(`${BASE}/login`);
  return <AvatarApp />;
}
