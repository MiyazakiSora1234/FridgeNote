import React from "react";
import { ActivityIndicator, View } from "react-native";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../auth/AuthContext";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { FridgeListScreen } from "../screens/FridgeListScreen";
import { AddItemManualScreen } from "../screens/AddItemManualScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { AnalysisResultScreen } from "../screens/AnalysisResultScreen";
import { colors } from "../theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.primary },
};

export function RootNavigator() {
  const { isLoading, isSignedIn } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
        }}
      >
        {isSignedIn ? (
          <>
            <Stack.Screen name="FridgeList" component={FridgeListScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddItemManual" component={AddItemManualScreen} options={{ title: "食材を登録" }} />
            <Stack.Screen
              name="Camera"
              component={CameraScreen}
              options={{ headerTransparent: true, headerTitle: "", headerTintColor: "#fff" }}
            />
            <Stack.Screen
              name="AnalysisResult"
              component={AnalysisResultScreen}
              options={{ title: "解析結果", headerBackVisible: false }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: "新規登録" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
