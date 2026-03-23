import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { CheckboxCardGroup } from '../CheckboxCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { capabilityOptionLabels } from '../../../lib/label-maps';
import type { CapabilityOption } from '@llmstore/shared';

const options = (Object.entries(capabilityOptionLabels) as [CapabilityOption, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function CapabilitiesStep() {
  const { answers, setCapabilities, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Какие возможности нужны?"
      subtitle="Выберите все, что актуально (можно пропустить)"
      canGoBack={currentStep > 0}
      canGoNext
      onBack={goBack}
      onNext={goNext}
    >
      <CheckboxCardGroup
        options={options}
        value={answers.capabilities_needed ?? []}
        onChange={setCapabilities}
        columns={2}
      />
    </WizardStepLayout>
  );
}
