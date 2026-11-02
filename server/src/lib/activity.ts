import type { Tx } from "../db.js";
import { prisma } from "../db.js";
import { actorContext } from "../middleware/auth.js";

export type ActivityAction =
  | "ITEM_CREATED"
  | "ITEM_UPDATED"
  | "ITEM_DELETED"
  | "ITEM_RESTORED"
  | "ITEM_PURGED"
  | "RESTOCKED"
  | "QUANTITY_ADJUSTED"
  | "BATCH_DELETED"
  | "OPENED"
  | "CONSUMED"
  | "WASTED"
  | "SHOPPING_ADDED"
  | "SHOPPING_PURCHASED"
  | "SHOPPING_REMOVED"
  | "CATEGORY_CHANGED"
  | "LOCATION_CHANGED"
  | "SETTINGS_UPDATED"
  | "IMPORTED"
  | "BACKUP_RESTORED"
  | "DEMO_LOADED"
  | "DEMO_CLEARED"
  | "RECIPE_COOKED"
  | "HOUSEHOLD_CHANGED";

/** Writes a readable audit entry. Never include passwords, tokens or other secrets in `message`. */
export function logActivity(
  db: Tx | typeof prisma,
  userId: string,
  action: ActivityAction,
  entityType: string,
  message: string,
  entityId?: string | null,
) {
  return db.activity.create({ data: { userId, action, entityType, entityId: entityId ?? null, message, actorName: actorContext.getStore()?.actorName ?? null } });
}
