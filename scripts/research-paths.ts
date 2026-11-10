export const reportDirectory = process.env.RESEARCH_RUN_DIRECTORY ?? 'reports/implementation';
export const cacheDirectory = process.env.RESEARCH_RUN_DIRECTORY
  ? `${reportDirectory}/cache`
  : '.cache/research';
