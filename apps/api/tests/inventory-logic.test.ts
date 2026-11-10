import { describe, expect, it } from 'vitest';
import { MAX_QTY, MAX_STOCK, applyStock, isLow, itemCode, stockValue, tidy } from '../src/modules/inventory/inventory.logic';

describe('inventory rules', () => {
  it('receiving adds to the stock', () => {
    expect(applyStock(10, 'IN', 5)).toEqual({ ok: true, delta: 5, balance: 15 });
    expect(applyStock(0, 'IN', 1)).toEqual({ ok: true, delta: 1, balance: 1 });
  });
  it('issuing removes stock but never below zero', () => {
    expect(applyStock(10, 'OUT', 4)).toEqual({ ok: true, delta: -4, balance: 6 });
    expect(applyStock(10, 'OUT', 10)).toEqual({ ok: true, delta: -10, balance: 0 });
    expect(applyStock(10, 'OUT', 11)).toEqual({ ok: false, reason: 'INSUFFICIENT' });
  });
  it('a stock count sets the quantity and records the difference', () => {
    expect(applyStock(10, 'ADJUST', 7)).toEqual({ ok: true, delta: -3, balance: 7 });
    expect(applyStock(10, 'ADJUST', 12)).toEqual({ ok: true, delta: 2, balance: 12 });
    expect(applyStock(10, 'ADJUST', 0)).toEqual({ ok: true, delta: -10, balance: 0 });
    expect(applyStock(10, 'ADJUST', 10)).toEqual({ ok: false, reason: 'NO_CHANGE' });
  });
  it('refuses nonsense quantities', () => {
    expect(applyStock(10, 'IN', 0)).toEqual({ ok: false, reason: 'INVALID' });
    expect(applyStock(10, 'OUT', 0)).toEqual({ ok: false, reason: 'INVALID' });
    expect(applyStock(10, 'IN', -1)).toEqual({ ok: false, reason: 'INVALID' });
    expect(applyStock(10, 'IN', 1.5)).toEqual({ ok: false, reason: 'INVALID' });
    expect(applyStock(10, 'IN', MAX_QTY + 1)).toEqual({ ok: false, reason: 'INVALID' });
    expect(applyStock(MAX_STOCK, 'IN', 1)).toEqual({ ok: false, reason: 'TOO_MUCH' });
  });
  it('warns when stock is at or below the reorder level; level 0 never warns', () => {
    expect(isLow(5, 5)).toBe(true);
    expect(isLow(4, 5)).toBe(true);
    expect(isLow(6, 5)).toBe(false);
    expect(isLow(0, 0)).toBe(false);
  });
  it('values stock, numbers items and tidies text', () => {
    expect(stockValue(12, 250)).toBe(3000);
    expect(itemCode(7)).toBe('I-000007');
    expect(tidy('  Chalk  ')).toBe('Chalk');
    expect(tidy('   ')).toBeNull();
    expect(tidy(undefined)).toBeNull();
  });
});
