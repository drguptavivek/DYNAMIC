import assert from "node:assert/strict";
import test from "node:test";
import { applyTranslationsToFormJson, flattenFormElements, mergeMissingFormTranslations } from "./formLanguage";

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
        elements: [
          {
            type: "dropdown",
            name: "q1",
            title: { default: "Question one" },
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
      choices: [{ value: "98", text: "Don't know" }],
    },
  ]);
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
