import { randomInt } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, isConditionalCheckFailed, TABLE_NAME } from "../lib/dynamo.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { Keys } from "../lib/keys.js";
import type { Household, HouseholdInvite, HouseholdMember } from "../types/index.js";

// 招待コード: 紛らわしい文字(0/O, 1/I/L)を除いた32文字 x 8桁(約1.1e12通り)。
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;
export const INVITE_TTL_SECONDS = 24 * 60 * 60;
export const MAX_HOUSEHOLD_MEMBERS = 10;

// ユーザー1人につき PK=USER#<sub> / SK=PROFILE に所属世帯を持つ。無ければ個人世帯(householdId = sub)。
// 個人世帯のIDをsubと一致させることで、既存データ(PK=USER#<sub>)を移行せずそのまま世帯データとして使える。
export async function getHouseholdId(userId: string): Promise<string> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: Keys.user(userId), SK: Keys.profile() },
      ConsistentRead: true,
    }),
  );
  const householdId = res.Item?.householdId;
  return typeof householdId === "string" && householdId.length > 0 ? householdId : userId;
}

export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

interface MemberRecord {
  userId: string;
  displayName?: string;
  joinedAt?: string;
}

async function listMemberRecords(householdId: string): Promise<MemberRecord[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: { ":pk": Keys.user(householdId), ":skPrefix": Keys.memberPrefix() },
    }),
  );
  return (res.Items ?? []).map((i) => ({
    userId: String(i.userId),
    displayName: typeof i.displayName === "string" ? i.displayName : undefined,
    joinedAt: typeof i.joinedAt === "string" ? i.joinedAt : undefined,
  }));
}

export async function getHousehold(userId: string, householdId: string): Promise<Household> {
  const records = await listMemberRecords(householdId);
  // オーナー(householdId本人)はメンバーレコードを持たない場合がある(個人世帯のまま招待した場合)。
  const byId = new Map(records.map((r) => [r.userId, r]));
  if (!byId.has(householdId)) byId.set(householdId, { userId: householdId });

  const members: HouseholdMember[] = [...byId.values()]
    .map((r) => ({
      userId: r.userId,
      role: r.userId === householdId ? ("owner" as const) : ("member" as const),
      ...(r.displayName ? { displayName: r.displayName } : {}),
      ...(r.joinedAt ? { joinedAt: r.joinedAt } : {}),
      isSelf: r.userId === userId,
    }))
    .sort((a, b) => (a.role === b.role ? (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "") : a.role === "owner" ? -1 : 1));

  return { householdId, role: userId === householdId ? "owner" : "member", members };
}

export async function createInvite(householdId: string): Promise<HouseholdInvite> {
  const expiresEpoch = Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: Keys.invite(code),
            SK: Keys.inviteMetadata(),
            entityType: "HouseholdInvite",
            householdId,
            createdAt: new Date().toISOString(),
            expiresEpoch,
            // DynamoDB TTLの削除は最大48時間遅れるため、有効期限の判定は読み取り時にexpiresEpochで必ず行う。
            ttl: expiresEpoch,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
      return { code, expiresAt: new Date(expiresEpoch * 1000).toISOString() };
    } catch (err) {
      if (!isConditionalCheckFailed(err)) throw err;
    }
  }
  throw new Error("failed to allocate a unique invite code");
}

export async function joinHousehold(userId: string, rawCode: string, displayName?: string): Promise<string> {
  const currentHouseholdId = await getHouseholdId(userId);
  if (currentHouseholdId !== userId) {
    throw ConflictError("already a member of a household; leave it first");
  }
  const ownMembers = await listMemberRecords(userId);
  if (ownMembers.some((m) => m.userId !== userId)) {
    throw ConflictError("your household still has other members; remove them before joining another household");
  }

  const code = normalizeInviteCode(rawCode);
  const invite = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: Keys.invite(code), SK: Keys.inviteMetadata() },
      ConsistentRead: true,
    }),
  );
  const targetId = invite.Item?.householdId;
  const expiresEpoch = Number(invite.Item?.expiresEpoch ?? 0);
  if (typeof targetId !== "string" || expiresEpoch <= Math.floor(Date.now() / 1000)) {
    throw NotFoundError("invalid or expired invite code");
  }
  if (targetId === userId) throw ValidationError("cannot join your own household");

  const targetMembers = await listMemberRecords(targetId);
  const count = new Set([targetId, ...targetMembers.map((m) => m.userId)]).size;
  if (count >= MAX_HOUSEHOLD_MEMBERS) throw ConflictError("household is full");

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // 招待コードは1回限り。同時に使われても片方だけが成功する。
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: { PK: Keys.invite(code), SK: Keys.inviteMetadata() },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: Keys.user(targetId),
                SK: Keys.member(userId),
                entityType: "HouseholdMember",
                userId,
                ...(displayName ? { displayName } : {}),
                joinedAt: new Date().toISOString(),
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: Keys.user(userId),
                SK: Keys.profile(),
                entityType: "UserProfile",
                householdId: targetId,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        ],
      }),
    );
  } catch (err) {
    if (isConditionalCheckFailed(err) || (err as { name?: string }).name === "TransactionCanceledException") {
      throw NotFoundError("invalid or expired invite code");
    }
    throw err;
  }
  return targetId;
}

async function detachMember(householdId: string, memberId: string): Promise<void> {
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: TABLE_NAME, Key: { PK: Keys.user(householdId), SK: Keys.member(memberId) } } },
        // PROFILEを消せば個人世帯(自分のsub)に戻り、参加前のデータが再び見える。
        { Delete: { TableName: TABLE_NAME, Key: { PK: Keys.user(memberId), SK: Keys.profile() } } },
      ],
    }),
  );
}

export async function leaveHousehold(userId: string, householdId: string): Promise<void> {
  if (householdId === userId) {
    throw ConflictError("the household owner cannot leave; remove the other members instead");
  }
  await detachMember(householdId, userId);
}

export async function removeMember(userId: string, householdId: string, targetId: string): Promise<void> {
  if (householdId !== userId) throw ConflictError("only the household owner can remove members");
  if (targetId === userId) throw ValidationError("cannot remove yourself");
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: Keys.user(householdId), SK: Keys.member(targetId) },
      ConsistentRead: true,
    }),
  );
  if (!res.Item) throw NotFoundError("member not found");
  await detachMember(householdId, targetId);
}
