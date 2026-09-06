import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import { config } from "../config";
import { cognitoStorage, hydrateCognitoStorage } from "./tokenStorage";

export { hydrateCognitoStorage };

const userPool = new CognitoUserPool({
  UserPoolId: config.cognitoUserPoolId,
  ClientId: config.cognitoUserPoolClientId,
  Storage: cognitoStorage,
});

/**
 * amazon-cognito-identity-js の CognitoUser は `Storage` を渡さない限り
 * Pool側のStorage設定を引き継がず独自にデフォルト実装へフォールバックしてしまうため、
 * CognitoUserを生成する箇所では必ずここを経由して明示的に同じStorageを渡す。
 */
function newCognitoUser(email: string): CognitoUser {
  return new CognitoUser({ Username: email, Pool: userPool, Storage: cognitoStorage });
}

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
  const user = newCognitoUser(email);
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const user = newCognitoUser(email);
  const authDetails = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

/**
 * ローカルのセッション破棄に加え、Cognitoの GlobalSignOut API でサーバー側の
 * Refresh Tokenも失効させる(以前はローカル破棄のみで、端末に残ったRefresh Token自体は
 * 有効期限(30日、infra/cognito.tf)まで生き続けていた)。
 * globalSignOutはベストエフォート: オフライン等で失敗しても、ユーザーが
 * 「サインアウトできない」状態になる方が体験として悪いため、ローカルの破棄は必ず行う。
 */
export async function signOut(): Promise<void> {
  const user = userPool.getCurrentUser();
  if (!user) return;
  try {
    await getSession(user); // globalSignOutにはsignInUserSession(AccessToken)の確立が必要
    await new Promise<void>((resolve) => {
      user.globalSignOut({
        onSuccess: () => resolve(),
        onFailure: () => resolve(),
      });
    });
  } catch {
    // セッション確立自体に失敗(オフライン等)。ローカルのサインアウトは続行する。
  } finally {
    user.signOut();
  }
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
