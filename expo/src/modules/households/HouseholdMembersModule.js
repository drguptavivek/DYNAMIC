import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  getHousehold,
  listHouseholdMembers,
  searchHouseholdMembers,
} from "./householdRepository.js";
import { ROUTES, navigateTo } from "../../navigation/routes.js";

const PAGE_SIZE = 50;

export function HouseholdMembersModule({ householdId = "", selectedLocalityCode }) {
  const [members, setMembers] = useState([]);
  const [household, setHousehold] = useState(null);
  const [search, setSearch] = useState("");
  const [sex, setSex] = useState("");
  const [page, setPage] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => {
    setPage(0);
  }, [householdId, selectedLocalityCode, search, sex]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (householdId) {
        const [householdRow, rows] = await Promise.all([
          getHousehold(householdId),
          listHouseholdMembers(householdId),
        ]);
        if (!active) return;
        const filtered = rows
          .filter((member) => !sex || String(member.sex) === String(sex))
          .filter((member) => !search || String(member.member_name || "").toLowerCase().includes(search.toLowerCase()));
        setHousehold(householdRow);
        setHasNextPage(filtered.length > (page + 1) * PAGE_SIZE);
        setMembers(filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
        return;
      }

      const rows = await searchHouseholdMembers({
        localityCode: selectedLocalityCode,
        name: search,
        sex,
        limit: PAGE_SIZE + 1,
        offset: page * PAGE_SIZE,
      });
      if (!active) return;
      setHousehold(null);
      setHasNextPage(rows.length > PAGE_SIZE);
      setMembers(rows.slice(0, PAGE_SIZE));
    }
    load();
    return () => {
      active = false;
    };
  }, [householdId, selectedLocalityCode, search, sex, page]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Household Members</Text>
          <Text style={styles.subtle}>
            {householdId
              ? `${householdId}${household?.address ? ` · ${household.address}` : ""}`
              : "Offline searchable household roster"}
          </Text>
        </View>
        {householdId ? (
          <Pressable style={styles.secondaryButton} onPress={() => navigateTo(ROUTES.householdMembers)}>
            <Text style={styles.secondaryButtonText}>All Members</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search member name"
          style={styles.search}
        />
        <View style={styles.sexFilterGroup}>
          {[
            ["", "Any sex"],
            ["1", "Male"],
            ["2", "Female"],
          ].map(([value, label]) => (
            <Pressable
              key={value || "any"}
              onPress={() => setSex(value)}
              style={[styles.sexFilterButton, sex === value && styles.sexFilterButtonActive]}
            >
              <Text style={[styles.sexFilterButtonText, sex === value && styles.sexFilterButtonTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.paginationBar}>
          <Text style={styles.paginationTitle}>Members</Text>
          <View style={styles.paginationActions}>
            <Text style={styles.paginationPage}>{`Page ${page + 1}`}</Text>
            <Pressable
              disabled={page === 0}
              onPress={() => setPage((current) => Math.max(0, current - 1))}
              style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
            >
              <Text style={[styles.pageButtonText, page === 0 && styles.pageButtonTextDisabled]}>Previous</Text>
            </Pressable>
            <Pressable
              disabled={!hasNextPage}
              onPress={() => setPage((current) => current + 1)}
              style={[styles.pageButton, !hasNextPage && styles.pageButtonDisabled]}
            >
              <Text style={[styles.pageButtonText, !hasNextPage && styles.pageButtonTextDisabled]}>Next</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.tableContent}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.memberCell]} numberOfLines={1}>Member</Text>
              <Text style={[styles.cell, styles.hhCell]} numberOfLines={1}>HH ID</Text>
              <Text style={[styles.cell, styles.metaCell]} numberOfLines={1}>Age / sex</Text>
              <Text style={[styles.cell, styles.relationCell]} numberOfLines={2}>Relation to HOH</Text>
              <Text style={[styles.cell, styles.statusCell]} numberOfLines={1}>Status</Text>
            </View>
            <ScrollView style={styles.rows}>
              {members.map((member) => (
                <View key={member.individual_id} style={styles.row}>
                  <Text style={[styles.cell, styles.memberCell]} numberOfLines={2}>
                    {member.member_name || member.individual_id}
                  </Text>
                  <Pressable
                    style={[styles.cellPressable, styles.hhCell]}
                    onPress={() => navigateTo(ROUTES.householdMembersForHousehold(member.household_id))}
                  >
                    <Text style={styles.linkText} numberOfLines={1} selectable>
                      {member.household_id}
                    </Text>
                  </Pressable>
                  <Text style={[styles.cell, styles.metaCell]} numberOfLines={1}>
                    {`${member.age_years ?? "-"} / ${formatSex(member.sex)}`}
                  </Text>
                  <Text style={[styles.cell, styles.relationCell]} numberOfLines={2}>
                    {formatRelationship(member.relationship_to_head)}
                  </Text>
                  <Text style={[styles.cell, styles.statusCell]} numberOfLines={2}>
                    {formatMemberStatus(member)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function formatSex(sex) {
  if (Number(sex) === 1) return "Male";
  if (Number(sex) === 2) return "Female";
  return "Other";
}

function formatRelationship(value) {
  if (Number(value) === 1) return "Self / HOH";
  if (Number(value) === 2) return "Spouse";
  if (Number(value) === 3) return "Parent";
  if (Number(value) === 4) return "Child";
  if (Number(value) === 5) return "Sibling";
  return "Other";
}

function formatMemberStatus(member) {
  if (Number(member.relationship_to_head) === 1) return "Household head";
  if (Number(member.woman_questionnaire_eligible) === 1) return "WQ eligible";
  return "Active member";
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 14,
    padding: 22,
    minHeight: "calc(100vh - 76px)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#18202a",
  },
  subtle: {
    fontSize: 13,
    color: "#667085",
  },
  filters: {
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  search: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#ffffff",
  },
  sexFilterGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sexFilterButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  sexFilterButtonActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#eef6ff",
  },
  sexFilterButtonText: {
    fontSize: 13,
    color: "#475467",
    fontWeight: "700",
  },
  sexFilterButtonTextActive: {
    color: "#1f6feb",
  },
  table: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  tableContent: {
    minWidth: 820,
  },
  rows: {
    maxHeight: 420,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: "#eef2f5",
  },
  headerRow: {
    minHeight: 42,
    borderTopWidth: 0,
    backgroundColor: "#f8fafc",
  },
  cell: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#18202a",
  },
  cellPressable: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  memberCell: {
    width: 220,
    fontWeight: "800",
  },
  hhCell: {
    width: 170,
  },
  metaCell: {
    width: 120,
  },
  relationCell: {
    width: 155,
  },
  statusCell: {
    width: 155,
    fontWeight: "700",
  },
  linkText: {
    fontSize: 13,
    color: "#1f6feb",
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#18202a",
    fontWeight: "700",
  },
  paginationBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f5",
    backgroundColor: "#ffffff",
  },
  paginationTitle: {
    fontSize: 14,
    color: "#18202a",
    fontWeight: "800",
  },
  paginationActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  paginationPage: {
    fontSize: 13,
    color: "#667085",
    fontWeight: "800",
  },
  pageButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  pageButtonDisabled: {
    backgroundColor: "#f8fafc",
  },
  pageButtonText: {
    fontSize: 13,
    color: "#1f6feb",
    fontWeight: "800",
  },
  pageButtonTextDisabled: {
    color: "#98a2b3",
  },
});
