import { redirectSignedInUser } from "@/lib/auth/guest-access";

export async function GuestOnly({ children }: { children: React.ReactNode }) {
  await redirectSignedInUser();
  return children;
}
