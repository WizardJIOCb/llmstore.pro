import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { usageScaleLabels } from '../../../lib/label-maps';
import type { UsageScale } from '@llmstore/shared';

const options = (Object.entries(usageScaleLabels) as [UsageScale, string][]).map(
  ([value, label]) => ({ value, label }),
);

interface UsageScaleStepProps {
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function UsageScaleStep({ isSubmitting, onSubmit }: UsageScaleStepProps) {
  const { answers, setUsageScale, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Масштаб использования"
      subtitle="Сколько людей будут использовать AI? (можно пропустить)"
      canGoBack={currentStep > 0}
      canGoNext
      isLastStep
      isSubmitting={isSubmitting}
      onBack={goBack}
      onNext={onSubmit}
    >
      <RadioCardGroup
        options={options}
        value={answers.usage_scale}
        onChange={setUsageScale}
      />
    </WizardStepLayout>
  );
}
