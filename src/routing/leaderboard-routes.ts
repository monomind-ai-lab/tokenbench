import { SITE_CONFIG } from '../brand/site-config';

export const LEADERBOARD_ROUTES = {
  'llm-overall': {
    pathname: '/leaderboards/llm/overall/',
    navigationLabel: 'Overall benchmarks',
    seo: {
      title: `Overall benchmarks | ${SITE_CONFIG.name}`,
      description: `Compare supported AI models by overall benchmark capability with clear source attribution, methodology context, and ${SITE_CONFIG.name}'s unavailable-data handling.`,
      h1: 'Overall benchmarks',
      summary: 'Review the supported overall-capability signal alongside its source, update time, and methodology before making a model decision.',
    },
  },
  'llm-coding': {
    pathname: '/leaderboards/llm/coding/',
    navigationLabel: 'Coding performance',
    seo: {
      title: `Coding benchmark | ${SITE_CONFIG.name}`,
      description: `Compare supported AI coding models with source-aware benchmark context, transparent methodology, and ${SITE_CONFIG.name}'s explicit treatment of missing measurements.`,
      h1: 'Coding benchmark',
      summary: 'Use coding benchmark evidence as one input to a workload-specific evaluation, not as a substitute for your repository and toolchain tests.',
    },
  },
  'llm-agentic': {
    pathname: '/leaderboards/llm/agentic/',
    navigationLabel: 'Agentic performance',
    seo: {
      title: `Agentic performance | ${SITE_CONFIG.name}`,
      description: `Explore supported agentic AI model benchmarks with source-level context, publication timestamps, and ${SITE_CONFIG.name}'s clear methodology for unavailable results.`,
      h1: 'Agentic performance',
      summary: 'Agentic performance depends on the tools, policies, and task environment; inspect the evidence before generalizing a benchmark result.',
    },
  },
  'llm-reasoning': {
    pathname: '/leaderboards/llm/reasoning/',
    navigationLabel: 'Reasoning',
    seo: {
      title: `Reasoning | ${SITE_CONFIG.name}`,
      description: `Review supported AI reasoning category evidence from BenchLM with source-level methodology, timestamps, and ${SITE_CONFIG.name}'s explicit unavailable-data handling. This category evidence lens is not a validated BenchAlign ranking.`,
      h1: 'Reasoning',
      summary: 'Reasoning is a BenchLM-published category evidence lens, not a validated BenchAlign ranking; inspect the exact source measurement before applying it to your workload.',
    },
  },
  'llm-knowledge': {
    pathname: '/leaderboards/llm/knowledge/',
    navigationLabel: 'Knowledge',
    seo: {
      title: `Knowledge | ${SITE_CONFIG.name}`,
      description: `Review supported AI knowledge category evidence from BenchLM with source-level methodology, timestamps, and ${SITE_CONFIG.name}'s explicit unavailable-data handling. This category evidence lens is not a validated BenchAlign ranking.`,
      h1: 'Knowledge',
      summary: 'Knowledge is a BenchLM-published category evidence lens, not a validated BenchAlign ranking. If BenchLM has not published the reviewed category metric, this view remains unavailable rather than inferring a result.',
    },
  },
  'llm-human-preference': {
    pathname: '/leaderboards/llm/human-preference/',
    navigationLabel: 'Human preference',
    seo: {
      title: `Human preference | ${SITE_CONFIG.name}`,
      description: `Review human-preference AI model rankings with visible source context, methodology notes, and ${SITE_CONFIG.name}'s honest unavailable states for incomplete evidence.`,
      h1: 'Human preference',
      summary: 'Human-preference signals are useful for comparing perceived response quality, while task fit and safety requirements still need local evaluation.',
    },
  },
  'llm-value': {
    pathname: '/leaderboards/llm/value/',
    navigationLabel: 'Value frontier',
    seo: {
      title: `Value frontier | ${SITE_CONFIG.name}`,
      description: `Explore the AI model value frontier using disclosed workload costs, supported benchmark evidence, and ${SITE_CONFIG.name}'s transparent Pareto methodology instead of an opaque score.`,
      h1: 'Value frontier',
      summary: 'Value views compare supported capability evidence with stated workload costs and never present an unsupported universal value score.',
    },
  },
  'llm-pricing-context': {
    pathname: '/leaderboards/llm/pricing-context/',
    navigationLabel: 'Pricing and context',
    seo: {
      title: `Pricing and context | ${SITE_CONFIG.name}`,
      description: `Compare AI model pricing context and declared context windows with source attribution, route-level caveats, and ${SITE_CONFIG.name}'s explicit unavailable-data states.`,
      h1: 'Pricing and context',
      summary: 'Price and context information are route-specific; compare the exact provider route and declared limits relevant to your workload.',
    },
  },
  'multimodal-vision-documents': {
    pathname: '/leaderboards/multimodal/vision-documents/',
    navigationLabel: 'Vision and documents',
    seo: {
      title: `Multimodal | ${SITE_CONFIG.name}`,
      description: `Compare supported vision and document AI benchmarks with source-aware methodology, timestamped evidence, and ${SITE_CONFIG.name}'s clear unavailable-result handling.`,
      h1: 'Multimodal',
      summary: 'Vision and document results should be checked against the image, document, language, and extraction conditions that match your use case.',
    },
  },
  'media-text-to-image': {
    pathname: '/leaderboards/media/text-to-image/',
    navigationLabel: 'Text to image',
    seo: {
      title: `Text to image | ${SITE_CONFIG.name}`,
      description: `Explore text-to-image model rankings with source-level attribution, methodology context, and ${SITE_CONFIG.name}'s transparent handling for missing benchmark evidence.`,
      h1: 'Text to image',
      summary: 'Image-generation rankings describe a measured evaluation context and should be paired with prompt, licensing, and workflow review.',
    },
  },
  'media-image-editing': {
    pathname: '/leaderboards/media/image-editing/',
    navigationLabel: 'Image editing',
    seo: {
      title: `Image editing | ${SITE_CONFIG.name}`,
      description: `Review AI image-editing model rankings with source attribution, transparent methodology, and ${SITE_CONFIG.name}'s explicit unavailable states for incomplete evidence.`,
      h1: 'Image editing',
      summary: 'Evaluate editing models against the transformations, source assets, rights, and fidelity requirements of the real production workflow.',
    },
  },
  'media-text-to-video': {
    pathname: '/leaderboards/media/text-to-video/',
    navigationLabel: 'Text to video',
    seo: {
      title: `Text to video | ${SITE_CONFIG.name}`,
      description: `Compare text-to-video model rankings with visible source context, methodology notes, and ${SITE_CONFIG.name}'s transparent treatment of unavailable benchmark evidence.`,
      h1: 'Text to video',
      summary: 'Video-generation evidence should be considered alongside duration, controls, rights, and production workflow requirements.',
    },
  },
  'media-image-to-video': {
    pathname: '/leaderboards/media/image-to-video/',
    navigationLabel: 'Image to video',
    seo: {
      title: `Image to video | ${SITE_CONFIG.name}`,
      description: `Explore image-to-video model rankings with source-level attribution, transparent methodology, and ${SITE_CONFIG.name}'s clear treatment of missing results.`,
      h1: 'Image to video',
      summary: 'Image-to-video rankings are only one signal; assess input fidelity, motion controls, rights, and output reliability for your workflow.',
    },
  },
  'media-video-editing': {
    pathname: '/leaderboards/media/video-editing/',
    navigationLabel: 'Video editing',
    seo: {
      title: `Video editing | ${SITE_CONFIG.name}`,
      description: `Review AI video-editing model rankings with source attribution, methodology context, and ${SITE_CONFIG.name}'s transparent unavailable-data handling.`,
      h1: 'Video editing',
      summary: 'Use video-editing evidence to frame a hands-on workflow test that includes source media, edit controls, rights, and delivery constraints.',
    },
  },
} as const;

export type LeaderboardKey = keyof typeof LEADERBOARD_ROUTES;
