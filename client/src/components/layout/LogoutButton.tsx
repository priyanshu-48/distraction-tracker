import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getToken, logout } from "@/app/auth";

/** Signs out, and tells the extension so it stops recording as this account. */
export function LogoutButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  if (!getToken()) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await logout(queryClient);
        navigate("/login", { replace: true });
      }}
    >
      <LogOut aria-hidden="true" className="size-4" />
      <span className="max-sm:sr-only">Log out</span>
    </Button>
  );
}
