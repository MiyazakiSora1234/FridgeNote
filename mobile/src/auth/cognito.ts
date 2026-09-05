import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import { config } from "../config";

const userPool = new CognitoUserPool({
  UserPoolId: config.cognitoUserPoolId,
  ClientId: config.cognitoUserPoolClientId,
});

function getSession(user: CognitoUser): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) reject(err ?? new Error("no session"));
      else resolve(session);
    });
  });
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, [], [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool });
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const user = new CognitoUser({ Username: email, Pool: userPool });
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

export function signOut(): void {
  const user = userPool.getCurrentUser();
  user?.signOut();
}

/**
 * 現在有効なID Tokenを取得する。期限切れが近ければ自動的にリフレッシュする
 * (CognitoUserSession#getSessionが内部でRefreshTokenを使って更新する)。
 * ログイン中でなければnullを返す。
 */
export async function getCurrentIdToken(): Promise<string | null> {
  const user = userPool.getCurrentUser();
  if (!user) return null;
  try {
    const session = await getSession(user);
    if (!session.isValid()) return null;
    return session.getIdToken().getJwtToken();
  } catch {
    return null;
  }
}

export function getCurrentUserEmail(): string | null {
  return userPool.getCurrentUser()?.getUsername() ?? null;
}
