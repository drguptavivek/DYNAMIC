/** Dispatches a supported Survey Core question to its exact native renderer with no fallback. */
import React from "react";
import { View } from "react-native";

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
  let rendered;
  switch (renderer) {
    case "calculate": rendered = <CalculateRenderer {...props} />; break;
    case "camera": rendered = <CameraRenderer {...props} />; break;
    case "date": rendered = <DateRenderer {...props} />; break;
    case "db-check": rendered = <DbCheckRenderer {...props} />; break;
    case "display": rendered = <DisplayRenderer {...props} />; break;
    case "dynamic-panel": rendered = (
        <DynamicPanelRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
        renderQuestion={renderQuestion}
      />
    ); break;
    case "file-picker": rendered = <FilePickerRenderer {...props} />; break;
    case "gps": rendered = <GpsRenderer {...props} />; break;
    case "grouped-coded-single-select": rendered = <GroupedCodedSingleSelectRenderer {...props} />; break;
    case "household-member-dropdown": rendered = <HouseholdMemberDropdownRenderer {...props} />; break;
    case "instruction": rendered = <InstructionRenderer {...props} />; break;
    case "multiple-text": rendered = <MultipleTextRenderer {...props} />; break;
    case "note": rendered = <NoteRenderer {...props} />; break;
    case "number": rendered = <NumberRenderer {...props} />; break;
    case "select-many": rendered = <SelectManyRenderer {...props} />; break;
    case "select-one": rendered = <SelectOneRenderer {...props} />; break;
    case "text": rendered = <TextRenderer {...props} />; break;
    case "wq-pregnancy-gap-review": rendered = (
        <WqPregnancyGapReviewRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
      />
    ); break;
    case "wq-pregnancy-history-confirmation": rendered = (
        <WqPregnancyHistoryConfirmationRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
      />
    ); break;
    case "wq-pregnancy-outcome-review": rendered = <WqPregnancyOutcomeReviewRenderer {...props} />; break;
    case "wq-reproduction-comparison": rendered = (
        <WqReproductionComparisonRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
      />
    ); break;
    case "wq-lmp-timing": rendered = <WqLmpTimingRenderer {...props} />; break;
    case "wq-born-alive-child-followups": rendered = (
        <WqBornAliveChildFollowupsRenderer
        {...props}
        onRequestTopLevelFocus={onRequestTopLevelFocus}
        renderQuestion={renderQuestion}
      />
    ); break;
    case "wq-pregnancy-since-last": rendered = <WqPregnancySinceLastRenderer {...props} />; break;
    default: throw new Error(`Native renderer registry returned unknown renderer: ${renderer}`);
  }

  // React Native keyboard focus can resize/cover the bottom of the viewport.
  // Capture focus at the question boundary so every input renderer and every
  // form gets the same scroll-to-question behavior.
  let focusTarget = question?.name;
  let ancestor = question?.parent;
  while (ancestor) {
    const ancestorType = ancestor.getType?.() || ancestor.type;
    if (ancestorType === "paneldynamic" && ancestor.name) {
      focusTarget = ancestor.name;
      break;
    }
    ancestor = ancestor.parent;
  }
  return (
    <View onFocus={() => onRequestTopLevelFocus?.(focusTarget)}>
      {rendered}
    </View>
  );
}

export const NativeQuestionRenderer = React.memo(NativeQuestionRendererBase, areQuestionRendererPropsEqual);
