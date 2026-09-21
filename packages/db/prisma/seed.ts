import prismaClient from "../src";
import { LANGUAGE_MAPPING } from "@repo/common/language";
import { addProblemsInDB } from "./updateQuestion";

async function main() {
  // Languages are a fixed lookup table, so upsert instead of failing on rerun.
  for (const [id, language] of Object.entries(LANGUAGE_MAPPING)) {
    await prismaClient.language.upsert({
      where: { id: language.internal },
      update: { name: id },
      create: { id: language.internal, name: id },
    });
  }
  console.log(`Seeded ${Object.keys(LANGUAGE_MAPPING).length} languages`);

  await addProblemsInDB();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });
