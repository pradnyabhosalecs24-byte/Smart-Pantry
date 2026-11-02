import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Bell,
  CheckCheck,
  Clock,
  TrendingDown,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PushCard } from "../components/PushCard";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Spinner,
  Tabs,
} from "../components/ui";
import { del, errorMessage, get, post } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useAction } from "../lib/hooks";
import type { Notification } from "../lib/types";

const TYPE = {
  EXPIRED: {
    icon: TriangleAlert,
    cls: "bg-chilli-soft text-chilli",
    label: "Expired",
  },
  EXPIRING: {
    icon: Clock,
    cls: "bg-turmeric-soft text-turmeric",
    label: "Expiring soon",
  },
  LOW_STOCK: {
    icon: TrendingDown,
    cls: "bg-plum-soft text-plum",
    label: "Low stock",
  },
  RUNNING_OUT: {
    icon: TrendingDown,
    cls: "bg-slate-soft text-slate",
    label: "Running out",
  },
};

export function NotificationsPage() {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const q = useQuery({
    queryKey: ["notifications", tab],
    queryFn: () =>
      get<{
        notifications: Notification[];
        unread: number;
        emailConfigured: boolean;
      }>("/notifications", { unread: tab === "unread" }),
  });
  const readAll = useAction(() => post("/notifications/read-all"), {
    success: "All marked as read",
  });
  const toggle = useAction(
    (n: Notification) =>
      post(`/notifications/${n.id}/read`, { read: !n.readAt }),
    {},
  );
  const remove = useAction(
    (n: Notification) => del(`/notifications/${n.id}`),
    {},
  );

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts are created when items approach their date, expire, run low, or are forecast to run out."
        actions={
          <Button
            variant="secondary"
            icon={CheckCheck}
            onClick={() => readAll.mutate()}
            disabled={!q.data?.unread}
            loading={readAll.isPending}
          >
            Mark all as read
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: q.data?.unread },
          ]}
        />
        {q.data && (
          <p className="text-sm text-ink-2">
            Email reminders:{" "}
            {q.data.emailConfigured
              ? "available, turn them on in Settings"
              : "not configured on this server, so alerts are in-app only"}
          </p>
        )}
      </div>
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <ErrorState
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        ) : q.data!.notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              tab === "unread" ? "You're all caught up" : "No notifications yet"
            }
          >
            You'll be alerted here when something needs attention.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {q.data!.notifications.map((n) => {
              const t = TYPE[n.type];
              return (
                <li
                  key={n.id}
                  className={clsx(
                    "flex items-start gap-3 px-5 py-3.5",
                    !n.readAt && "bg-surface-2",
                  )}
                >
                  <div
                    className={clsx(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                      t.cls,
                    )}
                    aria-hidden
                  >
                    <t.icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={clsx(
                        "text-[15px]",
                        !n.readAt ? "font-semibold" : "font-medium text-ink-2",
                      )}
                    >
                      <span className="sr-only">
                        {n.readAt ? "Read" : "Unread"}, {t.label}:{" "}
                      </span>
                      {n.itemId ? (
                        <Link
                          to={`/pantry/${n.itemId}`}
                          className="hover:underline"
                          onClick={() => !n.readAt && toggle.mutate(n)}
                        >
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    <p className="text-sm text-ink-2">{n.message}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {timeAgo(n.createdAt)}
                      {n.emailStatus === "SENT" && " · emailed"}
                      {n.emailStatus === "FAILED" &&
                        " · email could not be sent"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle.mutate(n)}
                  >
                    {n.readAt ? "Mark unread" : "Mark read"}
                  </Button>
                  <IconButton
                    icon={X}
                    label="Dismiss notification"
                    onClick={() => remove.mutate(n)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <div className="mt-6">
        <PushCard compact />
      </div>
    </>
  );
}
