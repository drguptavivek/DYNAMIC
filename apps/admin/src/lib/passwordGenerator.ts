import { faker } from "@faker-js/faker";

function cleanPasswordWord(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned.length >= 5) return cleaned.slice(0, 7);
  return faker.string.alpha({ length: { min: 5, max: 7 }, casing: "lower" });
}

function addInternalCapital(value: string): string {
  const index = faker.number.int({ min: 1, max: value.length - 2 });
  return `${value.slice(0, index)}${value[index].toUpperCase()}${value.slice(index + 1)}`;
}

export function generateStudyPassword(): string {
  const words = [
    cleanPasswordWord(faker.word.adjective()),
    cleanPasswordWord(faker.word.noun()),
    cleanPasswordWord(faker.word.verb()),
  ].map(addInternalCapital);
  const numericCode = faker.number.int({ min: 100, max: 999 });
  return [...words, String(numericCode)].join("-");
}
