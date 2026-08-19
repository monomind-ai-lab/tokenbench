export const modelLinks = {
  "gpt-5.6-terra-max": {
    url: "https://platform.openai.com/docs/models/gpt-5.6",
    organization: "OpenAI",
    displayName: "GPT-5.6 Terra Max Effort",
    reasoner: true,
    variants: [
      { rawName: "gpt-5.6-terra-xhigh", displayName: "GPT-5.6 Terra xHigh Effort", },
    ],
  },
  "kimi-k3": {
    url: "https://www.kimi.com/blog/kimi-k3",
    organization: "Moonshot AI",
    displayName: "Kimi K3",
    openweight: true,
    reasoner: true,
    huggingface: "https://huggingface.co/moonshotai/Kimi-K3",
  },
  "smaug-agentic": {
    organization: "Abacus.AI",
    displayName: "Smaug-Agentic",
    openweight: true,
    reasoner: true,
    huggingface: "https://huggingface.co/abacusai/Smaug-Agentic",
    finetune: {
      organization: "Abacus.AI",
      baseModel: "Kimi K3",
      baseOrganization: "Moonshot AI"
    },
  },
};
