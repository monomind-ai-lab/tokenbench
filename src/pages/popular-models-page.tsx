import { useCallback, useState } from 'react';
import { POPULAR_CATEGORY_KEYS, POPULAR_CATEGORY_LABELS, POPULAR_MODELS_FIXTURE, POPULAR_MODELS_FIXTURE_METADATA } from '../frontend/popular-models/fixtures';
import {
  copyPopularModelsSectionLink,
  downloadPopularModelsCsv,
  downloadPopularModelsSectionPng,
} from '../frontend/popular-models/export-actions';
import { PopularInsightsSection } from '../frontend/popular-models/insights';
import { PopularLeaderboardSection } from '../frontend/popular-models/leaderboard';
import type { PopularModelFixture } from '../frontend/popular-models/types';
import { StatusBanner } from '../frontend/ui';
import type { PreviewPageProps } from '../preview/route-types';

type ExportState = { readonly tone: 'info' | 'error'; readonly message: string } | null;

export interface PopularModelsPageData {
  readonly disclaimer: string;
  readonly models: readonly PopularModelFixture[];
}

interface PopularModelsPageProps {
  readonly data?: PopularModelsPageData;
}

export function popularModelsPageData(): PopularModelsPageData {
  return {
    disclaimer: POPULAR_MODELS_FIXTURE_METADATA.disclaimer,
    models: POPULAR_MODELS_FIXTURE,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isPopularModelFixture(value: unknown): value is PopularModelFixture {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.slug !== 'string'
    || typeof value.name !== 'string'
    || typeof value.organization !== 'string'
    || typeof value.openWeights !== 'boolean'
    || typeof value.finetune !== 'boolean'
    || typeof value.overallScore !== 'number'
    || typeof value.costPerSuccessfulTask !== 'number'
    || typeof value.outputCostPerMillion !== 'number'
    || typeof value.verbosityTokens !== 'number'
    || value.fixture !== true
    || !isRecord(value.categoryScores)
    || !isRecord(value.categorySubtasks)) return false;

  return POPULAR_CATEGORY_KEYS.every((category) => {
    const subtasks = value.categorySubtasks[category];
    return typeof value.categoryScores[category] === 'number'
      && Array.isArray(subtasks)
      && subtasks.every((subtask) => isRecord(subtask)
        && typeof subtask.id === 'string'
        && typeof subtask.label === 'string'
        && typeof subtask.score === 'number'
        && typeof subtask.note === 'string');
  });
}

export function parsePopularModelsPageData(value: unknown): PopularModelsPageData | null {
  if (!isRecord(value)) return null;
  const candidate = value as { readonly disclaimer?: unknown; readonly models?: unknown };
  return typeof candidate.disclaimer === 'string'
    && Array.isArray(candidate.models)
    && candidate.models.every(isPopularModelFixture)
    ? candidate as PopularModelsPageData
    : null;
}

function csvRows(models: readonly PopularModelFixture[]): readonly (readonly (string | number | boolean)[])[] {
  return [
    [
      'Model',
      'Provider',
      'Open weights',
      'Overall',
      ...POPULAR_CATEGORY_KEYS.map((category) => POPULAR_CATEGORY_LABELS[category]),
      'Cost per successful task (USD)',
      'Output price per 1M tokens (USD)',
      'Verbosity (tokens)',
      'Fixture data',
    ],
    ...models.map((model) => [
      model.name,
      model.organization,
      model.openWeights,
      model.overallScore,
      ...POPULAR_CATEGORY_KEYS.map((category) => model.categoryScores[category]),
      model.costPerSuccessfulTask,
      model.outputCostPerMillion,
      model.verbosityTokens,
      model.fixture,
    ]),
  ];
}

export function PopularModelsPage({ data }: PopularModelsPageProps = {}) {
  const [exportState, setExportState] = useState<ExportState>(null);
  const pageData = data ?? popularModelsPageData();

  const copyLink = useCallback(async (sectionId: string) => {
    try {
      await copyPopularModelsSectionLink(sectionId);
      setExportState({ tone: 'info', message: 'Section link copied to the clipboard.' });
    } catch {
      setExportState({ tone: 'error', message: 'The section link could not be copied. Copy the current address from your browser instead.' });
    }
  }, []);

  const downloadPng = useCallback(async (sectionId: string) => {
    try {
      setExportState({ tone: 'info', message: 'Preparing the section image.' });
      await downloadPopularModelsSectionPng(sectionId, `${sectionId}.png`);
      setExportState({ tone: 'info', message: 'PNG download ready.' });
    } catch {
      setExportState({ tone: 'error', message: 'The PNG could not be generated. Try again after the charts finish rendering.' });
    }
  }, []);

  const downloadCsv = useCallback((models: readonly PopularModelFixture[]) => {
    downloadPopularModelsCsv(csvRows(models), 'tokenbench-popular-models.csv');
    setExportState({ tone: 'info', message: 'CSV download ready.' });
  }, []);

  return (
    <div className="content-stack popular-models-page">
      <header className="popular-models-hero leaderboard-page-hero" aria-labelledby="popular-models-heading">
        <div>
          <h1 id="popular-models-heading" className="leaderboard-page-hero-title">Popular models leaderboard</h1>
          <p className="leaderboard-page-hero-description">Explore quality, task economics, and category strengths across one dense interactive workbench.</p>
          <span className="popular-models-fixture-badge leaderboard-page-hero-fixture">Illustrative prototype data</span>
        </div>
      </header>

      <StatusBanner tone="warning">
        {pageData.disclaimer}
      </StatusBanner>
      {exportState ? <StatusBanner tone={exportState.tone}>{exportState.message}</StatusBanner> : null}

      <PopularLeaderboardSection
        models={pageData.models}
        onCopyLink={copyLink}
        onDownloadPng={downloadPng}
        onDownloadCsv={downloadCsv}
      />
      <PopularInsightsSection
        models={pageData.models}
        onCopyLink={copyLink}
        onDownloadPng={downloadPng}
        onDownloadCsv={downloadCsv}
      />
    </div>
  );
}

/** Adapts manifest data into the page's typed fixture contract without a prototype mount. */
export function PopularModelsRoutePage({ data }: PreviewPageProps) {
  return <PopularModelsPage data={parsePopularModelsPageData(data) ?? undefined} />;
}
