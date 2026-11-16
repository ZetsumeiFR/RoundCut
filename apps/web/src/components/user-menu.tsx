import { Button } from "@roundcut/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@roundcut/ui/components/dropdown-menu";
import { Skeleton } from "@roundcut/ui/components/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

export default function UserMenu({
  messages,
}: {
  messages: Messages["account"]["menu"];
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const signOut = useCallback(() => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
        },
      },
    });
  }, [router]);

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link href="/login?view=sign-in">
        <Button variant="outline">{messages.signIn}</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{messages.label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account/workspace" />}>
            {messages.workspace}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account/security" />}>
            {messages.security}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account/sessions" />}>
            {messages.sessions}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut} variant="destructive">
            {messages.signOut}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
