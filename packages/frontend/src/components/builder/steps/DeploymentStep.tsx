import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import {
  deploymentPreferenceLabels,
  deploymentPreferenceDescriptions,
} from '../../../lib/label-maps';
import type { DeploymentPreference } from '@llmstore/shared';

const options = (
  Object.entries(deploymentPreferenceLabels) as [DeploymentPreference, string][]
).map(([value, label]) => ({
  value,
  label,
  description: deploymentPreferenceDescriptions[value],
}));

export function DeploymentStep() {
  const { answers, setDeployment, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Где вы хотите запускать AI?"
      subtitle="Определите предпочтительный способ развёртывания"
      canGoBack={currentStep > 0}
      canGoNext={!!answers.deployment_preference}
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.deployment_preference}
        onChange={setDeployment}
      />
    </WizardStepLayout>
  );
}
