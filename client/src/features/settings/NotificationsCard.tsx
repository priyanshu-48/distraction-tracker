import { Card, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useNotificationSettings, useSaveNotificationSettings } from "./notificationQueries";

/**
 * Switch for budget alerts. Alerts go through a separate notification service, so this says plainly what is sent, and
 * the card is not shown at all when this server is not connected to one (the default install).
 */
export function NotificationsCard() {
  const settings = useNotificationSettings();
  const save = useSaveNotificationSettings();

  if (!settings.data?.available) return null;

  // Show the choice straight away while it is being saved; it goes back if saving fails.
  const checked = save.isPending ? save.variables : settings.data.enabled;

  return (
    <Card>
      <CardTitle>Budget alerts</CardTitle>
      <p className="mt-1 mb-3 text-sm text-ink-muted">
        Get a pop-up from the extension when you reach 80% of today's budget and when you pass it.
      </p>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="notifications-enabled" className="text-sm">
          Alert me about my budget
        </label>
        <Switch id="notifications-enabled" checked={checked} onCheckedChange={(next) => save.mutate(next)} />
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        Turning this on sends your account id and email address, the name of the site and the time spent to the notification service. Web addresses
        and page titles are never sent.
      </p>
      {save.isError ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          Couldn't save. Please try again.
        </p>
      ) : null}
    </Card>
  );
}
