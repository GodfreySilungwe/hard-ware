import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateBusinessSettingsAccount,
  getCachedBusinessSettings,
  saveBusinessSettingsCache
} from '../src/utils/businessSettings.js';

const setLocalStorage = () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
};

test('business settings cache is isolated between accounts', () => {
  setLocalStorage();
  const accountA = { tenantId: 'tenant-a' };
  const accountB = { tenantId: 'tenant-b' };
  const settingsA = { currency: 'USD', name: 'Business A' };

  activateBusinessSettingsAccount(accountA);
  saveBusinessSettingsCache(settingsA, accountA);
  assert.deepEqual(getCachedBusinessSettings(accountA), settingsA);

  activateBusinessSettingsAccount(accountB);
  assert.equal(getCachedBusinessSettings(accountA), null);
  assert.equal(getCachedBusinessSettings(accountB), null);
  assert.equal(localStorage.getItem('businessCurrency'), null);
});

test('a stale response cannot switch the active settings cache back to another account', () => {
  setLocalStorage();
  const accountA = { tenantId: 'tenant-a' };
  const accountB = { tenantId: 'tenant-b' };

  activateBusinessSettingsAccount(accountA);
  saveBusinessSettingsCache({ currency: 'USD' }, accountA);
  activateBusinessSettingsAccount(accountB);
  saveBusinessSettingsCache({ currency: 'EUR' }, accountA);

  assert.equal(getCachedBusinessSettings(accountA), null);
  assert.equal(getCachedBusinessSettings(accountB), null);
});
