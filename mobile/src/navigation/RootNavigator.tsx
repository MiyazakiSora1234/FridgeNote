import React from "react";
import { ActivityIndicator, View } from "react-native";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../auth/AuthContext";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { FridgeListScreen } from "../screens/FridgeListScreen";
import { AddMenuScreen } from "../screens/AddMenuScreen";
import { ConsumeMenuScreen } from "../screens/ConsumeMenuScreen";
import { AddItemManualScreen } from "../screens/AddItemManualScreen";
import { ConsumeManualScreen } from "../screens/ConsumeManualScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { AnalysisResultScreen } from "../screens/AnalysisResultScreen";
import { VoiceRecordScreen } from "../screens/VoiceRecordScreen";
import { VoiceConfirmScreen } from "../screens/VoiceConfirmScreen";
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
            <Stack.Screen name="AddMenu" component={AddMenuScreen} options={{ title: "追加する" }} />
            <Stack.Screen name="ConsumeMenu" component={ConsumeMenuScreen} options={{ title: "減らす" }} />
            <Stack.Screen name="AddItemManual" component={AddItemManualScreen} options={{ title: "食材を登録" }} />
            <Stack.Screen name="ConsumeManual" component={ConsumeManualScreen} options={{ title: "手動で減らす" }} />
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
            <Stack.Screen name="VoiceRecord" component={VoiceRecordScreen} options={{ title: "音声で追加" }} />
            <Stack.Screen
              name="VoiceConfirm"
              component={VoiceConfirmScreen}
              options={{ title: "認識結果の確認", headerBackVisible: false }}
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
