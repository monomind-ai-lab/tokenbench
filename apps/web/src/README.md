# AI Model Comparison Compact Component

A standalone React component providing a compact table-based comparison of leading AI models from the Vercel AI Gateway catalog (June 2026), including GPT-5.4/5.5, Claude 4.x, and Gemini 3.x. Features horizontal scrolling, sortable columns, and condensed data display for quick model evaluation and selection.

## Features

- **Compact Table Layout**: Space-efficient table design for dense information display
- **Horizontal Scrolling**: Mobile-responsive design with horizontal scroll for small screens
- **Sortable Columns**: Click column headers to sort by name, context window, pricing, reasoning, or speed
- **Provider Filtering**: Filter models by provider (OpenAI, Anthropic, Google)
- **Condensed Metrics**: Essential performance data in a compact format
- **Icon Integration**: Provider icons for quick visual identification
- **Category Badges**: Visual indicators for flagship, balanced, and fast models
- **Responsive Design**: Optimized for both mobile and desktop viewing

## Usage

```tsx
import { ModelComparisonCompact } from "@/components/model-comparison-compact"

export default function MyPage() {
  return (
    <div>
      <h1>AI Model Comparison</h1>
      <ModelComparisonCompact />
    </div>
  )
}
```

## Models Included

Model data is sourced from the Vercel AI Gateway (June 2026). The compact table includes 48 curated models across OpenAI, Anthropic, Google, xAI, DeepSeek, and other providers.

### Highlights

- **OpenAI**: GPT 5.5, GPT 5.4 family, GPT-5, GPT-4.1/4o, o3, OSS, embeddings
- **Anthropic**: Claude Opus 4.8, Sonnet 4.6/4.5, Haiku 4.5
- **Google**: Gemini 3.1 Pro Preview, 3.5 Flash, 3 Flash, 2.5 Pro/Flash
- **Others**: Grok 4.x, DeepSeek V4, Llama 4, Mistral, Perplexity Sonar, and more

## Component API

The `ModelComparisonCompact` component accepts no props and is completely self-contained. It manages its own state for filtering and sorting.

## Technical Details

- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Icons**: Lucide React icons and custom AI provider icons
- **State Management**: React hooks (useState, useMemo)
- **Type Safety**: Full TypeScript support
- **Responsive**: Mobile-first design with horizontal scrolling

## Dependencies

- `lucide-react` - For icons
- `@/components/ui/*` - shadcn/ui components (button, badge, select)

## Key Differences from Full Version

- **Table Layout**: Uses HTML table instead of card grid
- **Condensed Data**: Shows only essential metrics (context, price, reasoning, speed)
- **Horizontal Scroll**: Mobile-responsive with horizontal scrolling
- **Space Efficient**: Designed for embedding in smaller spaces
- **Quick Reference**: Optimized for rapid model comparison

## Customization

The compact component is highly customizable:

- **Add Columns**: Extend the table with additional metrics
- **Modify Layout**: Adjust table structure and spacing
- **Change Styling**: Customize colors, fonts, and spacing
- **Add Features**: Include additional filtering or sorting options
- **Update Data**: Modify model information and metrics

## Performance

- **Optimized Rendering**: Uses React.memo and useMemo for efficient updates
- **Minimal Bundle**: Lightweight with no external dependencies beyond UI components
- **Fast Sorting**: Efficient sorting algorithms for real-time updates
- **Responsive**: Smooth horizontal scrolling on mobile devices

## Use Cases

- **Dashboard Widgets**: Embed in larger dashboards and applications
- **Mobile Interfaces**: Space-efficient mobile model selection
- **Quick Reference**: Compact reference tables for developers
- **Embedded Components**: Integration into existing applications
- **Data Dense Displays**: Information-rich comparison interfaces
- **Marketing Materials**: Compact comparison tables for marketing
- **API Documentation**: Quick reference for API model selection
- **Research Tools**: Compact data analysis interfaces

## Responsive Behavior

- **Desktop**: Full table with all columns visible
- **Tablet**: Horizontal scroll with touch-friendly controls
- **Mobile**: Optimized scrolling with larger touch targets
- **Small Screens**: Essential columns prioritized for readability
