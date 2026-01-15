import { pgTable, text, serial, timestamp, numeric, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  type: text("type", { enum: ["long", "short"] }).notNull(),
  actif: text("actif").notNull(),
  compte: text("compte").notNull(),
  strategie: text("strategie").notNull(),
  profit: numeric("profit").notNull(), 
  observations: text("observations"),
  photos: jsonb("photos").default([]), // array of image URLs
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradeSchema = createInsertSchema(trades).omit({ 
  id: true, 
  userId: true, 
  createdAt: true 
}).extend({
  date: z.coerce.date(),
  profit: z.coerce.number(),
  observations: z.string().optional(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

// Auth types for Supabase
export interface UserProfile {
  id: string;
  email: string;
}
