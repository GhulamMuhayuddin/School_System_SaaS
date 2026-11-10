import type { StockKindValue } from './inventory.logic';

export type { StockKindValue };
export interface ItemDto {
  id: string; code: string; name: string; category: string | null; unit: string; quantity: number; reorderLevel: number; unitCost: number; value: number;
  low: boolean; location: string | null; notes: string | null; active: boolean;
}
export interface MovementDto {
  id: string; item: { id: string; code: string; name: string; unit: string }; kind: StockKindValue; delta: number; balanceAfter: number; unitCost: number | null;
  party: string | null; reference: string | null; note: string | null; movedOn: string; createdAt: string;
}
export interface ItemInput { name: string; category?: string | null; unit?: string; reorderLevel?: number; unitCost?: number; location?: string | null; notes?: string | null; openingQuantity?: number }
export interface ItemPatch { name?: string; category?: string | null; unit?: string; reorderLevel?: number; unitCost?: number; location?: string | null; notes?: string | null; active?: boolean }
export interface ItemFilter { q?: string; category?: string; lowOnly: boolean; includeInactive: boolean }
export interface StockInput { kind: StockKindValue; quantity: number; unitCost?: number; party?: string | null; reference?: string | null; note?: string | null; movedOn?: string }
export interface MovementFilter { itemId?: string; kind?: StockKindValue; from?: string; to?: string }
export interface InventorySummary { items: number; lowItems: number; outOfStock: number; totalValue: number }
export interface ItemDetail { item: ItemDto; movements: MovementDto[] }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface InventoryApi {
  summary(schoolId: string): Promise<InventorySummary>;
  categories(schoolId: string): Promise<string[]>;
  listItems(schoolId: string, filter: ItemFilter): Promise<{ items: ItemDto[]; truncated: boolean }>;
  getItem(schoolId: string, id: string): Promise<ItemDetail>;
  createItem(schoolId: string, actorId: string, input: ItemInput): Promise<ItemDto>;
  updateItem(schoolId: string, actorId: string, id: string, patch: ItemPatch): Promise<ItemDto>;
  moveStock(schoolId: string, actorId: string, itemId: string, input: StockInput): Promise<ItemDetail>;
  listMovements(schoolId: string, filter: MovementFilter): Promise<{ movements: MovementDto[]; truncated: boolean }>;
}
