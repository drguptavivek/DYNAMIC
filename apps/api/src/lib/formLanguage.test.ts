import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTranslationsToFormJson,
  flattenFormElements,
  mergeMissingFormTranslations,
  reconcileFormTranslations,
} from "./formLanguage";

test("applies question and option translations as SurveyJS localized text", () => {
  const formJson = {
    pages: [
      {
        name: "page_1",
        elements: [
          {
            type: "radiogroup",
            name: "water_source",
            title: "Main source of drinking water",
            choices: [
              { value: 11, text: "Piped into dwelling" },
              { value: 12, text: "Piped to yard" },
            ],
          },
        ],
      },
    ],
  };

  const translated = applyTranslationsToFormJson(formJson, "hi", {
    water_source: {
      title: "Hindi water source",
      choices: {
        "11": "Hindi piped dwelling",
      },
    },
  });

  const question = (translated.pages as any[])[0].elements[0];
  assert.deepEqual(question.title, {
    default: "Main source of drinking water",
    hi: "Hindi water source",
  });
  assert.deepEqual(question.choices[0].text, {
    default: "Piped into dwelling",
    hi: "Hindi piped dwelling",
  });
  assert.equal(question.choices[1].text, "Piped to yard");
});

test("flattens form elements with option values for the admin editor", () => {
  const elements = flattenFormElements({
    pages: [
      {
        name: "page_1",
        title: "Section 1",
        elements: [
          {
            type: "dropdown",
            name: "q1",
            title: { default: "Question one" },
            sourceCode: "1",
            order: 1,
            section_order: 1,
            choices: [{ value: 98, text: "Don't know" }],
          },
        ],
      },
    ],
  });

  assert.deepEqual(elements, [
    {
      name: "q1",
      type: "dropdown",
      title: "Question one",
      description: "",
      page_name: "page_1",
      page_title: "Section 1",
      source_code: "1",
      order: 1,
      section_order: 1,
      choices: [{ value: "98", text: "Don't know" }],
    },
  ]);
});

test("flattens nested form elements without exporting pages as questions", () => {
  const elements = flattenFormElements({
    pages: [
      {
        name: "page_household",
        title: "Household Schedule",
        elements: [
          {
            type: "panel",
            name: "member_panel",
            title: "Member panel",
            elements: [
              {
                type: "text",
                name: "member_name",
                title: "Member name",
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(
    elements.map((element) => element.name),
    ["member_panel", "member_name"],
  );
  assert.equal(elements[0].page_title, "Household Schedule");
  assert.equal(elements[1].page_name, "page_household");
});

test("merges bundled translations into database translations without overwriting edits", () => {
  const result = mergeMissingFormTranslations(
    {
      q1: {
        title: "Edited Hindi question",
        choices: {
          "1": "Edited option",
        },
      },
    },
    {
      q1: {
        title: "Bundled Hindi question",
        description: "Bundled help",
        choices: {
          "1": "Bundled option",
          "2": "Bundled option two",
        },
      },
      q2: {
        title: "Bundled second question",
      },
    },
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.translations, {
    q1: {
      title: "Edited Hindi question",
      description: "Bundled help",
      choices: {
        "1": "Edited option",
        "2": "Bundled option two",
      },
    },
    q2: {
      title: "Bundled second question",
    },
  });
});

test("reconciles translations against the latest questionnaire fields and options", () => {
  const result = reconcileFormTranslations(
    {
      retained: { title: "Edited question", choices: { "1": "One", "9": "Removed choice" } },
      removed: { title: "Removed question" },
    },
    {
      retained: { title: "Bundled question", choices: { "1": "Bundled one", "2": "Bundled two" } },
      added: { title: "New bundled question" },
    },
    [
      { name: "retained", title: "Retained", description: "", choices: [{ value: "1", text: "One" }, { value: "2", text: "Two" }] },
      { name: "added", title: "Added", description: "", choices: [] },
    ],
  );

  assert.equal(result.changed, true);
  assert.deepEqual(result.translations, {
    retained: { title: "Edited question", choices: { "1": "One", "2": "Bundled two" } },
    added: { title: "New bundled question" },
  });
});
