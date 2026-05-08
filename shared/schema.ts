import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  varchar,
  jsonb,
  uuid,
  boolean,
  integer,
  date,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
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
  risk: numeric("risk").notNull(), // Now directly mapped to 'risk' column
  timeframe: text("timeframe").notNull(), 
  observations: text("observations"),
  photos: jsonb("photos").default([]), 
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradeSchema = createInsertSchema(trades).omit({ 
  id: true, 
  userId: true, 
  createdAt: true 
}).extend({
  date: z.coerce.date(),
  profit: z.coerce.number(),
  risk: z.coerce.number(),
  timeframe: z.string(),
  observations: z.string().optional(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export interface UserProfile {
  id: string;
  email: string;
}

// =====================================================
// accounts : un compte = un broker/wallet logique
// =====================================================
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    label: text("label").notNull(),
    broker: text("broker").notNull(),
    accountType: text("account_type").notNull().default("personal"),
    currencyBase: text("currency_base").notNull().default("EUR"),
    ibkrAccountNumber: text("ibkr_account_number"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userLabelUnique: unique().on(t.userId, t.label),
    userIdIdx: index("idx_accounts_user_id").on(t.userId),
  })
)

// =====================================================
// ibkr_config : credentials Flex Query (1 par compte IBKR)
// =====================================================
export const ibkrConfig = pgTable("ibkr_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  queryId: text("query_id").notNull(),
  flexToken: text("flex_token").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// =====================================================
// positions : positions ouvertes
// =====================================================
export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    name: text("name"),
    quantity: numeric("quantity").notNull(),
    currency: text("currency").notNull(),
    avgCost: numeric("avg_cost").notNull(),
    marketPrice: numeric("market_price").notNull(),
    bucket: text("bucket"),
    unrealizedPnl: numeric("unrealized_pnl"),
    realizedPnlYtd: numeric("realized_pnl_ytd"),
    assetClass: text("asset_class"),
    stooqSymbol: text("stooq_symbol"),
    fxRateToBase: numeric("fx_rate_to_base"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountTickerUnique: unique().on(t.accountId, t.ticker),
    accountIdIdx: index("idx_positions_account_id").on(t.accountId),
  })
)

// =====================================================
// cash_balances : cash par devise et par compte
// =====================================================
export const cashBalances = pgTable(
  "cash_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    currency: text("currency").notNull(),
    amount: numeric("amount").notNull(),
    fxRateToBase: numeric("fx_rate_to_base"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountCurrencyUnique: unique().on(t.accountId, t.currency),
    accountIdIdx: index("idx_cash_balances_account_id").on(t.accountId),
  })
)

// =====================================================
// portfolio_snapshots : courbe historique NLV
// =====================================================
export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    nlvBase: numeric("nlv_base").notNull(),
    capitalInvested: numeric("capital_invested"),
    realizedPnl: numeric("realized_pnl"),
    unrealizedPnl: numeric("unrealized_pnl"),
    cashTotal: numeric("cash_total"),
    fxRateEurUsd: numeric("fx_rate_eur_usd"),
    rawData: jsonb("raw_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountDateUnique: unique().on(t.accountId, t.snapshotDate),
    accountDateIdx: index("idx_snapshots_account_date").on(t.accountId, t.snapshotDate),
  })
)

// =====================================================
// Relations
// =====================================================
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  ibkrConfig: one(ibkrConfig, {
    fields: [accounts.id],
    references: [ibkrConfig.accountId],
  }),
  positions: many(positions),
  cashBalances: many(cashBalances),
  snapshots: many(portfolioSnapshots),
}))

export const positionsRelations = relations(positions, ({ one }) => ({
  account: one(accounts, {
    fields: [positions.accountId],
    references: [accounts.id],
  }),
}))

export const cashBalancesRelations = relations(cashBalances, ({ one }) => ({
  account: one(accounts, {
    fields: [cashBalances.accountId],
    references: [accounts.id],
  }),
}))

// =====================================================
// Zod schemas (insert / select)
// =====================================================
export const insertAccountSchema = createInsertSchema(accounts, {
  label: z.string().min(1).max(64),
  broker: z.enum(["IBKR", "Boursorama", "Hyperliquid", "Kraken", "Other"]),
  accountType: z.enum(["personal", "company"]),
  currencyBase: z.enum(["EUR", "USD"]),
}).omit({ id: true, createdAt: true, updatedAt: true, userId: true })

export const insertIbkrConfigSchema = createInsertSchema(ibkrConfig, {
  queryId: z.string().min(1),
  flexToken: z.string().min(1),
}).omit({ id: true, createdAt: true, updatedAt: true, lastSyncedAt: true, lastSyncStatus: true, lastSyncError: true })

// Types TS dérivés
export type Account = typeof accounts.$inferSelect
export type InsertAccount = z.infer<typeof insertAccountSchema>
export type IbkrConfig = typeof ibkrConfig.$inferSelect
export type InsertIbkrConfig = z.infer<typeof insertIbkrConfigSchema>
export type Position = typeof positions.$inferSelect
export type CashBalance = typeof cashBalances.$inferSelect
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect
