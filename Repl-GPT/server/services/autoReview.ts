import { logger } from "../middleware/logger";

export type AutoReviewDecision = "approved" | "rejected" | "pending";

export interface AutoReviewConfig {
  enabled: boolean;
  minDurationSec: number;
}

export interface AutoReviewResult {
  decision: AutoReviewDecision;
  scorePct: number;
  attemptDurationSec: number;
  autoReviewedAt: Date;
  message: string;
}

export function getAutoReviewConfig(): AutoReviewConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const enabledEnv = process.env.AUTO_REVIEW_ENABLED;
  
  let enabled: boolean;
  if (enabledEnv !== undefined) {
    enabled = enabledEnv.toLowerCase() === "true";
  } else {
    enabled = nodeEnv === "development";
  }
  
  const minDurationSec = parseInt(process.env.AUTO_REVIEW_MIN_DURATION_SEC || "30", 10);
  
  return { enabled, minDurationSec };
}

export function computeAutoReview(
  scorePct: number,
  attemptDurationSec: number,
  config: AutoReviewConfig
): AutoReviewResult {
  const autoReviewedAt = new Date();
  
  if (!config.enabled) {
    return {
      decision: "pending",
      scorePct,
      attemptDurationSec,
      autoReviewedAt,
      message: "Auto-review disabled, awaiting human review.",
    };
  }
  
  if (scorePct === 1.0 && attemptDurationSec >= config.minDurationSec) {
    logger.info({
      message: "Auto-review approved",
      scorePct,
      attemptDurationSec,
      minDuration: config.minDurationSec,
    });
    return {
      decision: "approved",
      scorePct,
      attemptDurationSec,
      autoReviewedAt,
      message: `Auto-approved: perfect score + minimum time met (${attemptDurationSec}s >= ${config.minDurationSec}s).`,
    };
  }
  
  if (scorePct <= 0.40) {
    logger.info({
      message: "Auto-review rejected",
      scorePct,
      attemptDurationSec,
    });
    return {
      decision: "rejected",
      scorePct,
      attemptDurationSec,
      autoReviewedAt,
      message: `Auto-rejected: score too low (${(scorePct * 100).toFixed(0)}% <= 40%).`,
    };
  }
  
  logger.info({
    message: "Auto-review pending",
    scorePct,
    attemptDurationSec,
  });
  return {
    decision: "pending",
    scorePct,
    attemptDurationSec,
    autoReviewedAt,
    message: `Waiting for human review. Score: ${(scorePct * 100).toFixed(0)}%.`,
  };
}

export function calculateStyleCredits(
  scorePct: number,
  difficulty: string
): number {
  const baseCredits: Record<string, number> = {
    low: 10,
    medium: 25,
    high: 50,
    extreme: 100,
  };
  
  const base = baseCredits[difficulty] || 10;
  return Math.floor(base * scorePct);
}

export function calculateIntelligenceGain(
  scorePct: number,
  difficulty: string
): number {
  const baseGain: Record<string, number> = {
    low: 5,
    medium: 10,
    high: 20,
    extreme: 40,
  };
  
  const base = baseGain[difficulty] || 5;
  return Math.floor(base * scorePct);
}
