import { BellOff, BellRing, Send, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage, get, post } from "../lib/api";
import { Button, Card, CardHeader } from "./ui";

type State = "loading" | "unsupported" | "ios-install" | "no-worker" | "blocked" | "off" | "on";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The service worker is only registered in the built app; resolve null instead of waiting forever. */
async function workerReady(): Promise<ServiceWorkerRegistration | null> {
  if (!(await navigator.serviceWorker.getRegistration())) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}

/** Turn phone/browser notifications on or off for this device. */
export function PushCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      if (!("PushManager" in window)) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await workerReady();
      if (!reg) return setState("no-worker");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await workerReady();
      if (!reg) return setState("no-worker");
      const { publicKey } = await get<{ publicKey: string }>("/push/public-key");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      await post("/push/subscribe", sub.toJSON());
      setState("on");
      toast.success("Notifications are on for this device");
    } catch (e) {
      toast.error(e instanceof DOMException ? "Couldn't reach this browser's notification service. Check your internet connection and try again." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await (await workerReady())?.pushManager.getSubscription();
      if (sub) {
        await post("/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Notifications are off for this device");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await post("/push/test");
      toast.success("Test sent. It should pop up in a few seconds.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const text: Record<State, string> = {
    loading: "Checking this device…",
    unsupported: "This browser can't show notifications. Try Chrome, Edge or Firefox, or use email reminders instead.",
    "ios-install": "On iPhone and iPad: tap Share, then “Add to Home Screen”. Open Smart Pantry from the Home Screen and turn notifications on there.",
    "no-worker": "Notifications work in the installed app. Open the published Smart Pantry site (or install it) to turn them on.",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings (the icon left of the address), then reload.",
    off: "Get a daily alert on this phone or computer when food is about to expire, even when Smart Pantry is closed.",
    on: "This device gets a daily alert when food is about to expire or running low.",
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Smartphone className="size-5 text-basil" aria-hidden /> Phone notifications
          </span>
        }
        description={text[state]}
      />
      {(state === "off" || state === "on") && (
        <div className={`flex flex-wrap gap-2 px-5 ${compact ? "pb-4" : "pb-5"}`}>
          {state === "off" ? (
            <Button icon={BellRing} onClick={enable} loading={busy}>
              Turn on for this device
            </Button>
          ) : (
            <>
              <Button variant="secondary" icon={Send} onClick={test} loading={busy}>
                Send a test
              </Button>
              <Button variant="ghost" icon={BellOff} onClick={disable} disabled={busy}>
                Turn off
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
