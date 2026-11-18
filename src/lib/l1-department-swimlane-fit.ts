import { PDF_SCHEDULE_LABEL_WIDTH } from "@/lib/process-gantt-pdf";
import type { salesHandoffTime } from "@/lib/process-schedule";
import type {
  DepartmentColumn,
  PhaseColumn,
  ganttCoverage,
} from "@/lib/l1-department-swimlane-model";

export type SwimlaneFitContext = {
  options: { gantt?: boolean };
  aligned: boolean;
  canvasWidth: number;
  columns: DepartmentColumn[];
  coverage: ReturnType<typeof ganttCoverage> | undefined;
  gap: number;
  handoff: ReturnType<typeof salesHandoffTime>;
  phases: PhaseColumn[];
};

/**
 * Adjusts the rendered swimlane before it is rasterized: fits the sheet's
 * 17:11 aspect, aligns phase and department colours with the Gantt axis,
 * and places Gantt bar labels so they never wrap.
 */
export function fitSwimlaneLayout(
  container: HTMLElement,
  { options, aligned, canvasWidth, columns, coverage, gap, handoff, phases }: SwimlaneFitContext,
) {
  // Expand the layout itself to the sheet aspect ratio before rasterizing.
  // This uses spare paper width without stretching the text or task bars.
  if (options.gantt) {
    const sheetWidth = Math.max(canvasWidth, Math.ceil((container.offsetHeight * 17) / 11));
    container.style.width = `${sheetWidth}px`;
  }
  const targetHeight = (container.offsetWidth * 11) / 17;
  if (options.gantt && container.offsetHeight > targetHeight) {
    const rows = container.querySelectorAll(".pdf-gantt .gantt-row").length;
    const excessPerRow = rows ? (container.offsetHeight - targetHeight) / rows : 0;
    const rowHeight = Math.max(20, 21 - excessPerRow);
    const compactRows = document.createElement("style");
    compactRows.textContent = `
      .pdf-gantt .gantt-row:not([data-pdf-gantt-task]),.pdf-gantt .gantt-track{min-height:${rowHeight}px}
      .pdf-gantt .gantt-label{padding:2px 9px}
      .pdf-gantt .gantt-department{padding:4px 10px}
      .pdf-gantt .gantt-bar,.pdf-gantt .gantt-pause-segment{height:${Math.max(26, rowHeight - 1)}px}
    `;
    container.appendChild(compactRows);
  }
  const initialHeight = container.offsetHeight;
  const textScale = Math.min(1.2, Math.max(1, Math.sqrt(targetHeight / initialHeight)));
  if (textScale > 1.01) {
    const adaptiveType = document.createElement("style");
    adaptiveType.textContent = `
      .phase-title{font-size:${21 * textScale}px}
      .department-label{font-size:${20 * textScale}px}
      .department-document-item,.department-document-item strong{font-size:${11 * textScale}px}
      .gantt-department-card .department-document-item,.gantt-department-card .department-document-item strong{font-size:${16 * textScale}px}
      .gantt-label{font-size:${22 * textScale}px}
      .gantt-department{font-size:${14 * textScale}px}
      .gantt-axis span{font-size:${22 * textScale}px}
      .gantt-bar-text{font-size:${19 * textScale}px}
      .evidence-line{font-size:${8 * textScale}px}
    `;
    container.appendChild(adaptiveType);
  }
  if (container.offsetHeight < targetHeight && options.gantt && handoff.hasSalesDepartment) {
    const ganttRows = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".pdf-gantt .gantt-row, .pdf-gantt .gantt-department",
      ),
    );
    const perRow = ganttRows.length
      ? (targetHeight - container.offsetHeight) / ganttRows.length
      : 0;
    ganttRows.forEach((row) => {
      row.style.minHeight = `${row.offsetHeight + perRow}px`;
    });
  } else if (container.offsetHeight < targetHeight) {
    const phaseRow = container.querySelector<HTMLElement>(".phase-row");
    const departmentGrid = container.querySelector<HTMLElement>(".department-grid");
    const ganttRows = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".pdf-gantt .gantt-row, .pdf-gantt .gantt-department",
      ),
    );
    const evidenceRows = Array.from(container.querySelectorAll<HTMLElement>(".evidence-card"));
    const remaining = targetHeight - container.offsetHeight;
    const phaseShare = remaining * 0.16;
    const departmentShare = remaining * 0.19;
    if (phaseRow) {
      const height = phaseRow.offsetHeight + phaseShare;
      phaseRow.querySelectorAll<HTMLElement>(".phase-card").forEach((card) => {
        card.style.minHeight = `${height}px`;
      });
    }
    if (departmentGrid) {
      const height = departmentGrid.offsetHeight + departmentShare;
      departmentGrid.querySelectorAll<HTMLElement>(".department-card").forEach((card) => {
        card.style.minHeight = `${height}px`;
      });
    }
    const detailRows = options.gantt ? ganttRows : evidenceRows;
    const detailShare = remaining - phaseShare - departmentShare;
    if (detailRows.length) {
      const perRow = options.gantt ? detailShare / detailRows.length : detailShare;
      detailRows.forEach((row) => {
        row.style.minHeight = `${row.offsetHeight + perRow}px`;
      });
    } else if (departmentGrid) {
      departmentGrid.querySelectorAll<HTMLElement>(".department-card").forEach((card) => {
        card.style.minHeight = `${card.offsetHeight + detailShare}px`;
      });
    }
  }
  const alignTimeline = () => {
    if (aligned) {
      const { total, ranges, cards } = coverage!;
      const axis = container.querySelector<HTMLElement>(".gantt-axis")!.getBoundingClientRect();
      const x = (day: number) => axis.left + (day / total) * axis.width;
      const activeRanges = ranges.filter((range) => range.end > range.start);
      const scheduleEnd = Math.max(...ranges.map((range) => range.end));
      const trailing = Math.max(0, total - scheduleEnd);
      // The last cards stretch to the axis end, so their color lines must too.
      const shownEnd = (end: number) => (end >= scheduleEnd ? total : end);
      const extendLastToAxisEnd = (widths: number[]) =>
        widths
          .map(
            (width, index) =>
              `${width + (index === widths.length - 1 ? (trailing / total) * axis.width : 0)}px`,
          )
          .join(" ");
      container.querySelector<HTMLElement>(".phase-row")!.style.gridTemplateColumns =
        extendLastToAxisEnd(
          activeRanges.map((range) => ((range.end - range.start) / total) * axis.width),
        );
      container.querySelector<HTMLElement>(".department-grid")!.style.gridTemplateColumns =
        extendLastToAxisEnd(cards.map((card) => ((card.end - card.start) / total) * axis.width));
      container.querySelector<HTMLElement>(".phase-ribbon")!.style.background =
        `linear-gradient(90deg, ${phases
          .flatMap((phase, index) => {
            const range = ranges[index];
            return range.end > range.start
              ? [
                  `${phase.color} ${(range.start / total) * 100}% ${(shownEnd(range.end) / total) * 100}%`,
                ]
              : [];
          })
          .join(", ")})`;
      // Project each card's color strips onto the same global
      // axis. Task starts never enter this calculation, so parallel work keeps
      // the original single-row department presentation.
      container.querySelectorAll<HTMLElement>(".department-card").forEach((card) => {
        const start = Number(card.dataset.coverageStart);
        const end = Number(card.dataset.coverageEnd);
        card.querySelectorAll<HTMLElement>(".phase-segment").forEach((segment) => {
          const index = Number(segment.dataset.phaseIndex);
          const range = ranges[index];
          const from = Math.max(start, range.start);
          const to = Math.min(shownEnd(end), shownEnd(range.end));
          if (to <= from) {
            segment.style.display = "none";
            return;
          }
          const strip = segment.parentElement!.getBoundingClientRect();
          segment.style.left = `${x(from) - strip.left}px`;
          segment.style.width = `${x(to) - x(from)}px`;
        });
      });
    } else {
      // Both rows share physical color boundaries. A department shared by two
      // phases places their boundary halfway between its two color segments.
      const phaseRow = container.querySelector<HTMLElement>(".phase-row")!;
      const rowBounds = phaseRow.getBoundingClientRect();
      const segments = Array.from(container.querySelectorAll<HTMLElement>(".phase-segment"));
      const boundaries = [0];
      for (let index = 0; index < phases.length - 1; index += 1) {
        const current = segments.filter((segment) => Number(segment.dataset.phaseIndex) === index);
        const next = segments.filter((segment) => Number(segment.dataset.phaseIndex) === index + 1);
        const end = current.length
          ? Math.max(...current.map((segment) => segment.getBoundingClientRect().right))
          : undefined;
        const start = next.length
          ? Math.min(...next.map((segment) => segment.getBoundingClientRect().left))
          : undefined;
        const boundary =
          end !== undefined && start !== undefined
            ? (end + start) / 2 - rowBounds.left
            : (rowBounds.width * (index + 1)) / phases.length;
        boundaries.push(
          Math.max(
            boundaries[index] + 1,
            Math.min(rowBounds.width - (phases.length - index - 1), boundary),
          ),
        );
      }
      boundaries.push(rowBounds.width);
      phaseRow.style.gridTemplateColumns = phases
        .map((_, index) => `${boundaries[index + 1] - boundaries[index]}px`)
        .join(" ");
      container.querySelector<HTMLElement>(".phase-ribbon")!.style.background =
        `linear-gradient(90deg, ${phases
          .map(
            (phase, index) =>
              `${phase.color} ${(boundaries[index] / rowBounds.width) * 100}% ${(boundaries[index + 1] / rowBounds.width) * 100}%`,
          )
          .join(", ")})`;
    }
    // Pin involvement to the upper-right corner and keep the complete duration
    // on one line, including in html-to-image's fixed-size snapshot.
    const phaseMetadata = Array.from(container.querySelectorAll<HTMLElement>(".phase-meta"));
    phaseMetadata.forEach((meta) => {
      meta.style.minHeight = "";
      meta.style.paddingTop = "";
      const label = meta.querySelector<HTMLElement>(".phase-involvement")!;
      label.style.fontSize = "12px";
      const available = meta.clientWidth;
      if (label.scrollWidth > available)
        label.style.fontSize = `${((12 * available) / label.scrollWidth) * 0.96}px`;
      if (meta.children[0].getBoundingClientRect().right + 8 > label.getBoundingClientRect().left) {
        meta.style.paddingTop = `${label.getBoundingClientRect().height + 4}px`;
      }
      const duration = meta.parentElement!.querySelector<HTMLElement>(".phase-duration-main");
      if (duration) {
        const numbers = duration.querySelectorAll<HTMLElement>(".phase-duration-number");
        const units = duration.querySelectorAll<HTMLElement>(".phase-duration-unit");
        numbers.forEach((number) => {
          number.style.fontSize = "26px";
        });
        units.forEach((unit) => {
          unit.style.fontSize = "11px";
        });
        let scale = 1;
        for (let attempt = 0; attempt < 4 && duration.scrollWidth > available; attempt += 1) {
          scale *= (available / duration.scrollWidth) * 0.96;
          numbers.forEach((number) => {
            number.style.fontSize = `${26 * scale}px`;
          });
          units.forEach((unit) => {
            unit.style.fontSize = `${11 * scale}px`;
          });
        }
      }
    });
    const metadataHeight = Math.max(
      ...phaseMetadata.map((meta) => meta.getBoundingClientRect().height),
    );
    phaseMetadata.forEach((meta) => {
      meta.style.minHeight = `${metadataHeight}px`;
    });
    if (options.gantt) {
      const handoffLine = container
        .querySelector<HTMLElement>(".gantt-day-one-line")
        ?.getBoundingClientRect();
      if (handoffLine)
        container.querySelectorAll<HTMLElement>(".gantt-task-label").forEach((label) => {
          // The Sales-lead interval contains no colored task bars. Use that
          // available space for full, single-line condition names, stopping
          // early if this particular task begins before the handoff line.
          const barLeft = label
            .closest(".gantt-row")
            ?.querySelector<HTMLElement>(".gantt-bar")
            ?.getBoundingClientRect().left;
          const rightEdge = Math.min(handoffLine.left, barLeft ?? Infinity);
          label.style.width = `${Math.max(PDF_SCHEDULE_LABEL_WIDTH, rightEdge - label.getBoundingClientRect().left - 4)}px`;
        });
    }
  };
  alignTimeline();
  if (options.gantt) {
    const grid = container.querySelector<HTMLElement>(".department-grid");
    const cards = Array.from(grid?.querySelectorAll<HTMLElement>(".gantt-department-card") || []);
    if (grid && cards.length) {
      // Measure each card at its natural width before the shared grid row
      // stretches it, so only wide cards split long document lists.
      grid.style.alignItems = "start";
      cards.forEach((card) => {
        card.style.minHeight = "";
      });
      const widest = Math.max(...cards.map((card) => card.offsetWidth));
      cards.forEach((card) => {
        const legalList = card.querySelector<HTMLElement>("[data-department-documents] ul");
        const itemCount = legalList?.children.length || 0;
        const originalWidth =
          card === cards.at(-1) && aligned
            ? ((coverage!.cards.at(-1)!.end - coverage!.cards.at(-1)!.start) / coverage!.total) *
              container.querySelector<HTMLElement>(".gantt-axis")!.offsetWidth
            : card.offsetWidth;
        if (
          !legalList ||
          itemCount < 5 ||
          legalList.offsetWidth < 210 ||
          originalWidth < widest * 0.78
        )
          return;
        // Real lists side by side, not CSS columns: the PNG snapshot pins the
        // list height, and a CSS column that no longer fits spills sideways
        // over Customer Information. Two columns keep more rows per list.
        const items = Array.from(legalList.children);
        const perColumn = Math.ceil(items.length / 2);
        const columns = document.createElement("div");
        columns.className = "department-document-columns";
        legalList.replaceWith(columns);
        for (let index = 0; index < items.length; index += perColumn) {
          const list = document.createElement("ul");
          items.slice(index, index + perColumn).forEach((item) => list.appendChild(item));
          columns.appendChild(list);
        }
      });
      grid.style.alignItems = "stretch";
    }
  }
  // Titles wrap between words; a card too narrow for its longest word shrinks the title.
  container.querySelectorAll<HTMLElement>(".department-label").forEach((label) => {
    for (
      let size = Number.parseFloat(getComputedStyle(label).fontSize);
      size > 11 && label.scrollWidth > label.clientWidth + 1;
      size -= 1
    ) {
      label.style.fontSize = `${size - 1}px`;
    }
  });
  const salesLead = container.querySelector<HTMLElement>(".gantt-sales-lead");
  if (salesLead && salesLead.scrollWidth > salesLead.clientWidth + 1) {
    // Too narrow for one line: use up to two lines at the largest size that
    // fits, and let the axis row grow before the sheet is fitted to 11x17.
    salesLead.style.whiteSpace = "normal";
    for (let size = 19; size > 10; size -= 1) {
      salesLead.style.fontSize = `${size}px`;
      if (
        salesLead.scrollWidth <= salesLead.clientWidth + 1 &&
        salesLead.offsetHeight <= size * 1.15 * 2 + 1
      )
        break;
    }
    const axis = salesLead.parentElement!;
    axis.style.minHeight = `${Math.max(axis.offsetHeight, salesLead.offsetHeight + 6)}px`;
  }
  if (options.gantt) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const desiredHeight = (container.offsetWidth * 11) / 17;
      const currentHeight = container.offsetHeight;
      if (Math.abs(currentHeight - desiredHeight) <= 2) break;
      if (currentHeight > desiredHeight) {
        container.style.width = `${Math.ceil((currentHeight * 17) / 11)}px`;
      } else {
        const rows = Array.from(
          container.querySelectorAll<HTMLElement>(
            ".pdf-gantt .gantt-row, .pdf-gantt .gantt-department",
          ),
        );
        const extra = rows.length ? (desiredHeight - currentHeight) / rows.length : 0;
        rows.forEach((row) => {
          row.style.minHeight = `${row.offsetHeight + extra}px`;
        });
      }
      alignTimeline();
    }
  }
  // The production note is pinned to the card bottom so the card keeps its
  // height; the duration moves up by the note's height instead.
  container
    .querySelectorAll<HTMLElement>(
      "[data-phase-actual-production-time],[data-phase-factory-production]",
    )
    .forEach((note) => {
      const duration = note.parentElement!.querySelector<HTMLElement>(".phase-duration");
      if (duration) duration.style.transform = `translateY(-${note.offsetHeight}px)`;
    });
  // Labels stay on the same line as their bars: after the bar when it fits,
  // otherwise before the task's first segment. A label that fits on neither
  // side shrinks onto the roomier side instead of wrapping to a second line.
  container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-bar-text").forEach((text) => {
    const trackElement = text.parentElement!;
    const track = trackElement.getBoundingClientRect();
    if (text.getBoundingClientRect().right <= track.right - 2) return;
    const segments = Array.from(
      trackElement.querySelectorAll<HTMLElement>(".gantt-bar,.gantt-pause-segment"),
    );
    const taskLeft =
      Math.min(...segments.map((segment) => segment.getBoundingClientRect().left)) - track.left;
    const taskRight =
      Math.max(...segments.map((segment) => segment.getBoundingClientRect().right)) - track.left;
    const gap = 6;
    const spaceBefore = taskLeft - gap - 2;
    const spaceAfter = track.width - taskRight - gap - 2;
    const before = spaceBefore >= text.offsetWidth || spaceBefore >= spaceAfter;
    const space = Math.max(0, before ? spaceBefore : spaceAfter);
    if (text.offsetWidth > space && text.offsetWidth > 0) {
      const scale = Math.max(0.45, space / text.offsetWidth);
      text.style.transformOrigin = before ? "right center" : "left center";
      text.style.transform = `scale(${scale})`;
    }
    text.style.marginLeft = "0";
    if (before) {
      text.style.left = "auto";
      text.style.right = `${track.width - taskLeft + gap}px`;
    } else {
      text.style.left = `${taskRight + gap}px`;
    }
  });
  container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-title").forEach((title) => {
    // Keep condition names on one line even when the lead interval is short.
    // Only titles that need it shrink; the task rows retain one height.
    for (let attempt = 0; attempt < 3 && title.scrollWidth > title.clientWidth + 1; attempt += 1) {
      const size = Number.parseFloat(getComputedStyle(title).fontSize);
      title.style.fontSize = `${Math.max(12, ((size * title.clientWidth) / title.scrollWidth) * 0.97)}px`;
    }
  });
}
