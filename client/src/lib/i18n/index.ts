// Hindi and Kannada interface.
//
// How it works: the app is written in English, and this layer translates what is on screen using a
// dictionary keyed by the English text (dict-*.ts). A MutationObserver translates text and a few
// attributes (aria-label, placeholder, title, alt) whenever React renders, so components stay plain
// English and every new string falls back to English instead of breaking.
// User data is never translated: anything inside [translate="no"] (item names, notes, recipe text
// from the database) and all form field values are left exactly as typed.

export type Lang = "en" | "hi" | "kn";
export const LANGUAGES: { value: Lang; label: string; english: string }[] = [
  { value: "en", label: "English", english: "English" },
  { value: "hi", label: "हिन्दी", english: "Hindi" },
  { value: "kn", label: "ಕನ್ನಡ", english: "Kannada" },
];
const STORAGE_KEY = "sp-lang";
const ATTRS = ["aria-label", "placeholder", "title", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT", "svg", "SVG"]);

type Dict = { exact: Map<string, string>; patterns: [RegExp, string][] };
const dicts: Partial<Record<Lang, Dict>> = {};

async function loadDict(lang: Exclude<Lang, "en">): Promise<Dict> {
  if (dicts[lang]) return dicts[lang]!;
  const { ENTRIES, PATTERNS } = await import("./dict");
  const col = lang === "hi" ? 1 : 2;
  const exact = new Map<string, string>();
  for (const e of ENTRIES) if (e[col]) exact.set(e[0], e[col]);
  const patterns = PATTERNS.map((p) => [p[0], p[col]] as [RegExp, string]);
  return (dicts[lang] = { exact, patterns });
}

export function savedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "hi" || v === "kn" || v === "en") return v;
  } catch {
    /* storage blocked */
  }
  return "en";
}

let current: Lang = "en";
let dict: Dict | null = null;
// Remembers the English source of every node we changed, so switching back (or React updating it) works
const textSource = new WeakMap<Node, { src: string; out: string }>();
const attrSource = new WeakMap<Element, Map<string, { src: string; out: string }>>();
let observer: MutationObserver | null = null;

/** Translates one string. Keeps leading/trailing spaces so inline text still joins up correctly. */
export function translate(text: string): string {
  if (!dict) return text;
  const trimmed = text.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return text;
  let out = dict.exact.get(trimmed);
  if (out === undefined) {
    for (const [re, rep] of dict.patterns) {
      const m = trimmed.match(re);
      if (m) {
        out = rep.replace(/\$(\d)/g, (_, i) => dict!.exact.get(m[Number(i)]) ?? m[Number(i)]);
        break;
      }
    }
  }
  if (out === undefined) return text;
  const lead = text.match(/^\s*/)![0];
  const tail = text.match(/\s*$/)![0];
  return lead + out + tail;
}

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.getAttribute("translate") === "no" || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function doText(node: Text) {
  const value = node.nodeValue ?? "";
  const known = textSource.get(node);
  // Our own last output: nothing to do. Anything else is fresh English from React.
  if (known && value === known.out) return;
  const src = value;
  const out = current === "en" ? src : translate(src);
  if (out !== src || known) {
    textSource.set(node, { src, out });
    if (out !== value) node.nodeValue = out;
  }
}

function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const value = el.getAttribute(a);
    if (value === null) continue;
    let map = attrSource.get(el);
    const known = map?.get(a);
    if (known && value === known.out) continue;
    const out = current === "en" ? value : translate(value);
    if (out !== value || known) {
      if (!map) attrSource.set(el, (map = new Map()));
      map.set(a, { src: value, out });
      if (out !== value) el.setAttribute(a, out);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) doText(root as Text);
    return;
  }
  if (!(root instanceof Element) || skipped(root)) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n instanceof Element && (SKIP_TAGS.has(n.tagName) || n.getAttribute("translate") === "no") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

/** Restores the English text everywhere we changed it. */
function restoreAll() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const k = textSource.get(n);
      if (k && n.nodeValue === k.out) n.nodeValue = k.src;
      textSource.delete(n);
    } else {
      const map = attrSource.get(n as Element);
      map?.forEach((k, a) => (n as Element).getAttribute(a) === k.out && (n as Element).setAttribute(a, k.src));
      attrSource.delete(n as Element);
    }
  }
}

const listeners = new Set<(l: Lang) => void>();
export const onLangChange = (fn: (l: Lang) => void) => (listeners.add(fn), () => void listeners.delete(fn));
export const currentLang = () => current;

export async function setLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* still applies for this visit */
  }
  document.documentElement.lang = lang === "en" ? "en" : lang === "hi" ? "hi" : "kn";
  if (lang === "en") {
    observer?.disconnect();
    observer = null;
    dict = null;
    current = "en";
    restoreAll();
  } else {
    const d = await loadDict(lang);
    if (current !== "en") restoreAll();
    dict = d;
    current = lang;
    walk(document.body);
    if (!observer) {
      observer = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "characterData") {
            if (!skipped(r.target.parentElement)) doText(r.target as Text);
          } else if (r.type === "attributes") {
            if (!skipped(r.target as Element)) doAttrs(r.target as Element);
          } else r.addedNodes.forEach(walk);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    }
  }
  listeners.forEach((fn) => fn(lang));
}

/** Call once at start-up. English needs no work; other languages load their dictionary on demand. */
export function initI18n() {
  const lang = savedLang();
  if (lang !== "en") void setLang(lang);
}
