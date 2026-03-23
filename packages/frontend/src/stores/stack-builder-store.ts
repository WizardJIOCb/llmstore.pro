import { create } from 'zustand';
import type {
  StackBuilderInput,
  StackRecommendation,
  WizardUseCase,
  DeploymentPreference,
  BudgetSensitivity,
  PrivacyRequirement,
  LanguageRequirement,
  CapabilityOption,
  HardwareTier,
  SkillLevel,
  UsageScale,
} from '@llmstore/shared';

export const WIZARD_STEPS = [
  'use_case',
  'deployment',
  'budget',
  'privacy',
  'language',
  'capabilities',
  'hardware',
  'skill_level',
  'usage_scale',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

interface StackBuilderState {
  // Wizard navigation
  currentStep: number;
  // Form answers
  answers: Partial<StackBuilderInput>;
  // Result
  result: StackRecommendation | null;
  isLoading: boolean;
  error: string | null;

  // Actions — navigation
  goToStep: (step: number) => void;
  goNext: () => void;
  goBack: () => void;

  // Actions — form
  setUseCase: (v: WizardUseCase) => void;
  setDeployment: (v: DeploymentPreference) => void;
  setBudget: (v: BudgetSensitivity) => void;
  setPrivacy: (v: PrivacyRequirement) => void;
  setLanguage: (v: LanguageRequirement) => void;
  setCapabilities: (v: CapabilityOption[]) => void;
  setHardware: (v: HardwareTier) => void;
  setSkillLevel: (v: SkillLevel) => void;
  setUsageScale: (v: UsageScale) => void;

  // Actions — result
  setResult: (r: StackRecommendation) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  currentStep: 0,
  answers: {} as Partial<StackBuilderInput>,
  result: null as StackRecommendation | null,
  isLoading: false,
  error: null as string | null,
};

export const useStackBuilderStore = create<StackBuilderState>((set) => ({
  ...initialState,

  goToStep: (step) => set({ currentStep: step }),
  goNext: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, WIZARD_STEPS.length - 1) })),
  goBack: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),

  setUseCase: (v) => set((s) => ({ answers: { ...s.answers, use_case: v } })),
  setDeployment: (v) => set((s) => ({ answers: { ...s.answers, deployment_preference: v } })),
  setBudget: (v) => set((s) => ({ answers: { ...s.answers, budget_sensitivity: v } })),
  setPrivacy: (v) => set((s) => ({ answers: { ...s.answers, privacy_requirement: v } })),
  setLanguage: (v) => set((s) => ({ answers: { ...s.answers, language_requirement: v } })),
  setCapabilities: (v) => set((s) => ({ answers: { ...s.answers, capabilities_needed: v } })),
  setHardware: (v) => set((s) => ({ answers: { ...s.answers, hardware_tier: v } })),
  setSkillLevel: (v) => set((s) => ({ answers: { ...s.answers, skill_level: v } })),
  setUsageScale: (v) => set((s) => ({ answers: { ...s.answers, usage_scale: v } })),

  setResult: (r) => set({ result: r }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),

  reset: () => set(initialState),
}));
