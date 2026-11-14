import { onCall } from 'firebase-functions/v2/https';
import { buildHealth } from './health';

export const health = onCall({ region: 'southamerica-east1' }, () => buildHealth(new Date()));
