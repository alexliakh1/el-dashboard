import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const state=sqliteTable('commute_state',{key:text('key').primaryKey(),value:text('value').notNull()});
export const locks=sqliteTable('commute_locks',{name:text('name').primaryKey(),owner:text('owner').notNull(),expires:integer('expires').notNull()});
