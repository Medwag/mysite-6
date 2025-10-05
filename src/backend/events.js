// backend/events.js
import { checkPaymentsJob } from 'backend/fallback-cron.js';

// Run once every 1 hour
export function wixCron_onHourlyEvent(event) {
    checkPaymentsJob();
}
