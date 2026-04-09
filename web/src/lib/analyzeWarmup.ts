let analysisViewImport: Promise<unknown> | null = null;

export function primeAnalyzeView() {
  if (!analysisViewImport) {
    analysisViewImport = import("../pages/AnalysisResult");
  }
  return analysisViewImport;
}
