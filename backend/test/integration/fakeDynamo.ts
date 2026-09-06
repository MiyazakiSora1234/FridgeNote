/**
 * DynamoDBDocumentClientの最小限のインメモリ代替。
 * 本プロジェクトが実際に発行するコマンド形状(Put/Get/Update/Delete/Query)のみを
 * サポートする、統合テスト専用の簡易実装であり、DynamoDBの完全な互換実装ではない。
 */
type Item = Record<string, unknown>;

class ConditionalCheckFailedException extends Error {
  name = "ConditionalCheckFailedException";
}

function keyOf(pk: unknown, sk: unknown): string {
  return `${String(pk)}#${String(sk)}`;
}

function resolveAttrName(name: string, names?: Record<string, string>): string {
  return name.startsWith("#") ? (names?.[name] ?? name) : name;
}

export function createFakeDdb() {
  const store = new Map<string, Item>();

  /**
   * 実際のConditionExpressionは "A AND B" のような複合条件になりうる
   * (例: markProcessingの "#status <> :completed AND attribute_not_exists(terminallyFailed)")。
   * 各節を独立に評価してすべて真の場合のみ真とする(このテスト用フェイクはOR等は未対応)。
   */
  function evalCondition(expr: string, existing: Item | undefined, values: Record<string, unknown>): boolean {
    return expr.split(/\s+AND\s+/).every((clause) => evalSingleCondition(clause.trim(), existing, values));
  }

  function evalSingleCondition(expr: string, existing: Item | undefined, values: Record<string, unknown>): boolean {
    const notExistsMatch = /^attribute_not_exists\((\w+)\)$/.exec(expr);
    if (notExistsMatch) {
      const attr = notExistsMatch[1] as string;
      return !existing || existing[attr] === undefined;
    }
    const existsMatch = /^attribute_exists\((\w+)\)$/.exec(expr);
    if (existsMatch) {
      const attr = existsMatch[1] as string;
      return !!existing && existing[attr] !== undefined;
    }
    const neqMatch = /^#(\w+) <> :(\w+)$/.exec(expr);
    if (neqMatch) {
      const [, attr, valKey] = neqMatch;
      return existing?.[attr as string] !== values[`:${valKey}`];
    }
    const eqMatch = /^#?(\w+) = :(\w+)$/.exec(expr);
    if (eqMatch) {
      const [, attr, valKey] = eqMatch;
      return existing?.[attr as string] === values[`:${valKey}`];
    }
    const gteMatch = /^#?(\w+) >= :(\w+)$/.exec(expr);
    if (gteMatch) {
      const [, attr, valKey] = gteMatch;
      const current = Number(existing?.[attr as string] ?? 0);
      const threshold = Number(values[`:${valKey}`]);
      return current >= threshold;
    }
    return true;
  }

  return {
    store,
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name;
      const input = command.input as any;

      switch (name) {
        case "PutCommand": {
          const key = keyOf(input.Item.PK, input.Item.SK);
          const existing = store.get(key);
          if (input.ConditionExpression && !evalCondition(input.ConditionExpression, existing, {})) {
            throw new ConditionalCheckFailedException("condition failed");
          }
          store.set(key, input.Item);
          return {};
        }
        case "GetCommand": {
          const key = keyOf(input.Key.PK, input.Key.SK);
          return { Item: store.get(key) };
        }
        case "DeleteCommand": {
          const key = keyOf(input.Key.PK, input.Key.SK);
          const existing = store.get(key);
          if (input.ConditionExpression && !evalCondition(input.ConditionExpression, existing, {})) {
            throw new ConditionalCheckFailedException("condition failed");
          }
          store.delete(key);
          return {};
        }
        case "UpdateCommand": {
          const key = keyOf(input.Key.PK, input.Key.SK);
          const existing = store.get(key) ?? { PK: input.Key.PK, SK: input.Key.SK };
          if (
            input.ConditionExpression &&
            !evalCondition(input.ConditionExpression, store.get(key), input.ExpressionAttributeValues ?? {})
          ) {
            throw new ConditionalCheckFailedException("condition failed");
          }
          const updated: Item = { ...existing };
          const expr = String(input.UpdateExpression);

          // UpdateExpressionは "SET a = :x, b = :y ADD c :z" のようにSET節・ADD節が
          // 混在しうる(fridgeService.updateFridgeItemのdecrementBy参照)。それぞれ抽出して処理する。
          const setMatch = /SET\s+(.+?)(?=\s+ADD\s|\s+REMOVE\s|\s+DELETE\s|$)/.exec(expr);
          if (setMatch?.[1]) {
            const assignments = setMatch[1].split(",").map((s) => s.trim());
            for (const assignment of assignments) {
              const parts = assignment.split("=").map((s) => s.trim());
              const lhsRaw = parts[0] ?? "";
              const rhsRaw = parts[1] ?? "";
              const attr = resolveAttrName(lhsRaw, input.ExpressionAttributeNames);
              const value = rhsRaw.startsWith(":") ? input.ExpressionAttributeValues[rhsRaw] : rhsRaw;
              updated[attr] = value;
            }
          }

          const addMatch = /ADD\s+(.+?)(?=\s+SET\s|\s+REMOVE\s|\s+DELETE\s|$)/.exec(expr);
          if (addMatch?.[1]) {
            const additions = addMatch[1].split(",").map((s) => s.trim());
            for (const addition of additions) {
              const [attrRaw, valKeyRaw] = addition.split(/\s+/);
              const attr = resolveAttrName(attrRaw ?? "", input.ExpressionAttributeNames);
              const delta = Number(input.ExpressionAttributeValues[valKeyRaw ?? ""]);
              updated[attr] = Number(updated[attr] ?? 0) + delta;
            }
          }

          store.set(key, updated);
          return input.ReturnValues === "ALL_NEW" ? { Attributes: updated } : {};
        }
        case "QueryCommand": {
          const values = input.ExpressionAttributeValues ?? {};
          const expr: string = input.KeyConditionExpression;
          const pkAttr = input.IndexName ? `${input.IndexName}PK` : "PK";
          const skAttr = input.IndexName ? `${input.IndexName}SK` : "SK";
          const pkValue = values[":pk"];
          const beginsWithMatch = /begins_with\(SK, :skPrefix\)/.test(expr);
          const items = [...store.values()].filter((item) => {
            if (item[pkAttr] !== pkValue) return false;
            if (beginsWithMatch) {
              return String(item[skAttr] ?? "").startsWith(String(values[":skPrefix"]));
            }
            return true;
          });
          return { Items: items };
        }
        default:
          throw new Error(`fakeDdb: unsupported command ${name}`);
      }
    },
  };
}
