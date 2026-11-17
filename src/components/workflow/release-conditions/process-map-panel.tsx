"use client";

import { useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { type DomainNode } from "@/types/workflow";
import {
  conditionText,
  departmentBoardHeading,
  processStepName,
} from "@/lib/release-conditions-workspace-model";
import type { ProcessSelection } from "./use-process-selection";

/** Process map strip above the Department board; collapsible on phones. */
export function ProcessMapPanel({
  chapters,
  selection: {
    processMap,
    selectProcessLocation,
    selectedProcessChapter,
    selectedProcessCondition,
    selectedProcessConditionIndex,
    selectedProcessLocation,
    selectedProcessNodeId,
    selectedProcessStepId,
  },
}: {
  chapters: DomainNode[];
  selection: ProcessSelection;
}) {
  const [mobileProcessMapOpen, setMobileProcessMapOpen] = useState(false);
  return (
    <section
      aria-label="Process map"
      data-mobile-process-map-open={mobileProcessMapOpen}
      className="shrink-0 border-b bg-muted/10"
    >
      <button
        type="button"
        data-mobile-process-map-toggle
        aria-expanded={mobileProcessMapOpen}
        onClick={() => setMobileProcessMapOpen((open) => !open)}
        className="flex min-h-10 w-full items-center justify-between px-3 text-xs font-semibold text-muted-foreground lg:hidden"
      >
        Process map <span>{mobileProcessMapOpen ? "Hide ▲" : "Show ▼"}</span>
      </button>
      <div
        data-mobile-process-map-content
        className={mobileProcessMapOpen ? "block" : "hidden lg:block"}
      >
        <div className="scroll-thin overflow-x-auto px-3 py-2.5 lg:px-5">
          {processMap.groups.length ? (
            <div className="flex min-w-max items-stretch gap-2">
              {processMap.groups.map((group, groupIndex) => {
                const kindLabel = group.skipped
                  ? "SKIPPED · FOB YARD"
                  : group.kind === "start"
                    ? "START"
                    : group.kind === "end"
                      ? "FINISH"
                      : group.kind === "primaryGate"
                        ? "GATE"
                        : group.kind === "unlinked"
                          ? "UNLINKED"
                          : "PHASE";
                return (
                  <div key={group.id} className="flex items-stretch gap-2">
                    <div
                      data-fob-yard-skipped={group.skipped ? "true" : undefined}
                      className={`w-[210px] shrink-0 overflow-hidden rounded-lg border bg-background shadow-xs ${group.skipped ? "opacity-45 grayscale" : ""}`}
                      style={{ borderColor: `${group.color}66` }}
                    >
                      <button
                        type="button"
                        aria-pressed={selectedProcessStepId === group.id && !selectedProcessNodeId}
                        onClick={() => selectProcessLocation(null, null, group.id)}
                        className={`flex w-full flex-col items-start border-l-[3px] px-2.5 py-2 text-left transition ${selectedProcessStepId === group.id && !selectedProcessNodeId ? "process-selection-glow" : "hover:bg-muted/50"}`}
                        style={{ borderLeftColor: group.color }}
                      >
                        <span
                          className="text-[8px] font-black uppercase tracking-[0.13em]"
                          style={{ color: group.color }}
                        >
                          {kindLabel}
                        </span>
                        <span
                          className="mt-0.5 w-full whitespace-normal break-words text-[11px] font-bold leading-4"
                          title={processStepName(group)}
                        >
                          {processStepName(group)}
                        </span>
                      </button>
                      <div className="space-y-1 border-t p-1.5">
                        {group.chapters.length ? (
                          group.chapters.map((chapter) => {
                            const heading = departmentBoardHeading(chapter);
                            const isSelected =
                              selectedProcessNodeId === chapter.id &&
                              selectedProcessStepId === group.id;
                            return (
                              <button
                                key={chapter.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  selectProcessLocation(chapter.id, null, group.id, true)
                                }
                                className={`flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-left transition ${isSelected ? "process-selection-glow" : "hover:border-primary/55 hover:bg-primary/[0.04]"}`}
                                style={{
                                  borderColor: isSelected ? undefined : `${group.color}55`,
                                  backgroundColor: isSelected ? undefined : `${group.color}0d`,
                                }}
                              >
                                <span className="min-w-0">
                                  <span
                                    className="block truncate text-[10px] font-semibold"
                                    title={heading.department}
                                  >
                                    {heading.department}
                                  </span>
                                  <span
                                    className="block truncate text-[8px] text-muted-foreground"
                                    title={heading.chapter}
                                  >
                                    {heading.chapter}
                                  </span>
                                </span>
                                {chapter.conditions.length ? (
                                  <span className="shrink-0 rounded-md bg-background/80 px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground">
                                    {chapter.conditions.length} RC
                                  </span>
                                ) : null}
                              </button>
                            );
                          })
                        ) : (
                          <p className="px-1 py-2 text-center text-[9px] text-muted-foreground">
                            No linked departments
                          </p>
                        )}
                      </div>
                    </div>
                    {groupIndex < processMap.groups.length - 1 ? (
                      <ArrowRight
                        aria-hidden
                        className="mt-8 size-4 shrink-0 self-start text-muted-foreground/60"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-dashed bg-background px-3 py-2 text-[10px] text-muted-foreground">
              Add process phases and link Departments to show their locations here.
            </p>
          )}
        </div>
        {selectedProcessNodeId || selectedProcessStepId ? (
          <div
            aria-live="polite"
            className="flex min-h-10 items-center gap-2 border-t bg-primary/[0.035] px-3 py-2 lg:px-5"
          >
            <MapPin className="size-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-[10px] leading-4">
              <span className="mr-1.5 font-bold uppercase tracking-wide text-primary">
                Process location
              </span>
              {selectedProcessChapter && selectedProcessLocation ? (
                (() => {
                  const heading = departmentBoardHeading(selectedProcessChapter);
                  const processGroups = processMap.groups.filter(
                    (group) => group.kind !== "unlinked",
                  );
                  const stepIndex = processGroups.findIndex(
                    (group) => group.id === selectedProcessLocation.group.id,
                  );
                  const group = selectedProcessLocation.group;
                  const locationLabel =
                    group.kind === "unlinked"
                      ? "Not linked to an L1 process step"
                      : `Step ${stepIndex + 1} of ${processGroups.length} · ${processStepName(group)}`;
                  const conditionIndex = selectedProcessCondition
                    ? selectedProcessConditionIndex
                    : -1;
                  const selectedConditionLabel =
                    conditionIndex >= 0 && selectedProcessCondition
                      ? conditionText(selectedProcessCondition, conditionIndex)
                      : "";
                  return (
                    <>
                      <span className="font-semibold text-foreground">{locationLabel}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-semibold text-foreground">
                        {heading.department} · {heading.chapter}
                      </span>
                      {selectedConditionLabel ? (
                        <>
                          <span className="text-muted-foreground"> · Form / RC: </span>
                          <span className="font-medium text-foreground">
                            {selectedConditionLabel}
                          </span>
                        </>
                      ) : null}
                    </>
                  );
                })()
              ) : selectedProcessStepId ? (
                (() => {
                  const group = processMap.groups.find((item) => item.id === selectedProcessStepId);
                  const processGroups = processMap.groups.filter(
                    (item) => item.kind !== "unlinked",
                  );
                  const stepIndex = processGroups.findIndex(
                    (item) => item.id === selectedProcessStepId,
                  );
                  return group ? (
                    <span className="font-semibold text-foreground">
                      {group.kind === "unlinked"
                        ? group.title
                        : `Step ${stepIndex + 1} of ${processGroups.length} · ${processStepName(group)}`}{" "}
                      · Select a Department to see its forms
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Select a department or form to see its process position.
                    </span>
                  );
                })()
              ) : (
                <span className="text-muted-foreground">
                  Select a department or form to see its process position.
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
