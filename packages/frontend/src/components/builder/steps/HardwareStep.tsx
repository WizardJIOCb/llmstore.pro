import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { hardwareTierLabels } from '../../../lib/label-maps';
import type { HardwareTier } from '@llmstore/shared';

const options = (Object.entries(hardwareTierLabels) as [HardwareTier, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function HardwareStep() {
  const { answers, setHardware, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Доступное оборудование"
      subtitle="Какая GPU доступна для локального запуска? (можно пропустить)"
      canGoBack={currentStep > 0}
      canGoNext
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.hardware_tier}
        onChange={setHardware}
      />
    </WizardStepLayout>
  );
}
