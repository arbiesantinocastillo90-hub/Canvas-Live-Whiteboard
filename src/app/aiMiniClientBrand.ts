export function aiMiniClientBrand(reported: string | null) {
  const name = reported?.trim().slice(0, 80) ?? ''
  if (/\bcodex\b/iu.test(name))
    return { id: 'codex', label: 'Codex', mark: null, logo: 'openai' }
  if (/\b(chatgpt|openai)\b/iu.test(name))
    return {
      id: 'openai',
      label: /chatgpt/iu.test(name) ? 'ChatGPT' : 'OpenAI',
      mark: null,
      logo: 'openai',
    }
  if (/\b(claude|anthropic)\b/iu.test(name))
    return {
      id: /claude/iu.test(name) ? 'claude' : 'anthropic',
      label: /claude/iu.test(name) ? 'Claude' : 'Anthropic',
      mark: null,
      logo: /claude/iu.test(name) ? 'claude' : 'anthropic',
    }
  if (/\bgemini\b/iu.test(name))
    return { id: 'gemini', label: 'Gemini', mark: 'Gem', logo: null }
  if (/\bcopilot\b/iu.test(name))
    return { id: 'copilot', label: 'Copilot', mark: 'Co', logo: null }
  return {
    id: 'unknown',
    label: name || 'Waiting for AI',
    mark: 'AI',
    logo: null,
  }
}
