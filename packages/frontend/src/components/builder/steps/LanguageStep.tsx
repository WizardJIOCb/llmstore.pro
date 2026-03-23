import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { languageRequirementLabels } from '../../../lib/label-maps';
import type { LanguageRequirement } from '@llmstore/shared';

const options = (
  Object.entries(languageRequirementLabels) as [LanguageRequirement, string][]
).map(([value, label]) => ({ value, label }));

export function LanguageStep() {
  const { answers, setLanguage, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Основной язык работы"
      subtitle="На каком языке будет взаимодействие с AI?"
      canGoBack={currentStep > 0}
      canGoNext={!!answers.language_requirement}
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.language_requirement}
        onChange={setLanguage}
      />
    </WizardStepLayout>
  );
}
