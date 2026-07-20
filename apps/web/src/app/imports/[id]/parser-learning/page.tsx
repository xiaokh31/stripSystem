import { ParserLearningWizard } from "@/components/parser-learning/parser-learning-wizard";
import { canTrainParserProfiles } from "@/lib/permissions";
import { getServerCurrentUser } from "@/lib/server-auth";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";

export const dynamic = "force-dynamic";

export default async function ParserLearningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [currentUser, locale] = await Promise.all([
    getServerCurrentUser(),
    getServerLocale(),
  ]);
  createTranslator(locale);
  return (
    <ParserLearningWizard
      canTrain={canTrainParserProfiles(currentUser)}
      importId={id}
    />
  );
}
