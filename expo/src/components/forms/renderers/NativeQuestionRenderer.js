/** Dispatches a supported Survey Core question to its exact native renderer with no fallback. */
import React from "react";

import { getNativeRendererKind } from "../nativeSurveyModel.js";
import { areQuestionRendererPropsEqual } from "../questionRenderMemo.js";

import { CalculateRenderer } from "./CalculateRenderer.js";
import { CameraRenderer } from "./CameraRenderer.js";
import { DateRenderer } from "./DateRenderer.js";
import { DbCheckRenderer } from "./DbCheckRenderer.js";
import { DisplayRenderer } from "./DisplayRenderer.js";
import { DynamicPanelRenderer } from "./DynamicPanelRenderer.js";
import { FilePickerRenderer } from "./FilePickerRenderer.js";
import { GpsRenderer } from "./GpsRenderer.js";
import { GroupedCodedSingleSelectRenderer } from "./GroupedCodedSingleSelectRenderer.js";
import { HouseholdMemberDropdownRenderer } from "./HouseholdMemberDropdownRenderer.js";
import { InstructionRenderer } from "./InstructionRenderer.js";
import { MultipleTextRenderer } from "./MultipleTextRenderer.js";
import { NoteRenderer } from "./NoteRenderer.js";
import { NumberRenderer } from "./NumberRenderer.js";
import { SelectManyRenderer } from "./SelectManyRenderer.js";
import { SelectOneRenderer } from "./SelectOneRenderer.js";
import { TextRenderer } from "./TextRenderer.js";
import { WqBornAliveChildFollowupsRenderer } from "./WqBornAliveChildFollowupsRenderer.js";
import { WqPregnancyGapReviewRenderer } from "./WqPregnancyGapReviewRenderer.js";
import { WqPregnancyHistoryConfirmationRenderer } from "./WqPregnancyHistoryConfirmationRenderer.js";
import { WqPregnancyOutcomeReviewRenderer } from "./WqPregnancyOutcomeReviewRenderer.js";
import { WqReproductionComparisonRenderer } from "./WqReproductionComparisonRenderer.js";
import { WqLmpTimingRenderer } from "./WqLmpTimingRenderer.js";
import { WqPregnancySinceLastRenderer } from "./WqPregnancySinceLastRenderer.js";

function NativeQuestionRendererBase({
  answerData,
  locale,
  question,
  onChange,
  onRequestTopLevelFocus,
  renderQuestion,
}) {
  const renderer = getNativeRendererKind(question);
  const props = { answerData, locale, question, onChange };
  switch (renderer) {
    case "calculate": return <CalculateRenderer {...props} />;
    case "camera": return <CameraRenderer {...props} />;
    case "date": return <DateRenderer {...props} />;
    case "db-check": return <DbCheckRenderer {...props} />;
    case "display": return <DisplayRenderer {...props} />;
    case "dynamic-panel": return (
      <DynamicPanelRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
        renderQuestion={renderQuestion}
      />
    );
    case "file-picker": return <FilePickerRenderer {...props} />;
    case "gps": return <GpsRenderer {...props} />;
    case "grouped-coded-single-select": return <GroupedCodedSingleSelectRenderer {...props} />;
    case "household-member-dropdown": return <HouseholdMemberDropdownRenderer {...props} />;
    case "instruction": return <InstructionRenderer {...props} />;
    case "multiple-text": return <MultipleTextRenderer {...props} />;
    case "note": return <NoteRenderer {...props} />;
    case "number": return <NumberRenderer {...props} />;
    case "select-many": return <SelectManyRenderer {...props} />;
    case "select-one": return <SelectOneRenderer {...props} />;
    case "text": return <TextRenderer {...props} />;
    case "wq-pregnancy-gap-review": return (
      <WqPregnancyGapReviewRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
      />
    );
    case "wq-pregnancy-history-confirmation": return (
      <WqPregnancyHistoryConfirmationRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
      />
    );
    case "wq-pregnancy-outcome-review": return <WqPregnancyOutcomeReviewRenderer {...props} />;
    case "wq-reproduction-comparison": return (
      <WqReproductionComparisonRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
      />
    );
    case "wq-lmp-timing": return <WqLmpTimingRenderer {...props} />;
    case "wq-born-alive-child-followups": return (
      <WqBornAliveChildFollowupsRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
        renderQuestion={renderQuestion}
      />
    );
    case "wq-pregnancy-since-last": return <WqPregnancySinceLastRenderer {...props} />;
    default: throw new Error(`Native renderer registry returned unknown renderer: ${renderer}`);
  }
}

export const NativeQuestionRenderer = React.memo(NativeQuestionRendererBase, areQuestionRendererPropsEqual);
