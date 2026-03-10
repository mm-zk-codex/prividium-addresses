import type { StepperStep } from './types';

export const TRACKING_COOKIE = 'last_tracking_id';

export const STATUS_LABELS: Record<string, string> = {
  detected_l1: 'Deposit received',
  l1_forwarder_deployed: 'Preparing bridge',
  l1_bridging_submitted: 'Bridging to Prividium',
  l2_arrived: 'Arrived on Prividium (deposit address)',
  l2_forwarder_deployed: 'Finalizing (forwarder deployed)',
  l2_swept_y_to_x: 'Finalizing (internal forwarding)',
  l2_vault_deployed: 'Finalizing',
  credited: 'Completed',
  pending: 'Pending',
  stuck: 'Needs attention',
  l1_failed: 'Needs attention',
  l2_failed: 'Needs attention',
  error: 'Needs attention',
  failed: 'Needs attention'
};

export const STATUS_STEP: Record<string, StepperStep> = {
  detected_l1: 'deposit',
  l1_forwarder_deployed: 'bridge',
  l1_bridging_submitted: 'bridge',
  l2_arrived: 'finalize',
  l2_forwarder_deployed: 'finalize',
  l2_swept_y_to_x: 'finalize',
  l2_vault_deployed: 'finalize',
  credited: 'complete'
};
