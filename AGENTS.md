For Python scripts that create or edit `.docx`/OOXML files, Excel workbooks, PDFs, ODF files, RTF/HTML/Markdown text, YAML/TOML, JSON files, or PowerPoint files, use:

```bash
/Users/vivekgupta/.codex/.venv/bin/python
```

This environment has `python-docx`, `docx2txt`, `openpyxl`, `lxml`, ODF tooling (`odfpy`, `odfdo`), PDF tooling (`pypdf`, `pdfplumber`, `pdfminer.six`, `PyMuPDF`), HTML/text tooling (`beautifulsoup4`, `html2text`, `markdownify`, `striprtf`), YAML/TOML tooling (`PyYAML`, `ruamel.yaml`, `tomlkit`, `tomli-w`), JSON support from the standard library, and `python-pptx` installed.

External document tools available on PATH include `pandoc`, `soffice`, Poppler tools (`pdfinfo`, `pdftotext`, `pdftoppm`), `exiftool`, `textutil`, `unzip`, and `file`.

## DYNAMIC PreTSING project rules

Before changing questionnaire JSON, Expo app routing, calculated fields, IDs, or flow logic, read and follow:

- `Refs/FLOW.md`
- `Refs/Unique_Ids.md`
- `Refs/pretsing forms/forms_summary table_v2026.05.17.pdf`
- the specific source questionnaire PDF in `Refs/pretsing forms/`

Key constraints:

- The forms summary table is the operational reference for form order, respondent, timing, mode, purpose, and downstream flow.
- The PDF `Variable ID` is the canonical question code. Preserve it in `sourceCode`; use form-prefixed analysis-safe codes only where globally unique answer keys are needed.
- Sites first map the area and list all structures/households. Baseline HHQ validates and enrolls households from that mapped frame; it must not create arbitrary new households.
- Future visits are allowed only for households enrolled at baseline. A household empty/vacant/not occupied at baseline remains out even if later occupied.
- If an enrolled household splits, keep the original household number and `household_id`. Do not create a new household number and do not create a split event. Use non-analytic household/individual notes only if field context is needed.
- Core person linkage is: `site_id + locality_code + structure_map_id + household_number = household_id`; `household_id + member_number = household_member_id/person_id`.
- Household member number is read-only auto-increment within the household listing.
- Eligibility is derived from household member data and valid later member additions: Woman questionnaire, pregnancy tracking, pregnancy events, outcome events, and child follow-up all link back to the household member/person.
- Households are closed after baseline, but existing enrolled households may gain usual-resident members through valid in-migration, marriage-in, or birth. Recalculate eligibility after valid additions.
- Temporary visitors are not captured as household members in the current PDFs. Women temporarily visiting a natal/maternal household for pregnancy care, delivery, or postpartum stay must not be added to the roster or made eligible from that household.
- Notes fields are free-text field context only. Do not use notes for analysis, skip logic, eligibility, routing, or cohort definition.
- Stillbirth and child death trigger verbal autopsy 30 days after the stillbirth/death event.
- Planned household survey start is 1 September 2026. Enrollment is planned for 2.5 years, followed by 1.5 years of outcome follow-up.

Questionnaire editing rules:

- Do a question-by-question PDF comparison for each form before changing JSON.
- Do not mix labels, instructions, hints, validation, and choices.
- Question labels should contain only the question text.
- Instructions, probes, skip notes, auto-fill notes, and measurement hints belong in `description`, metadata, validation, or app logic, not in `choices`.
- Numeric boxes in the PDF should be numeric/text inputs, not radio choices.
- `RECORD ALL` / `ANSWER UP TO` fields should be checkboxes unless the PDF defines a single coded response.
- Auto-filled fields should be read-only and have explicit calculation/source metadata.
- After JSON changes, copy the maintained JSON into `expo-prototype/src/data/forms/`, rebuild `outputs/pretsing-form-json/all_forms.json`, run `npm test` in `expo-prototype`, and use the in-app browser to verify visible rendering when the change affects UI.
