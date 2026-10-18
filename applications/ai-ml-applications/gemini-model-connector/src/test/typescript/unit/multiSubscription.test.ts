import { describe, it } from 'node:test';
import assert from 'node:assert';
import { config } from '@/core/config/index.js';
import { subscriptionManager } from '@/core/subscription/subscriptionManager.js';

describe('Multi-Subscription Model Configuration from application.yml', () => {
  it('should retrieve distinct paid and freeware subscriptions for gemini model', () => {
    const paidSub = config.getSubscription('gemini', 'paid');
    const freeSub = config.getSubscription('gemini', 'freeware');

    assert.ok(paidSub, 'Paid subscription should exist for Gemini');
    assert.ok(freeSub, 'Freeware subscription should exist for Gemini');
    assert.strictEqual(paidSub.tier, 'paid');
    assert.strictEqual(freeSub.tier, 'freeware');
    assert.notStrictEqual(paidSub.accountEmail, freeSub.accountEmail, 'Paid and freeware should have different account emails');
    assert.notStrictEqual(paidSub.accountName, freeSub.accountName, 'Paid and freeware should have different account names');
    assert.strictEqual(paidSub.accountEmail, 'gemini-paid@enterprise.local');
    assert.strictEqual(freeSub.accountEmail, 'gemini-free@enterprise.local');
  });

  it('should retrieve distinct paid and freeware subscriptions for copilot model', () => {
    const paidSub = config.getSubscription('copilot', 'paid');
    const freeSub = config.getSubscription('copilot', 'freeware');

    assert.ok(paidSub);
    assert.ok(freeSub);
    assert.strictEqual(paidSub.accountEmail, 'copilot-enterprise@enterprise.local');
    assert.strictEqual(freeSub.accountEmail, 'copilot-individual@enterprise.local');
  });

  it('should list all available subscriptions for a given model', () => {
    const subs = config.getModelSubscriptions('gemini');
    assert.ok(Array.isArray(subs));
    assert.strictEqual(subs.length, 3);
    assert.ok(subs.some((s) => s.tier === 'paid'));
    assert.ok(subs.some((s) => s.tier === 'freeware'));
  });

  it('should evaluate routing decision and attach subscription account metadata', () => {
    const decision = subscriptionManager.evaluateRouting('gemini-3.8-flash', true, 0, false, 'paid_first');
    assert.strictEqual(decision.executedTier, 'paid');
    assert.strictEqual(decision.accountEmail, 'gemini-paid@enterprise.local');
    assert.strictEqual(decision.accountName, 'Google Gemini Paid Enterprise Seat');
  });

  it('should evaluate fallback routing and attach freeware subscription account metadata', () => {
    const decision = subscriptionManager.evaluateRouting('gemini-3.8-flash', false, 0, false, 'paid_first');
    assert.strictEqual(decision.isFallback, true);
    assert.strictEqual(decision.executedTier, 'freeware');
    assert.ok(decision.accountEmail, 'Fallback decision should have account email');
    assert.ok(decision.accountName, 'Fallback decision should have account name');
  });
});
