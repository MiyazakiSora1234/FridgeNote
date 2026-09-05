import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../auth/AuthContext";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { FridgeListScreen } from "../screens/FridgeListScreen";
import { AddItemManualScreen } from "../screens/AddItemManualScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { AnalysisResultScreen } from "../screens/AnalysisResultScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isLoading, isSignedIn } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isSignedIn ? (
          <>
            <Stack.Screen name="FridgeList" component={FridgeListScreen} options={{ title: "冷蔵庫" }} />
            <Stack.Screen name="AddItemManual" component={AddItemManualScreen} options={{ title: "食材を登録" }} />
            <Stack.Screen name="Camera" component={CameraScreen} options={{ title: "撮影" }} />
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
