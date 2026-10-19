import React from "react";
import { Text } from "react-native";
import * as Application from "expo-application";
import appConfig from "../../app.json";

export function AppVersionLabel({ style }) {
  return <Text style={style}>Version {Application.nativeApplicationVersion || appConfig.expo.version}</Text>;
}
