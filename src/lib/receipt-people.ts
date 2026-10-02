import type { Prisma } from "@prisma/client";
import { normalizeReceiptPersonName } from "./receipt-person-name";

type Person = { id: string; name: string };

export function canonicalReceiptPeople(people: Person[]): Person[] {
  const groups = new Map<string, Person>();
  for (const person of people) {
    const key = normalizeReceiptPersonName(person.name);
    const prior = groups.get(key);
    if (!prior || person.id < prior.id) groups.set(key, person);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function lockReceiptPeople(tx: Prisma.TransactionClient, workspaceId: string) {
  // The transaction-scoped lock covers both creation and scope repair. No schema
  // uniqueness constraint can express our Unicode name equivalence exactly.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt-people:${workspaceId}`}, 0))`;
}

export async function findOrCreateReceiptPerson(tx: Prisma.TransactionClient, workspaceId: string, name: string, people: Person[]) {
  const key = normalizeReceiptPersonName(name);
  const existing = canonicalReceiptPeople(people).find(person => normalizeReceiptPersonName(person.name) === key);
  if (existing) return { person: existing, created: false };
  const person = await tx.receiptPerson.create({ data: { workspaceId, name: name.normalize("NFC").trim().replace(/\s+/g, " ") }, select: { id: true, name: true } });
  people.push(person);
  return { person, created: true };
}
