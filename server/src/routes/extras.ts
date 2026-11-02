import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { badRequest, conflict, handler, HttpError, notFound, param } from "../lib/http.js";
import { uid } from "../middleware/auth.js";
import { clearDemo, loadDemo } from "../services/demo.js";

export const extrasRouter = Router();

// ---------- barcode lookup ----------

/**
 * 1) Looks for the barcode in the user's own pantry, 2) asks Open Food Facts (free, public).
 * If nothing is found we say so — product details are never invented.
 */
extrasRouter.get(
  "/barcode/:code",
  handler(async (req, res) => {
    const userId = uid(req);
    const code = param(req, "code").trim();
    if (!/^\d{6,14}$/.test(code)) throw badRequest("Barcode must be 6–14 digits");

    const own = await prisma.item.findFirst({ where: { userId, barcode: code, deletedAt: null }, include: { category: true } });
    if (own) {
      res.json({ found: true, source: "pantry", itemId: own.id, name: own.name, brand: own.brand, unit: own.unit, categoryId: own.categoryId });
      return;
    }
    if (!config.barcodeLookupEnabled) {
      res.json({ found: false, source: "disabled", message: "Online barcode lookup is turned off. Enter the details manually." });
      return;
    }
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,categories_tags`, {
        headers: { "User-Agent": "SmartPantryManager/1.0 (student project)" },
        signal: AbortSignal.timeout(6000),
      });
      if (r.status === 404) {
        res.json({ found: false, source: "openfoodfacts", message: "Product not found. Please enter the details manually." });
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { status?: number; product?: { product_name?: string; brands?: string; quantity?: string; categories_tags?: string[] } };
      const name = data.product?.product_name?.trim();
      if (data.status !== 1 || !name) {
        res.json({ found: false, source: "openfoodfacts", message: "Product not found. Please enter the details manually." });
        return;
      }
      res.json({
        found: true,
        source: "openfoodfacts",
        name,
        brand: data.product?.brands?.split(",")[0]?.trim() || null,
        packageSize: data.product?.quantity || null,
        categoryHints: (data.product?.categories_tags ?? []).slice(0, 5).map((t) => t.replace(/^\w\w:/, "").replace(/-/g, " ")),
      });
    } catch (err) {
      throw new HttpError(502, "The barcode service couldn't be reached. You can still enter the details manually.", "LOOKUP_UNAVAILABLE", {
        reason: (err as Error).message,
      });
    }
  }),
);

// ---------- images (stored in the database, max 2 MB) ----------

export const MAX_IMAGES_PER_USER = 300;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

/** Checks the file's actual bytes, not just the name or the browser-reported type. */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

extrasRouter.post(
  "/images",
  upload.single("image"),
  handler(async (req, res) => {
    const userId = uid(req);
    if (!req.file) throw badRequest("Choose an image to upload");
    const mimeType = sniffImageType(req.file.buffer);
    if (!mimeType) throw badRequest("Only JPEG, PNG or WebP images are allowed");
    // Photos not attached to any item are removed by the daily clean-up; the cap stops abuse in between
    if ((await prisma.itemImage.count({ where: { userId } })) >= MAX_IMAGES_PER_USER) {
      throw badRequest(`You can store up to ${MAX_IMAGES_PER_USER} photos. Remove photos from items you no longer need.`);
    }
    const image = await prisma.itemImage.create({ data: { userId, mimeType, data: new Uint8Array(req.file.buffer) } });
    res.status(201).json({ imageId: image.id });
  }),
);

extrasRouter.get(
  "/images/:id",
  handler(async (req, res) => {
    const image = await prisma.itemImage.findFirst({ where: { id: param(req, "id"), userId: uid(req) } });
    if (!image) throw notFound("Image");
    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(image.data));
  }),
);

extrasRouter.delete(
  "/images/:id",
  handler(async (req, res) => {
    const { count } = await prisma.itemImage.deleteMany({ where: { id: param(req, "id"), userId: uid(req) } });
    if (!count) throw notFound("Image");
    res.json({ ok: true });
  }),
);

// ---------- demo data ----------

extrasRouter.post(
  "/demo",
  handler(async (req, res) => {
    const userId = uid(req);
    if (await prisma.item.findFirst({ where: { userId, isDemo: true } })) throw conflict("Demo data is already loaded", "DEMO_LOADED");
    res.status(201).json(await loadDemo(userId));
  }),
);

extrasRouter.delete(
  "/demo",
  handler(async (req, res) => {
    res.json(await clearDemo(uid(req)));
  }),
);
