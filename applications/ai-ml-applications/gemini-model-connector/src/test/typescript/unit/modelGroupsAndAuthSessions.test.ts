import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ModelFamily,
  getModelFamily,
  ModelGroupDisplay,
} from '@/domain/constants/index.js';
import { GrokModelDiscoveryStrategy } from '@/services/model/modelDiscoveryService.js';
import { authService } from '@/services/auth/authService.js';
import { authRepo } from '@/repositories/authRepository.js';

describe('Model Groups, Categories & Multi-Session Authentication Tests', () => {
  describe('Requirement 1: Category & Group Mapping', () => {
    it('should correctly map all model names to their respective categories/groups', () => {
      // Gemini family
      assert.equal(getModelFamily('gemini-2.5-pro'), ModelFamily.GEMINI);
      assert.equal(getModelFamily('gemini-3.8-flash'), ModelFamily.GEMINI);
      assert.equal(getModelFamily('gemini-ultra'), ModelFamily.GEMINI);

      // Grok family
      assert.equal(getModelFamily('grok-3'), ModelFamily.GROK);
      assert.equal(getModelFamily('grok-2'), ModelFamily.GROK);
      assert.equal(getModelFamily('grok-beta'), ModelFamily.GROK);

      // Ollama family
      assert.equal(getModelFamily('ollama/llama3'), ModelFamily.OLLAMA);
      assert.equal(getModelFamily('deepseek-r1:latest'), ModelFamily.OLLAMA);
      assert.equal(getModelFamily('mistral:7b'), ModelFamily.OLLAMA);

      // Claude family
      assert.equal(getModelFamily('claude-3-7-sonnet'), ModelFamily.CLAUDE);
      assert.equal(getModelFamily('claude-3-opus'), ModelFamily.CLAUDE);

      // Copilot family
      assert.equal(getModelFamily('copilot-gpt-4o'), ModelFamily.COPILOT);
      assert.equal(getModelFamily('github-copilot'), ModelFamily.COPILOT);

      // Codex family
      assert.equal(getModelFamily('codex-davinci-002'), ModelFamily.CODEX);
      assert.equal(getModelFamily('openai-codex'), ModelFamily.CODEX);

      // Cursor family
      assert.equal(getModelFamily('cursor-small'), ModelFamily.CURSOR);
      assert.equal(getModelFamily('cursor-tab'), ModelFamily.CURSOR);
    });

    it('should provide display metadata (labels, icons, badges) for each category', () => {
      assert.equal(ModelGroupDisplay[ModelFamily.GEMINI].label, 'Google Gemini');
      assert.equal(ModelGroupDisplay[ModelFamily.GROK].label, 'xAI Grok');
      assert.equal(ModelGroupDisplay[ModelFamily.OLLAMA].label, 'Ollama Local');
      assert.equal(ModelGroupDisplay[ModelFamily.CLAUDE].label, 'Anthropic Claude');
      assert.equal(ModelGroupDisplay[ModelFamily.COPILOT].label, 'GitHub Copilot');
      assert.equal(ModelGroupDisplay[ModelFamily.CODEX].label, 'OpenAI Codex');
      assert.equal(ModelGroupDisplay[ModelFamily.CURSOR].label, 'Cursor AI');

      assert.equal(ModelGroupDisplay[ModelFamily.GEMINI].badgeClass, 'badge-gemini');
      assert.equal(ModelGroupDisplay[ModelFamily.GROK].badgeClass, 'badge-grok');
      assert.equal(ModelGroupDisplay[ModelFamily.OLLAMA].badgeClass, 'badge-ollama');
    });

    it('should discover grok models with correct family metadata via GrokModelDiscoveryStrategy', async () => {
      const strategy = new GrokModelDiscoveryStrategy();
      assert.equal(strategy.family, ModelFamily.GROK);
      const discovered = await strategy.discover();
      assert.ok(discovered.length >= 2);
      assert.ok(discovered.some((m) => m.name === 'grok-3' && m.family === ModelFamily.GROK));
      assert.ok(discovered.some((m) => m.name === 'grok-2' && m.family === ModelFamily.GROK));
    });
  });

  describe('Requirement 2 & 3: Multi-Session Authentication & Selective Logout', () => {
    it('should support multiple active logins with different session IDs / account IDs', async () => {
      // Clean slate
      await authRepo.deleteAllModelAuth();

      // Login Account 1 for Gemini
      const session1 = await authService.loginWithCredentials(
        'gemini-2.5-pro',
        'key-session-1',
        'work@company.com',
        undefined,
        '127.0.0.1',
        'sess-gemini-work'
      );

      // Login Account 2 for Gemini under different session ID
      const session2 = await authService.loginWithCredentials(
        'gemini-2.5-pro',
        'key-session-2',
        'personal@gmail.com',
        undefined,
        '127.0.0.1',
        'sess-gemini-personal'
      );

      // Login Account for Grok
      const sessionGrok = await authService.loginWithCredentials(
        'grok-3',
        'xai-test-key',
        'developer@xai.com',
        undefined,
        '127.0.0.1',
        'sess-grok-dev'
      );

      assert.equal(session1.id, 'sess-gemini-work');
      assert.equal(session2.id, 'sess-gemini-personal');
      assert.equal(sessionGrok.id, 'sess-grok-dev');

      // Check status
      const status = await authService.getStatus();
      assert.equal(status.overall_authenticated, true);
      assert.ok(status.active_sessions.length >= 3);

      const sessWork = status.active_sessions.find((s) => s.id === 'sess-gemini-work');
      const sessPersonal = status.active_sessions.find((s) => s.id === 'sess-gemini-personal');
      const sessGrokFound = status.active_sessions.find((s) => s.id === 'sess-grok-dev');

      assert.ok(sessWork, 'Session work must be present');
      assert.equal(sessWork.family, ModelFamily.GEMINI);
      assert.equal(sessWork.account_email, 'work@company.com');

      assert.ok(sessPersonal, 'Session personal must be present');
      assert.equal(sessPersonal.family, ModelFamily.GEMINI);

      assert.ok(sessGrokFound, 'Session grok must be present');
      assert.equal(sessGrokFound.family, ModelFamily.GROK);
    });

    it('should logout ONLY the targeted session ID leaving other sessions active', async () => {
      // Logout session 1 specifically
      const logoutRes = await authService.logout({ id: 'sess-gemini-work' });
      assert.equal(logoutRes.success, true);

      // Verify session 1 is gone, but session 2 and Grok remain
      const status = await authService.getStatus();
      const sessWork = status.active_sessions.find((s) => s.id === 'sess-gemini-work');
      const sessPersonal = status.active_sessions.find((s) => s.id === 'sess-gemini-personal');
      const sessGrok = status.active_sessions.find((s) => s.id === 'sess-grok-dev');

      assert.equal(sessWork, undefined, 'Session work should have been deleted');
      assert.ok(sessPersonal, 'Session personal must still be active');
      assert.ok(sessGrok, 'Session grok must still be active');
    });

    it('should return empty active_sessions and overall_authenticated=false after global logout', async () => {
      await authService.logout({ all: true });
      const status = await authService.getStatus();
      assert.equal(status.overall_authenticated, false);
      assert.equal(status.active_sessions.length, 0);

      // Verify that unauthenticated models have empty active_sessions
      const geminiStatus = status.models['gemini-2.5-pro'];
      if (geminiStatus) {
        assert.equal(geminiStatus.authenticated, false);
        assert.equal(geminiStatus.active_sessions.length, 0);
      }
    });
  });
});
