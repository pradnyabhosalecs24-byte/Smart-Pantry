import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { errorMessage, get } from "./api";
import type { Category, Location, Settings } from "./types";

/**
 * After any change to pantry data, refresh every view that could show it
 * (dashboard, lists, charts, notifications). Only the signed-in user stays cached.
 */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" }), [qc]);
}

/** A mutation that shows a success toast only after the server confirmed, and refreshes data. */
export function useAction<TVars, TResult = unknown>(fn: (v: TVars) => Promise<TResult>, opts: { success?: string | ((r: TResult, v: TVars) => string); onSuccess?: (r: TResult, v: TVars) => void; silentError?: boolean } = {}) {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      refresh();
      const msg = typeof opts.success === "function" ? opts.success(r, v) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (!opts.silentError) toast.error(errorMessage(e));
    },
  });
}

export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => get<{ categories: Category[] }>("/categories").then((r) => r.categories) });
export const useLocations = () => useQuery({ queryKey: ["locations"], queryFn: () => get<{ locations: Location[] }>("/locations").then((r) => r.locations) });
export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => get<{ settings: Settings; emailConfigured: boolean; currencies: string[] }>("/settings") });
export const useUnread = () => useQuery({ queryKey: ["unread"], queryFn: () => get<{ unread: number }>("/notifications/unread-count").then((r) => r.unread), refetchInterval: 5 * 60_000 });
