import * as store from '../lib/store.js';

export const state = {
  settings: null,
  prompts: [],
  messages: [],
  context: null,
  tab: 'chat',
  streaming: false,
  controller: null,
  libFilter: { query: '', collection: 'all', tag: 'all', source: 'all', sort: 'relevance' },
  libLimit: 80,
};

export async function bootstrap() {
  state.settings = await store.getSettings();
  state.prompts = await store.listPrompts();
  state.messages = await store.getThread();

  if (!state.settings.starterLoaded) {
    if (!state.prompts.length) {
      const result = await store.addPrompts(
        (await import('../prompts/builtin.js')).BUILTIN_PROMPTS.map((p) => ({
          ...p,
          tags: [...(p.tags || []), 'starter'],
        }))
      );
      state.prompts = result.prompts;
    }
    state.settings = await store.saveSettings({ starterLoaded: true });
  }

  return state;
}

export function setPrompts(prompts) {
  state.prompts = prompts;
}

export function setContext(context) {
  state.context = context;
}

export async function persistMessages() {
  await store.saveThread(state.messages.filter((m) => m.content || m.error));
}
