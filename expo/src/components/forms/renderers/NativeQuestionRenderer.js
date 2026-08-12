/** Dispatches a supported Survey Core question to its exact native renderer with no fallback. */
import React from "react";

import { getNativeRendererKind } from "../nativeSurveyModel.js";

import { CalculateRenderer } from "./CalculateRenderer.js";
import { CameraRenderer } from "./CameraRenderer.js";
import { DateRenderer } from "./DateRenderer.js";
import { DbCheckRenderer } from "./DbCheckRenderer.js";
import { DisplayRenderer } from "./DisplayRenderer.js";
import { DynamicPanelRenderer } from "./DynamicPanelRenderer.js";
import { FilePickerRenderer } from "./FilePickerRenderer.js";
import { GpsRenderer } from "./GpsRenderer.js";
import { GroupedCodedSingleSelectRenderer } from "./GroupedCodedSingleSelectRenderer.js";
import { InstructionRenderer } from "./InstructionRenderer.js";
import { MultipleTextRenderer } from "./MultipleTextRenderer.js";
import { NoteRenderer } from "./NoteRenderer.js";
import { NumberRenderer } from "./NumberRenderer.js";
import { SelectManyRenderer } from "./SelectManyRenderer.js";
import { SelectOneRenderer } from "./SelectOneRenderer.js";
import { TextRenderer } from "./TextRenderer.js";

function NativeQuestionRendererBase({ answerData, locale, question, onChange, renderQuestion }) {
  const renderer = getNativeRendererKind(question);
  const props = { answerData, locale, question, onChange };
  switch (renderer) {
    case "calculate": return <CalculateRenderer {...props} />;
    case "camera": return <CameraRenderer {...props} />;
    case "date": return <DateRenderer {...props} />;
    case "db-check": return <DbCheckRenderer {...props} />;
    case "display": return <DisplayRenderer {...props} />;
    case "dynamic-panel": return <DynamicPanelRenderer {...props} renderQuestion={renderQuestion} />;
    case "file-picker": return <FilePickerRenderer {...props} />;
    case "gps": return <GpsRenderer {...props} />;
    case "grouped-coded-single-select": return <GroupedCodedSingleSelectRenderer {...props} />;
    case "instruction": return <InstructionRenderer {...props} />;
    case "multiple-text": return <MultipleTextRenderer {...props} />;
    case "note": return <NoteRenderer {...props} />;
    case "number": return <NumberRenderer {...props} />;
    case "select-many": return <SelectManyRenderer {...props} />;
    case "select-one": return <SelectOneRenderer {...props} />;
    case "text": return <TextRenderer {...props} />;
    default: throw new Error(`Native renderer registry returned unknown renderer: ${renderer}`);
  }
}

export const NativeQuestionRenderer = React.memo(NativeQuestionRendererBase, areQuestionRendererPropsEqual);

function areQuestionRendererPropsEqual(previous, next) {
  return (
    previous.answerData === next.answerData &&
    previous.locale === next.locale &&
    previous.question === next.question &&
    previous.onChange === next.onChange &&
    previous.renderQuestion === next.renderQuestion &&
    previous.renderRevision === next.renderRevision
  );
}
