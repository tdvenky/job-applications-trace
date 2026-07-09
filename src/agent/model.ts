import { createAnthropic } from '@ai-sdk/anthropic';

// Supported providers — extend this union as new providers are added
type Provider = 'anthropic';

// Default model per provider. When adding a new provider, add its default here.
const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  // openai: 'gpt-4o',
};

interface ModelConfig {
  provider?: Provider;
  model?: string;
}

/**
 * Returns a Vercel AI SDK model instance for the given provider.
 * The agent loop calls this and never touches provider-specific code directly,
 * so swapping providers means adding a case here and an entry in DEFAULT_MODELS.
 */
export function createModel(apiKey: string, config: ModelConfig = {}) {
  const provider = config.provider ?? 'anthropic';

  switch (provider) {
    case 'anthropic': {
      const client = createAnthropic({ apiKey });
      return client(config.model ?? DEFAULT_MODELS.anthropic);
    }

    // To add OpenAI later:
    // case 'openai': {
    //   const client = createOpenAI({ apiKey });
    //   return client(config.model ?? DEFAULT_MODELS.openai);
    // }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
