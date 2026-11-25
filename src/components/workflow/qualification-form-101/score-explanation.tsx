"use client";

import { useId, type ReactNode } from "react";
import {
  FORM_101_MAX_SCORE,
  FORM_101_OPTIONAL_MAX_SCORE,
  FORM_101_REQUIRED_MAX_SCORE,
  type QualificationForm101Evaluation,
} from "@/lib/qualification-form-101";

export function ScoreExplanation({
  score,
  children,
  className,
  targetClassName,
  align = "left",
}: {
  score: QualificationForm101Evaluation;
  children: ReactNode;
  className?: string;
  targetClassName?: string;
  align?: "left" | "right";
}) {
  const tooltipId = useId();
  const stage = score.scoreStage;

  return (
    <span className={`group/score relative inline-flex ${className ?? ""}`}>
      <span tabIndex={0} aria-describedby={tooltipId} className={targetClassName}>
        {children}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className={`invisible absolute top-full z-50 mt-1 w-64 rounded-lg border bg-popover p-3 text-left text-xs leading-relaxed text-popover-foreground shadow-lg group-hover/score:visible group-focus-within/score:visible ${align === "right" ? "right-0" : "left-0"}`}
      >
        <strong className="block">
          {stage.label} · {stage.min}–{stage.max} points
        </strong>
        <span className="mt-1 block">
          Required {score.requiredScore}/{FORM_101_REQUIRED_MAX_SCORE} · Optional{" "}
          {score.optionalScore}/{FORM_101_OPTIONAL_MAX_SCORE}
        </span>
        <span className="mt-1 block">{stage.description}</span>
        {stage.max < FORM_101_MAX_SCORE && (
          <span className="mt-1 block">
            {stage.max + 1 - score.totalScore} more points to reach the next stage.
          </span>
        )}
      </span>
    </span>
  );
}
