import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { privacyRequirementLabels } from '../../../lib/label-maps';
import type { PrivacyRequirement } from '@llmstore/shared';

const options = (Object.entries(privacyRequirementLabels) as [PrivacyRequirement, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function PrivacyStep() {
  const { answers, setPrivacy, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Требования к приватности"
      subtitle="Насколько важна конфиденциальность данных?"
      canGoBack={currentStep > 0}
      canGoNext={!!answers.privacy_requirement}
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.privacy_requirement}
        onChange={setPrivacy}
      />
    </WizardStepLayout>
  );
}
