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

type ExportState = { readonly tone: 'info' | 'error'; readonly message: string } | null;

function csvRows(models: readonly PopularModelFixture[]): readonly (readonly (string | number | boolean)[])[] {
  return [
    [
      'Model',
      'Organization',
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

export function PopularModelsPage() {
  const [exportState, setExportState] = useState<ExportState>(null);

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
      <header className="popular-models-hero" aria-labelledby="popular-models-heading">
        <div>
          <h1 id="popular-models-heading">Popular models leaderboard</h1>
          <p>Explore quality, task economics, and category strengths across one dense interactive workbench.</p>
        </div>
        <span className="popular-models-fixture-badge">Illustrative prototype data</span>
      </header>

      <StatusBanner tone="warning">
        {POPULAR_MODELS_FIXTURE_METADATA.disclaimer}
      </StatusBanner>
      {exportState ? <StatusBanner tone={exportState.tone}>{exportState.message}</StatusBanner> : null}

      <PopularLeaderboardSection
        models={POPULAR_MODELS_FIXTURE}
        onCopyLink={copyLink}
        onDownloadPng={downloadPng}
        onDownloadCsv={downloadCsv}
      />
      <PopularInsightsSection
        models={POPULAR_MODELS_FIXTURE}
        onCopyLink={copyLink}
        onDownloadPng={downloadPng}
        onDownloadCsv={downloadCsv}
      />
    </div>
  );
}
