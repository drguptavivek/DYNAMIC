import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";

import { LanguageToggle } from "../../components/LanguageToggle";
import { formsByCode } from "../../data/formCatalog";
import { prepareSurveyJson } from "../../lib/prepareSurveyJson";
import { attachHouseholdSurveyBehaviors } from "../../lib/householdSurveyBehaviors";
import { ROUTES, navigateTo } from "../../navigation/routes";
import {
  extractHouseholdRegistryFields,
  formatSite,
  initializeHouseholdRepository,
  listHouseholds,
  saveHousehold
} from "./householdRepository";

const HHQ_CODE = "HHQ";

export function HouseholdModule({ locale, mode, onLocaleChange }) {
  const [households, setHouseholds] = useState([]);
  const [search, setSearch] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const hhqForm = formsByCode[HHQ_CODE];
  const showForm = mode === "new";

  const refreshHouseholds = async () => {
    await initializeHouseholdRepository();
    setHouseholds(await listHouseholds());
  };

  useEffect(() => {
    refreshHouseholds();
  }, []);

  const filteredHouseholds = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return households;
    return households.filter((household) =>
      [
        household.household_id,
        household.locality_code,
        household.locality_name,
        household.structure_number,
        household.household_number,
        household.address,
        household.household_head_name,
        household.consent_status,
        household.mobile_number,
        household.interview_date
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [households, search]);

  const survey = useMemo(() => {
    if (!showForm || !hhqForm) return null;
    const model = new Model(prepareSurveyJson(hhqForm));
    model.locale = locale;
    model.showCompletedPage = false;
    attachHouseholdSurveyBehaviors(model, hhqForm, async (hhqData) => {
      const registryRecord = extractHouseholdRegistryFields(hhqData);
      await saveHousehold(registryRecord);
      await refreshHouseholds();
      setSaveMessage(`Saved household ${registryRecord.household_id}`);
      navigateTo(ROUTES.households);
    });
    return model;
  }, [showForm, hhqForm, locale]);

  if (showForm) {
    return (
      <View style={styles.formWindow}>
        <View style={styles.formWindowHeader}>
          <View>
            <Text style={styles.formWindowTitle}>Baseline Household Questionnaire</Text>
            <Text style={styles.subtle}>New household</Text>
          </View>
          <View style={styles.formActions}>
            <LanguageToggle locale={locale} onChange={onLocaleChange} />
            <Pressable onPress={() => navigateTo(ROUTES.households)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.formWindowBody}>
          {survey ? <Survey model={survey} /> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <View>
          <Text style={styles.title}>Households</Text>
          <Text style={styles.subtle}>Key indexed fields from Baseline HHQ</Text>
        </View>
        <View style={styles.toolbarActions}>
          <Pressable onPress={() => navigateTo(ROUTES.householdNew)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add Household</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by HH ID, hamlet, structure, address, head, or consent"
          style={styles.search}
        />
        {saveMessage ? <Text style={styles.saveMessage}>{saveMessage}</Text> : null}
      </View>

      <View style={styles.table}>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.cell, styles.hhCell]}>Structure + HH</Text>
          <Text style={[styles.cell, styles.localityCell]}>Hamlet / village / colony</Text>
          <Text style={[styles.cell, styles.addressCell]}>Address</Text>
          <Text style={[styles.cell, styles.headCell]}>Household head</Text>
          <Text style={[styles.cell, styles.consentCell]}>Consent</Text>
        </View>
        <ScrollView style={styles.rows}>
          {filteredHouseholds.map((household) => (
            <View key={household.household_id} style={styles.row}>
              <Text style={[styles.cell, styles.hhCell]}>
                {household.structure_number}-{household.household_number}
              </Text>
              <Text style={[styles.cell, styles.localityCell]}>
                {formatSite(household.site_id)} · {household.locality_name || household.locality_code}
              </Text>
              <Text style={[styles.cell, styles.addressCell]}>{household.address}</Text>
              <Text style={[styles.cell, styles.headCell]}>{household.household_head_name}</Text>
              <Text style={[styles.cell, styles.consentCell]}>{household.consent_status}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 14,
    padding: 22,
    minHeight: "calc(100vh - 76px)"
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#18202a"
  },
  subtle: {
    fontSize: 13,
    color: "#667085"
  },
  panel: {
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  search: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#ffffff"
  },
  saveMessage: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "700"
  },
  table: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  rows: {
    maxHeight: 280
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: "#eef2f5"
  },
  headerRow: {
    minHeight: 42,
    borderTopWidth: 0,
    backgroundColor: "#f8fafc"
  },
  cell: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#18202a"
  },
  hhCell: {
    width: 150,
    fontWeight: "800"
  },
  localityCell: {
    width: 230
  },
  addressCell: {
    flex: 1
  },
  headCell: {
    width: 190
  },
  consentCell: {
    width: 100,
    fontWeight: "700"
  },
  primaryButton: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#1f6feb"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  secondaryButtonText: {
    color: "#18202a",
    fontWeight: "700"
  },
  formWindow: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: "#eef2f5"
  },
  formWindowHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 22,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4"
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  formWindowTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#18202a"
  },
  formWindowBody: {
    flex: 1,
    margin: 18,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    padding: 12,
    overflow: "auto"
  }
});
