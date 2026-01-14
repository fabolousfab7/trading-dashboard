import { pgTable, text, serial, timestamp, numeric, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  type: text("type", { enum: ["long", "short"] }).notNull(),
  asset: text("asset").notNull(),
  account: text("account").notNull(),
  strategy: text("strategy").notNull(),
  result: numeric("result").notNull(), // profit or loss amount
  photos: jsonb("photos").default([]), // array of image URLs
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradeSchema = createInsertSchema(trades).omit({ 
  id: true, 
  userId: true, 
  createdAt: true 
}).extend({
  date: z.coerce.date(),
  result: z.coerce.number(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

// Auth types for Supabase
export interface UserProfile {
  id: string;
  email: string;
}
