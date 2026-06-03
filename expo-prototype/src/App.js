import "survey-core/survey-core.min.css";
import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Survey } from "survey-react-ui";
import { Model, surveyLocalization } from "survey-core";

import { FormSelector } from "./components/FormSelector";
import { LanguageToggle } from "./components/LanguageToggle";
import { formCatalog, formsByCode } from "./data/formCatalog";
import { prepareSurveyJson } from "./lib/prepareSurveyJson";

surveyLocalization.supportedLocales = ["default", "hi"];

const HHQ_CODE = "HHQ";
const HH_MEMBER_PANEL = "hhq_household_members";
const GPS_FIELD_NAMES = new Set([
  "hhq_gps_latitude",
  "hhq_gps_longitude",
  "hhq_gps_altitude_m"
]);
const MEMBER_NAME_LABEL_FIELDS = new Set([
  "member_relationship_to_head",
  "member_sex",
  "member_residence_duration",
  "member_age_years",
  "member_marital_status",
  "member_birth_registration_status",
  "member_ever_attended_school",
  "member_highest_grade_completed"
]);

function isWomanQuestionnaireEligible(member) {
  return (
    Number(member?.member_sex) === 2 &&
    Number(member?.member_age_years) >= 18 &&
    Number(member?.member_age_years) <= 49 &&
    Number(member?.member_marital_status) !== 7
  );
}

function updateHouseholdListingCalculations(model) {
  const members = model.getValue(HH_MEMBER_PANEL) || [];
  const normalizedMembers = members.map((member, index) => ({
    ...member,
    member_line_number: index + 1,
    member_woman_questionnaire_eligible: isWomanQuestionnaireEligible(member) ? 1 : 2
  }));

  if (JSON.stringify(members) !== JSON.stringify(normalizedMembers)) {
    model.setValue(HH_MEMBER_PANEL, normalizedMembers);
  }

  model.setValue("hhq_total_household_members", normalizedMembers.length || undefined);
  model.setValue("hhq_total_household_members_end_summary", normalizedMembers.length || undefined);
  model.setValue(
    "hhq_total_eligible_women",
    normalizedMembers.filter(isWomanQuestionnaireEligible).length
  );
  model.setValue(
    "hhq_total_eligible_women_end_summary",
    normalizedMembers.filter(isWomanQuestionnaireEligible).length
  );
}

function refreshQuestionTitles(model) {
  model.getAllQuestions().forEach((question) => {
    question.locTitle?.strChanged?.();
  });
}

function getPanelMemberName(question) {
  return question?.parent?.data?.member_name || "";
}

function italicizeMemberNameInTitle(options) {
  if (!MEMBER_NAME_LABEL_FIELDS.has(options.question.name)) return;
  const memberName = getPanelMemberName(options.question);
  if (!memberName) return;

  const title = options.htmlElement.querySelector(".sd-question__title");
  if (!title || title.dataset.dynamicNameItalicized === memberName) return;

  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const index = node.textContent.indexOf(memberName);
    if (index >= 0) {
      const before = node.textContent.slice(0, index);
      const after = node.textContent.slice(index + memberName.length);
      const italic = document.createElement("i");
      italic.textContent = memberName;
      node.replaceWith(
        document.createTextNode(before),
        italic,
        document.createTextNode(after)
      );
      title.dataset.dynamicNameItalicized = memberName;
      return;
    }
    node = walker.nextNode();
  }
}

function italicizeTextInElement(element, text) {
  if (!element || !text) return;
  if (element.querySelector("i")?.textContent === text) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.tagName === "I") return NodeFilter.FILTER_REJECT;
      return node.textContent.includes(text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    }
  });
  const node = walker.nextNode();
  if (!node) return;

  const index = node.textContent.indexOf(text);
  const before = node.textContent.slice(0, index);
  const after = node.textContent.slice(index + text.length);
  const italic = document.createElement("i");
  italic.textContent = text;
  node.replaceWith(
    document.createTextNode(before),
    italic,
    document.createTextNode(after)
  );
}

function italicizeVisibleMemberNames(model) {
  const members = model.getValue(HH_MEMBER_PANEL) || [];
  const names = members.map((member) => member?.member_name).filter(Boolean);
  if (!names.length) return;

  document.querySelectorAll(".sd-question__title").forEach((title) => {
    names.forEach((name) => italicizeTextInElement(title, name));
  });
}

function attachFormBehaviors(model, selectedForm) {
  if (selectedForm?.form_code !== HHQ_CODE) return;

  model.onAfterRenderSurvey.add((sender) => updateHouseholdListingCalculations(sender));
  model.onAfterRenderQuestion.add((sender, options) => {
    italicizeMemberNameInTitle(options);
    if (options.question.name !== "hhq_gps_latitude") return;
    if (options.htmlElement.querySelector("[data-dynamic-gps-capture]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.dynamicGpsCapture = "true";
    button.textContent = "Capture GPS";
    button.style.marginTop = "12px";
    button.style.padding = "10px 14px";
    button.style.border = "0";
    button.style.borderRadius = "6px";
    button.style.background = "#1f6feb";
    button.style.color = "#ffffff";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";

    const status = document.createElement("div");
    status.style.marginTop = "8px";
    status.style.color = "#667085";
    status.style.fontSize = "13px";

    button.addEventListener("click", () => {
      if (!navigator?.geolocation) {
        status.textContent = "GPS is not available on this device/browser.";
        return;
      }
      status.textContent = "Capturing GPS...";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, altitude } = position.coords;
          sender.setValue("hhq_gps_latitude", Number(latitude.toFixed(7)));
          sender.setValue("hhq_gps_longitude", Number(longitude.toFixed(7)));
          if (altitude !== null && altitude !== undefined) {
            sender.setValue("hhq_gps_altitude_m", Number(altitude.toFixed(1)));
          }
          status.textContent = "GPS captured from device.";
        },
        (error) => {
          status.textContent = `GPS capture failed: ${error.message}`;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    options.htmlElement.appendChild(button);
    options.htmlElement.appendChild(status);
  });
  model.onDynamicPanelAdded.add((sender, options) => {
    if (options?.question?.name === HH_MEMBER_PANEL) {
      updateHouseholdListingCalculations(sender);
    }
  });
  model.onDynamicPanelRemoved.add((sender, options) => {
    if (options?.question?.name === HH_MEMBER_PANEL) {
      updateHouseholdListingCalculations(sender);
    }
  });
  model.onValueChanged.add((sender, options) => {
    if (GPS_FIELD_NAMES.has(options.name) && !options.value) return;
    if (options.name === "member_name" || options.name === HH_MEMBER_PANEL) {
      refreshQuestionTitles(sender);
      setTimeout(() => italicizeVisibleMemberNames(sender), 0);
    }
    if (
      options.name === HH_MEMBER_PANEL ||
      options.name?.startsWith("member_")
    ) {
      updateHouseholdListingCalculations(sender);
    }
  });
}

export default function App() {
  const [selectedCode, setSelectedCode] = useState(formCatalog[0]?.form_code);
  const [locale, setLocale] = useState("default");
  const selectedForm = formsByCode[selectedCode];

  const survey = useMemo(() => {
    if (!selectedForm) return null;
    const model = new Model(prepareSurveyJson(selectedForm));
    model.locale = locale;
    model.showCompletedPage = false;
    attachFormBehaviors(model, selectedForm);
    return model;
  }, [selectedForm, locale]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.sidebar}>
          <Text style={styles.appTitle}>DYNAMIC Forms</Text>
          <Text style={styles.subtle}>Offline Expo prototype</Text>
          <LanguageToggle locale={locale} onChange={setLocale} />
          <FormSelector
            forms={formCatalog}
            selectedCode={selectedCode}
            onSelect={setSelectedCode}
          />
        </View>
        <View style={styles.content}>
          {selectedForm && (
            <View style={styles.header}>
              <Text style={styles.formCode}>{selectedForm.form_code}</Text>
              <View>
                <Text style={styles.formTitle}>
                  {selectedForm.title?.[locale] || selectedForm.title?.default}
                </Text>
                <Text style={styles.subtle}>Version {selectedForm.version}</Text>
              </View>
            </View>
          )}
          <View style={styles.surveyFrame}>
            {survey ? <Survey model={survey} /> : <Text>No form selected.</Text>}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#eef2f5"
  },
  shell: {
    flex: 1,
    flexDirection: "row",
    minHeight: "100vh"
  },
  sidebar: {
    width: 320,
    padding: 20,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#d8dee4",
    gap: 14
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#18202a"
  },
  subtle: {
    fontSize: 13,
    color: "#667085"
  },
  content: {
    flex: 1,
    padding: 22,
    gap: 16
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    padding: 16
  },
  formCode: {
    minWidth: 52,
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#1f6feb",
    color: "#ffffff",
    fontWeight: "700"
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#18202a"
  },
  surveyFrame: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    padding: 12,
    overflow: "auto"
  }
});
