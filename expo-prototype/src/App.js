import "survey-core/survey-core.min.css";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { surveyLocalization } from "survey-core";

import { formCatalog } from "./data/formCatalog";
import { HouseholdModule } from "./modules/households/HouseholdModule";
import { QuestionnaireDashboard } from "./modules/questionnaires/QuestionnaireDashboard";
import { ROUTES, navigateTo, parseHashRoute } from "./navigation/routes";

surveyLocalization.supportedLocales = ["default", "hi"];

const HOUSEHOLDS_VIEW = "households";
const QUESTIONNAIRE_VIEW = "questionnaire";
const DEFAULT_FORM_CODE = formCatalog[0]?.form_code;

function getCurrentRoute() {
  if (typeof window === "undefined") {
    return { view: "home", formCode: DEFAULT_FORM_CODE, mode: "dashboard" };
  }
  return parseHashRoute(window.location.hash, DEFAULT_FORM_CODE);
}

export default function App() {
  const [route, setRoute] = useState(getCurrentRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const [locale, setLocale] = useState("default");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onHashChange = () => {
      setRoute(getCurrentRoute());
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.appShell}>
        {menuOpen && (
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => setMenuOpen(false)}
            style={styles.scrim}
          />
        )}

        <View style={[styles.drawer, menuOpen && styles.drawerOpen]}>
          <View style={styles.drawerHeader}>
            <Text style={styles.appTitle}>DYNAMIC</Text>
            <Pressable
              accessibilityLabel="Close menu"
              onPress={() => setMenuOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>x</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => navigateTo(ROUTES.households)}
            style={[
              styles.menuItem,
              route.view === HOUSEHOLDS_VIEW && styles.activeMenuItem
            ]}
          >
            <Text
              style={[
                styles.menuItemText,
                route.view === HOUSEHOLDS_VIEW && styles.activeMenuItemText
              ]}
            >
              Households
            </Text>
          </Pressable>
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionLabel}>Questionnaires</Text>
            {formCatalog.map((form) => {
              const active =
                route.view === QUESTIONNAIRE_VIEW && route.formCode === form.form_code;
              return (
                <Pressable
                  key={form.form_code}
                  onPress={() => navigateTo(ROUTES.questionnaire(form.form_code))}
                  style={[styles.menuItem, active && styles.activeMenuItem]}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      active && styles.activeMenuItemText
                    ]}
                  >
                    {form.form_code} · {form.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Open menu"
              onPress={() => setMenuOpen(true)}
              style={styles.menuButton}
            >
              <Text style={styles.menuButtonText}>☰</Text>
            </Pressable>
            <View>
              <Text style={styles.appTitle}>DYNAMIC Forms</Text>
              <Text style={styles.subtle}>Offline Expo prototype</Text>
            </View>
          </View>

          {route.view === "home" ? (
            <View style={styles.homeCanvas} />
          ) : route.view === HOUSEHOLDS_VIEW ? (
            <HouseholdModule
              locale={locale}
              mode={route.mode}
              onLocaleChange={setLocale}
            />
          ) : (
            <QuestionnaireDashboard
              formCode={route.formCode}
              locale={locale}
              mode={route.mode}
              onLocaleChange={setLocale}
            />
          )}
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
  appShell: {
    flex: 1,
    minHeight: "100vh",
    backgroundColor: "#eef2f5"
  },
  main: {
    flex: 1,
    minHeight: "100vh"
  },
  topBar: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4"
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff"
  },
  menuButtonText: {
    fontSize: 24,
    lineHeight: 26,
    color: "#18202a",
    fontWeight: "700"
  },
  scrim: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    zIndex: 10
  },
  drawer: {
    position: "fixed",
    top: 0,
    bottom: 0,
    left: -300,
    width: 300,
    padding: 18,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#d8dee4",
    zIndex: 11,
    gap: 14
  },
  drawerOpen: {
    left: 0
  },
  drawerHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6
  },
  closeButtonText: {
    fontSize: 24,
    color: "#334155"
  },
  menuItem: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff"
  },
  activeMenuItem: {
    backgroundColor: "#0f172a"
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#18202a"
  },
  activeMenuItemText: {
    color: "#ffffff"
  },
  menuSection: {
    gap: 8
  },
  menuSectionLabel: {
    marginTop: 8,
    paddingHorizontal: 4,
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: "800",
    color: "#667085"
  },
  homeCanvas: {
    flex: 1,
    minHeight: "calc(100vh - 76px)",
    backgroundColor: "#eef2f5"
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#18202a"
  },
  subtle: {
    fontSize: 13,
    color: "#667085"
  }
});
