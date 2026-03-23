import { logger } from './lib/logger.js';

// BullMQ workers will be registered here in later milestones
// import { modelSyncWorker } from './jobs/workers/model-sync.worker.js';
// import { costAggregationWorker } from './jobs/workers/cost-aggregation.worker.js';

logger.info('Worker process started');
logger.info('No workers registered yet — will be added in Milestone C+');

// Keep process alive
process.on('SIGTERM', () => {
  logger.info('Worker shutting down...');
  process.exit(0);
});
